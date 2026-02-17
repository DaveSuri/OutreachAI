import { LeadStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { events } from "@/lib/events";
import { inngest } from "@/lib/inngest";

const aiGenerateSchema = z.object({
  leadId: z.string().min(1),
  template: z.string().optional()
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = aiGenerateSchema.parse(body);

    const lead = await prisma.lead.findUnique({
      where: { id: payload.leadId },
      select: {
        id: true,
        campaignId: true,
        status: true,
        repliedAt: true
      }
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.status === LeadStatus.REPLIED || lead.repliedAt) {
      return NextResponse.json({ error: "Cannot generate draft for replied lead" }, { status: 409 });
    }

    await inngest.send({
      name: events.aiDraftGenerate,
      data: {
        leadId: lead.id,
        campaignId: lead.campaignId,
        template: payload.template,
        requestedBy: "dashboard_user"
      }
    });

    return NextResponse.json({
      queued: true,
      leadId: lead.id
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to queue draft generation" },
      { status: 400 }
    );
  }
}
