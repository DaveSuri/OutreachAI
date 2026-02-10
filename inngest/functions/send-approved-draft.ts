import { DraftStatus, EmailDeliveryStatus, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/resend";
import { events } from "@/lib/events";
import { inngest } from "@/lib/inngest";

export const sendApprovedDraftWorkflow = inngest.createFunction(
  {
    id: "send-approved-draft",
    throttle: {
      limit: 5,
      period: "1m"
    }
  },
  { event: events.draftApproved },
  async ({ event, step }) => {
    const { draftId } = event.data;

    const draft = await step.run("load-draft", async () => {
      return prisma.draftResponse.findUnique({
        where: { id: draftId },
        include: {
          lead: true
        }
      });
    });

    if (!draft) {
      return { ok: false, reason: "DRAFT_NOT_FOUND" };
    }

    if (draft.status !== DraftStatus.PENDING_APPROVAL) {
      return {
        ok: true,
        skipped: true,
        reason: "DRAFT_ALREADY_RESOLVED"
      };
    }

    if (draft.lead.repliedAt && draft.lead.repliedAt > draft.createdAt) {
      await step.run("mark-draft-stale", async () => {
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

    const sendResult = await step.run("send-approved-email", async () => {
      return sendEmail({
        to: draft.lead.email,
        subject: draft.generatedSubject,
        html: draft.generatedBody.replace(/\n/g, "<br />")
      });
    });

    await step.run("mark-approved-and-contacted", async () => {
      await prisma.$transaction(async (tx) => {
        await tx.draftResponse.update({
          where: { id: draft.id },
          data: {
            status: DraftStatus.APPROVED
          }
        });

        await tx.lead.update({
          where: { id: draft.leadId },
          data: {
            status: LeadStatus.CONTACTED,
            lastEmailedAt: new Date(),
            messageId: sendResult.id,
            version: {
              increment: 1
            }
          }
        });

        await tx.emailLog.create({
          data: {
            leadId: draft.leadId,
            subject: draft.generatedSubject,
            body: draft.generatedBody,
            stepName: "APPROVED_DRAFT",
            status: EmailDeliveryStatus.sent,
            messageId: sendResult.id
          }
        });
      });
    });

    return {
      ok: true,
      messageId: sendResult.id
    };
  }
);
