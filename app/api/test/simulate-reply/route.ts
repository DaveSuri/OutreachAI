import { LeadStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
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
      await inngest.send({
        name: events.leadReplyReceived,
        data: {
          leadId: lead.id,
          campaignId: lead.campaignId,
          fromEmail: lead.email,
          subject: payload.subject || "Simulated reply",
          textBody:
            payload.textBody || "Hi, thanks for the outreach. This is a simulated inbound reply used for testing.",
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
