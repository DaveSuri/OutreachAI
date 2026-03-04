import { DraftStatus, LeadStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateDraftResponse } from "@/lib/ai/openai";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/resend";
import { events } from "@/lib/events";
import { inngest } from "@/lib/inngest";

const simulateReplySchema = z.object({
  leadId: z.string().min(1),
  subject: z.string().optional(),
  textBody: z.string().optional()
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = simulateReplySchema.parse(body);

    const lead = await prisma.lead.findUnique({
      where: { id: payload.leadId },
      select: {
        id: true,
        email: true,
        campaignId: true,
        status: true,
        repliedAt: true
      }
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const now = new Date();
    const update = await prisma.lead.updateMany({
      where: {
        id: lead.id,
        repliedAt: null
      },
      data: {
        status: LeadStatus.REPLIED,
        repliedAt: now,
        version: {
          increment: 1
        }
      }
    });

    if (update.count > 0) {
      const incoming = payload.textBody || "Hi, thanks for the outreach. This is a simulated inbound reply used for testing.";
      const generated = await generateDraftResponse({
        incomingEmail: incoming,
        leadName: lead.email,
        company: undefined
      });

      const existingDraft = await prisma.draftResponse.findFirst({
        where: {
          leadId: lead.id,
          incomingEmail: incoming,
          status: DraftStatus.PENDING_APPROVAL
        },
        select: {
          id: true
        }
      });

      const draftId =
        existingDraft?.id ||
        (
          await prisma.draftResponse.create({
            data: {
              leadId: lead.id,
              incomingEmail: incoming,
              generatedSubject: generated.subject,
              generatedBody: generated.body,
              status: DraftStatus.PENDING_APPROVAL
            },
            select: {
              id: true
            }
          })
        ).id;

      if (process.env.ALERT_EMAIL_TO) {
        await sendEmail({
          to: process.env.ALERT_EMAIL_TO,
          subject: `New Reply from ${lead.email} (Simulated)`,
          html: `<p>Draft ready for review. Draft ID: ${draftId}</p>`
        });
      }

      await inngest.send({
        name: events.leadReplyReceived,
        data: {
          leadId: lead.id,
          campaignId: lead.campaignId,
          fromEmail: lead.email,
          subject: payload.subject || "Simulated reply",
          textBody: incoming,
          messageId: `sim_${Date.now()}`
        }
      });
    }

    return NextResponse.json({
      simulated: true,
      leadId: lead.id,
      updated: update.count > 0
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to simulate reply" },
      { status: 400 }
    );
  }
}
