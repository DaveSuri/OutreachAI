import { LeadStatus } from "@prisma/client";
import { analyzeReplySentiment, generateDraftResponse } from "@/lib/ai/openai";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/resend";
import { events } from "@/lib/events";
import { inngest } from "@/lib/inngest";

export const replyHandlingWorkflow = inngest.createFunction(
  {
    id: "reply-handling",
    throttle: {
      limit: 5,
      period: "1m"
    }
  },
  { event: events.leadReplyReceived },
  async ({ event, step }) => {
    const { leadId, textBody } = event.data;

    const lead = await step.run("load-lead", async () => {
      return prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          email: true,
          campaignId: true,
          engagementScore: true
        }
      });
    });

    if (!lead) {
      return { ok: false, reason: "LEAD_NOT_FOUND" };
    }

    const sentiment = await step.run("sentiment-analysis", async () => {
      return analyzeReplySentiment(textBody);
    });

    const generated = await step.run("draft-generation", async () => {
      return generateDraftResponse({
        incomingEmail: textBody,
        leadName: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || undefined,
        company: lead.company || undefined
      });
    });

    const draft = await step.run("create-draft", async () => {
      return prisma.$transaction(async (tx) => {
        const created = await tx.draftResponse.create({
          data: {
            leadId,
            incomingEmail: textBody,
            generatedSubject: generated.subject,
            generatedBody: generated.body
          }
        });

        await tx.lead.update({
          where: { id: leadId },
          data: {
            status: LeadStatus.REPLIED,
            engagementScore: {
              increment: sentiment === "positive" ? 20 : sentiment === "negative" ? -10 : 5
            },
            version: {
              increment: 1
            }
          }
        });

        return created;
      });
    });

    await step.run("notify-admin", async () => {
      if (!process.env.ALERT_EMAIL_TO) {
        return;
      }

      await sendEmail({
        to: process.env.ALERT_EMAIL_TO,
        subject: `New Reply from ${lead.company || lead.email}`,
        html: [
          `<p>A lead has replied and a draft is waiting for review.</p>`,
          `<p><strong>Lead:</strong> ${lead.email}</p>`,
          `<p><strong>Draft ID:</strong> ${draft.id}</p>`,
          `<p><strong>Sentiment:</strong> ${sentiment}</p>`
        ].join("")
      });
    });

    return {
      ok: true,
      draftId: draft.id,
      sentiment
    };
  }
);
