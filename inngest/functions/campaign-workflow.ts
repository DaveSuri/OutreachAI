import { EmailDeliveryStatus, LeadStatus, Prisma, SequenceStepType } from "@prisma/client";
import { generateColdEmail } from "@/lib/ai/openai";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/resend";
import { events } from "@/lib/events";
import { inngest } from "@/lib/inngest";
import { runAiResearch } from "@/lib/workflows/research";

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export const campaignWorkflow = inngest.createFunction(
  {
    id: "campaign-workflow",
    concurrency: {
      limit: 5
    },
    throttle: {
      limit: 5,
      period: "1m"
    }
  },
  { event: events.campaignStart },
  async ({ event, step }) => {
    const { leadId } = event.data;

    const leadWithCampaign = await step.run("load-lead-and-sequence", async () => {
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

    if (!leadWithCampaign) {
      return { ok: false, reason: "LEAD_NOT_FOUND" };
    }

    await step.run("set-lead-in-sequence", async () => {
      await prisma.lead.updateMany({
        where: {
          id: leadId,
          repliedAt: null,
          status: {
            not: LeadStatus.REPLIED
          }
        },
        data: {
          status: LeadStatus.IN_SEQUENCE
        }
      });
    });

    for (const sequenceStep of leadWithCampaign.campaign.sequenceSteps) {
      const guard = await step.run(`guard-step-${sequenceStep.order}`, async () => {
        return prisma.lead.findUnique({
          where: { id: leadId },
          select: {
            id: true,
            status: true,
            repliedAt: true,
            version: true,
            firstName: true,
            lastName: true,
            company: true,
            aiContext: true
          }
        });
      });

      if (!guard || guard.status === LeadStatus.REPLIED || guard.repliedAt) {
        return {
          ok: true,
          stopped: true,
          reason: "LEAD_REPLIED"
        };
      }

      if (sequenceStep.type === SequenceStepType.AI_RESEARCH) {
        const researchContext = await step.run(`research-${sequenceStep.order}`, async () => {
          return runAiResearch(sequenceStep.researchPrompt, {
            firstName: guard.firstName,
            lastName: guard.lastName,
            company: guard.company
          });
        });

        await step.run(`save-research-${sequenceStep.order}`, async () => {
          const baseContext =
            guard.aiContext && typeof guard.aiContext === "object" && !Array.isArray(guard.aiContext)
              ? (guard.aiContext as Record<string, unknown>)
              : {};

          await prisma.lead.update({
            where: { id: leadId },
            data: {
              aiContext: toPrismaJson({ ...baseContext, research: researchContext }),
              engagementScore: {
                increment: 5
              },
              version: {
                increment: 1
              }
            }
          });
        });
      }

      if (sequenceStep.type === SequenceStepType.EMAIL) {
        const generated = await step.run(`generate-email-${sequenceStep.order}`, async () => {
          return generateColdEmail({
            firstName: guard.firstName,
            lastName: guard.lastName,
            company: guard.company,
            template: sequenceStep.template,
            aiContext: guard.aiContext
          });
        });

        await step.run(`send-email-${sequenceStep.order}`, async () => {
          const sendResult = await sendEmail({
            to: leadWithCampaign.email,
            subject: generated.subject,
            html: generated.body.replace(/\n/g, "<br />")
          });

          const success = await prisma.$transaction(async (tx) => {
            const update = await tx.lead.updateMany({
              where: {
                id: leadId,
                status: {
                  not: LeadStatus.REPLIED
                },
                repliedAt: null,
                version: guard.version
              },
              data: {
                lastEmailedAt: new Date(),
                messageId: sendResult.id,
                status: LeadStatus.IN_SEQUENCE,
                version: {
                  increment: 1
                }
              }
            });

            if (update.count === 0) {
              return false;
            }

            await tx.emailLog.create({
              data: {
                leadId,
                subject: generated.subject,
                body: generated.body,
                stepName: `STEP_${sequenceStep.order}`,
                status: EmailDeliveryStatus.sent,
                messageId: sendResult.id
              }
            });

            return true;
          });

          if (!success) {
            return {
              ok: false,
              reason: "LEAD_STATE_CHANGED"
            };
          }

          return {
            ok: true,
            messageId: sendResult.id
          };
        });
      }

      if (sequenceStep.type === SequenceStepType.WAIT && sequenceStep.delayMinutes && sequenceStep.delayMinutes > 0) {
        await step.sleep(`sleep-${sequenceStep.order}`, `${sequenceStep.delayMinutes}m`);

        const postSleepLead = await step.run(`post-sleep-guard-${sequenceStep.order}`, async () => {
          return prisma.lead.findUnique({
            where: { id: leadId },
            select: {
              status: true,
              repliedAt: true
            }
          });
        });

        if (!postSleepLead || postSleepLead.status === LeadStatus.REPLIED || postSleepLead.repliedAt) {
          return {
            ok: true,
            interrupted: true,
            reason: "REPLY_RECEIVED_DURING_WAIT"
          };
        }
      }
    }

    await step.run("mark-lead-complete", async () => {
      await prisma.lead.updateMany({
        where: {
          id: leadId,
          repliedAt: null,
          status: {
            not: LeadStatus.REPLIED
          }
        },
        data: {
          status: LeadStatus.COMPLETED,
          version: {
            increment: 1
          }
        }
      });
    });

    return { ok: true };
  }
);
