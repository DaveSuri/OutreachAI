import { EmailDeliveryStatus, LeadStatus } from "@prisma/client";
import { NonRetriableError } from "inngest";
import { prisma } from "@/src/lib/db";
import { inngest } from "@/src/lib/inngest";
import { sendResendEmail } from "@/src/lib/resend";

type CampaignStartEvent = {
  name: "campaign/start";
  data: {
    campaignId: string;
    leadId: string;
    waitDuration?: string;
  };
};

export const processCampaign = inngest.createFunction(
  { id: "process-campaign" },
  { event: "campaign/start" },
  async ({ event, step }) => {
    const { campaignId, leadId } = event.data as CampaignStartEvent["data"];
    const waitDuration = event.data.waitDuration || "2 days";

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

    await step.run("send-email-2", async () => {
      const followupBody = [
        `Hi ${lead.name || "there"},`,
        "",
        "Following up in case my first note got buried. I can share a simple outreach playbook that usually lifts reply rates in one week.",
        "",
        "Worth a quick 10-minute call?",
        "",
        "Best,",
        "Outreach AI"
      ].join("\n");

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

export const inngestFunctions = [processCampaign];
