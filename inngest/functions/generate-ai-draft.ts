import { DraftStatus, LeadStatus, SequenceStepType } from "@prisma/client";
import { generateColdEmail } from "@/lib/ai/openai";
import { prisma } from "@/lib/db/prisma";
import { events } from "@/lib/events";
import { inngest } from "@/lib/inngest";

export const generateAiDraftWorkflow = inngest.createFunction(
  {
    id: "generate-ai-draft",
    throttle: {
      limit: 10,
      period: "1m"
    }
  },
  { event: events.aiDraftGenerate },
  async ({ event, step }) => {
    const { leadId, template } = event.data;

    const lead = await step.run("load-lead-for-draft", async () => {
      return prisma.lead.findUnique({
        where: { id: leadId },
        include: {
          campaign: {
            include: {
              sequenceSteps: {
                orderBy: { order: "asc" }
              }
            }
          }
        }
      });
    });

    if (!lead) {
      return { ok: false, reason: "LEAD_NOT_FOUND" };
    }

    if (lead.status === LeadStatus.REPLIED || lead.repliedAt) {
      return { ok: true, skipped: true, reason: "LEAD_ALREADY_REPLIED" };
    }

    const emailStepTemplate =
      lead.campaign.sequenceSteps.find((stepItem) => stepItem.type === SequenceStepType.EMAIL)?.template || undefined;

    const generated = await step.run("generate-draft-content", async () => {
      return generateColdEmail({
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        aiContext: lead.aiContext,
        template: template || emailStepTemplate
      });
    });

    const draft = await step.run("persist-generated-draft", async () => {
      return prisma.draftResponse.create({
        data: {
          leadId: lead.id,
          incomingEmail: null,
          generatedSubject: generated.subject,
          generatedBody: generated.body,
          status: DraftStatus.PENDING_APPROVAL
        },
        select: {
          id: true
        }
      });
    });

    return {
      ok: true,
      draftId: draft.id
    };
  }
);
