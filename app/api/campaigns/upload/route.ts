import { CampaignStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { parseUploadPayload } from "@/lib/schemas/upload";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { campaignId, leads } = parseUploadPayload(body);

    if (leads.length === 0) {
      return NextResponse.json({ error: "No valid leads in payload" }, { status: 400 });
    }

    // Dynamic imports to avoid build-time database connection
    const [{ prisma }, { events }, { inngest }] = await Promise.all([
      import("@/lib/db/prisma"),
      import("@/lib/events"),
      import("@/lib/inngest")
    ]);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, status: true }
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const createdLeadIds: string[] = [];
    const updatedLeadIds: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const lead of leads) {
        const existing = await tx.lead.findUnique({
          where: {
            email_campaignId: {
              email: lead.email,
              campaignId
            }
          },
          select: {
            id: true
          }
        });

        if (existing) {
          await tx.lead.update({
            where: { id: existing.id },
            data: {
              firstName: lead.firstName,
              lastName: lead.lastName,
              company: lead.company
            }
          });
          updatedLeadIds.push(existing.id);
          continue;
        }

        const created = await tx.lead.create({
          data: {
            campaignId,
            email: lead.email,
            firstName: lead.firstName,
            lastName: lead.lastName,
            company: lead.company
          },
          select: {
            id: true
          }
        });

        createdLeadIds.push(created.id);
      }

      if (campaign.status === CampaignStatus.DRAFT && createdLeadIds.length > 0) {
        await tx.campaign.update({
          where: { id: campaignId },
          data: {
            status: CampaignStatus.ACTIVE
          }
        });
      }
    });

    if (createdLeadIds.length > 0) {
      await inngest.send(
        createdLeadIds.map((leadId) => ({
          name: events.campaignStart,
          data: {
            campaignId,
            leadId
          }
        }))
      );
    }

    return NextResponse.json({
      campaignId,
      ingested: leads.length,
      created: createdLeadIds.length,
      updated: updatedLeadIds.length
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload failed"
      },
      {
        status: 400
      }
    );
  }
}
