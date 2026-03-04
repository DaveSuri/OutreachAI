import { DraftStatus, EmailDeliveryStatus, LeadStatus } from "@prisma/client";
import { NonRetriableError } from "inngest";
import { prisma } from "@/src/lib/db";
import { inngest } from "@/src/lib/inngest";
import { generateReplyDraft, generateThinkingInsight } from "@/src/lib/openai";
import { sendResendEmail } from "@/src/lib/resend";

type CampaignStartEvent = {
  name: "campaign/start";
  data: {
    campaignId: string;
    leadId: string;
    waitDuration?: string;
    enableThinking?: boolean;
    thinkingPrompt?: string;
  };
};

type LeadReplyReceivedEvent = {
  name: "lead/reply.received";
  data: {
    leadId: string;
    campaignId: string;
    fromEmail: string;
    subject?: string;
    textBody?: string;
    messageId?: string;
  };
};

type DraftApprovedEvent = {
  name: "draft/approved";
  data: {
    draftId: string;
    approvedBy?: string;
  };
};

function stripHtmlTags(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export const processCampaign = inngest.createFunction(
  { id: "process-campaign" },
  { event: "campaign/start" },
  async ({ event, step }) => {
    const { campaignId, leadId } = event.data as CampaignStartEvent["data"];
    const waitDuration = event.data.waitDuration || "2 days";
    const enableThinking = Boolean(event.data.enableThinking);
    const thinkingPrompt = event.data.thinkingPrompt || "";

    const lead = await step.run("load-lead", async () => {
      return prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          email: true,
          name: true,
          company: true,
          aiDraft: true,
          status: true,
          repliedAt: true
        }
      });
    });

    if (!lead) {
      throw new NonRetriableError("Lead not found");
    }

    if (lead.status === LeadStatus.REPLIED || lead.repliedAt) {
      throw new NonRetriableError("Campaign Stopped");
    }

    const firstBody = lead.aiDraft || `Hi ${lead.name || "there"},\n\nQuick idea for ${lead.company || "your team"}. Open to a short chat?\n\nBest,\nOutreach AI`;

    await step.run("send-email-1", async () => {
      const sent = await sendResendEmail({
        to: lead.email,
        subject: `Quick idea for ${lead.company || "your team"}`,
        html: firstBody.replace(/\n/g, "<br />")
      });

      await prisma.$transaction(async (tx) => {
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            status: LeadStatus.SENT,
            lastEmailedAt: new Date(),
            messageId: sent.id
          }
        });

        await tx.emailLog.create({
          data: {
            leadId: lead.id,
            status: EmailDeliveryStatus.sent,
            sentAt: new Date(),
            messageId: sent.id,
            subject: `Quick idea for ${lead.company || "your team"}`,
            body: firstBody,
            stepName: "EMAIL_1"
          }
        });
      });
    });

    await step.sleep("wait-duration", waitDuration);

    const canContinue = await step.run("check-then-act-safety-lock", async () => {
      // Race-condition safety lock:
      // The lead may have replied while this workflow was sleeping.
      // We must re-check state atomically in the DB before sending follow-up.
      const latestLead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          status: true,
          repliedAt: true
        }
      });

      if (!latestLead) {
        return false;
      }

      if (latestLead.status === LeadStatus.REPLIED || latestLead.repliedAt) {
        return false;
      }

      return true;
    });

    if (!canContinue) {
      await step.run("mark-stopped", async () => {
        await prisma.lead.updateMany({
          where: {
            id: leadId,
            status: {
              not: LeadStatus.REPLIED
            }
          },
          data: {
            status: LeadStatus.STOPPED
          }
        });
      });

      throw new NonRetriableError("Campaign Stopped");
    }

    const thinkingNote = enableThinking
      ? await step.run("ai-thinking-between-emails", async () => {
          const latest = await prisma.lead.findUnique({
            where: { id: leadId },
            select: {
              name: true,
              company: true,
              aiDraft: true
            }
          });

          return generateThinkingInsight({
            name: latest?.name ?? lead.name,
            company: latest?.company ?? lead.company,
            priorDraft: latest?.aiDraft ?? lead.aiDraft,
            prompt: thinkingPrompt
          });
        })
      : null;

    await step.run("send-email-2", async () => {
      const followupGuard = await prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          status: true,
          repliedAt: true
        }
      });

      if (!followupGuard || followupGuard.status === LeadStatus.REPLIED || followupGuard.repliedAt) {
        throw new NonRetriableError("Campaign Stopped");
      }

      const followupLines = [`Hi ${lead.name || "there"},`, ""];
      if (thinkingNote) {
        followupLines.push(thinkingNote, "");
      }

      followupLines.push(
        "Following up in case my first note got buried. I can share a simple outreach playbook that usually lifts reply rates in one week.",
        "",
        "Worth a quick 10-minute call?",
        "",
        "Best,",
        "Outreach AI"
      );

      const followupBody = followupLines.join("\n");

      const sent = await sendResendEmail({
        to: lead.email,
        subject: `Follow-up: idea for ${lead.company || "your team"}`,
        html: followupBody.replace(/\n/g, "<br />")
      });

      await prisma.$transaction(async (tx) => {
        await tx.lead.update({
          where: { id: leadId },
          data: {
            status: LeadStatus.SENT,
            lastEmailedAt: new Date(),
            messageId: sent.id
          }
        });

        await tx.emailLog.create({
          data: {
            leadId,
            status: EmailDeliveryStatus.sent,
            sentAt: new Date(),
            messageId: sent.id,
            subject: `Follow-up: idea for ${lead.company || "your team"}`,
            body: followupBody,
            stepName: "EMAIL_2"
          }
        });
      });
    });

    return { ok: true, campaignId, leadId };
  }
);

export const replyHandling = inngest.createFunction(
  { id: "reply-handling" },
  { event: "lead/reply.received" },
  async ({ event, step }) => {
    const payload = event.data as LeadReplyReceivedEvent["data"];
    const incomingText = (payload.textBody || "").trim();

    const lead = await step.run("load-lead-for-reply", async () => {
      return prisma.lead.findUnique({
        where: { id: payload.leadId },
        select: {
          id: true,
          campaignId: true,
          email: true,
          name: true,
          company: true,
          repliedAt: true
        }
      });
    });

    if (!lead) {
      throw new NonRetriableError("Lead not found");
    }

    const existingDraft = await step.run("find-existing-pending-draft", async () => {
      return prisma.draftResponse.findFirst({
        where: {
          leadId: lead.id,
          incomingEmail: incomingText || null,
          status: DraftStatus.PENDING_APPROVAL
        },
        select: {
          id: true
        },
        orderBy: {
          createdAt: "desc"
        }
      });
    });

    if (existingDraft) {
      return {
        ok: true,
        leadId: lead.id,
        draftId: existingDraft.id,
        deduped: true
      };
    }

    const generated = await step.run("generate-reply-draft", async () => {
      return generateReplyDraft({
        incomingEmail: incomingText || "Lead replied with an empty body.",
        leadName: lead.name,
        company: lead.company
      });
    });

    const draft = await step.run("persist-reply-draft", async () => {
      return prisma.$transaction(async (tx) => {
        const created = await tx.draftResponse.create({
          data: {
            leadId: lead.id,
            incomingEmail: incomingText || null,
            generatedSubject: generated.subject,
            generatedBody: generated.body,
            status: DraftStatus.PENDING_APPROVAL
          },
          select: {
            id: true
          }
        });

        await tx.lead.update({
          where: { id: lead.id },
          data: {
            status: LeadStatus.REPLIED,
            repliedAt: lead.repliedAt ?? new Date(),
            engagementScore: {
              increment: 10
            },
            version: {
              increment: 1
            }
          }
        });

        return created;
      });
    });

    await step.run("notify-admin-on-reply", async () => {
      if (!process.env.ALERT_EMAIL_TO) {
        return;
      }

      const preview = incomingText ? incomingText.slice(0, 400) : "No reply body provided.";
      const details = [
        `<p><strong>Lead:</strong> ${lead.email}</p>`,
        `<p><strong>Campaign ID:</strong> ${lead.campaignId}</p>`,
        `<p><strong>Draft ID:</strong> ${draft.id}</p>`,
        `<p><strong>Incoming Subject:</strong> ${payload.subject || "N/A"}</p>`,
        `<p><strong>Incoming Message Preview:</strong> ${stripHtmlTags(preview)}</p>`
      ].join("");

      await sendResendEmail({
        to: process.env.ALERT_EMAIL_TO,
        subject: `New Reply from ${lead.company || lead.email} - Draft ready`,
        html: details
      });
    });

    return {
      ok: true,
      leadId: lead.id,
      draftId: draft.id
    };
  }
);

export const sendApprovedDraft = inngest.createFunction(
  { id: "send-approved-draft" },
  { event: "draft/approved" },
  async ({ event, step }) => {
    const payload = event.data as DraftApprovedEvent["data"];

    const draft = await step.run("load-approved-draft", async () => {
      return prisma.draftResponse.findUnique({
        where: {
          id: payload.draftId
        },
        include: {
          lead: {
            select: {
              id: true,
              email: true,
              repliedAt: true,
              status: true
            }
          }
        }
      });
    });

    if (!draft) {
      throw new NonRetriableError("Draft not found");
    }

    if (draft.status !== DraftStatus.PENDING_APPROVAL) {
      return {
        ok: true,
        skipped: true,
        reason: "DRAFT_ALREADY_RESOLVED"
      };
    }

    const stale = await step.run("final-stale-check", async () => {
      const latestLead = await prisma.lead.findUnique({
        where: { id: draft.leadId },
        select: {
          repliedAt: true
        }
      });

      if (!latestLead?.repliedAt) {
        return false;
      }

      return latestLead.repliedAt > new Date(draft.createdAt);
    });

    if (stale) {
      await step.run("reject-stale-draft", async () => {
        await prisma.draftResponse.update({
          where: { id: draft.id },
          data: {
            status: DraftStatus.REJECTED
          }
        });
      });

      return {
        ok: true,
        skipped: true,
        reason: "NEWER_REPLY_ARRIVED"
      };
    }

    const sent = await step.run("send-approved-reply", async () => {
      return sendResendEmail({
        to: draft.lead.email,
        subject: draft.generatedSubject,
        html: draft.generatedBody.replace(/\n/g, "<br />")
      });
    });

    await step.run("mark-approved-and-log", async () => {
      await prisma.$transaction(async (tx) => {
        await tx.draftResponse.update({
          where: { id: draft.id },
          data: {
            status: DraftStatus.APPROVED
          }
        });

        await tx.lead.update({
          where: { id: draft.lead.id },
          data: {
            status: LeadStatus.CONTACTED,
            lastEmailedAt: new Date(),
            messageId: sent.id,
            version: {
              increment: 1
            }
          }
        });

        await tx.emailLog.create({
          data: {
            leadId: draft.lead.id,
            status: EmailDeliveryStatus.sent,
            sentAt: new Date(),
            messageId: sent.id,
            subject: draft.generatedSubject,
            body: draft.generatedBody,
            stepName: "APPROVED_DRAFT"
          }
        });
      });
    });

    return {
      ok: true,
      messageId: sent.id
    };
  }
);

export const inngestFunctions = [processCampaign, replyHandling, sendApprovedDraft];
