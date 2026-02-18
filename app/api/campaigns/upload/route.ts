import { CampaignStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { parseUploadPayload } from "@/lib/schemas/upload";

export const dynamic = "force-dynamic";

const DEFAULT_MAX_UPLOAD_LEADS = 5000;
const EVENT_BATCH_SIZE = 250;

function resolveMaxUploadLeads(): number {
  const parsed = Number.parseInt(process.env.MAX_UPLOAD_LEADS ?? `${DEFAULT_MAX_UPLOAD_LEADS}`, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_MAX_UPLOAD_LEADS;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { campaignId, leads } = parseUploadPayload(body);

    if (leads.length === 0) {
      return NextResponse.json({ error: "No valid leads in payload" }, { status: 400 });
    }

    const maxUploadLeads = resolveMaxUploadLeads();
    if (leads.length > maxUploadLeads) {
      return NextResponse.json(
        { error: `Upload too large. Max ${maxUploadLeads} leads per request.` },
        { status: 413 }
      );
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
      for (const batch of chunkArray(createdLeadIds, EVENT_BATCH_SIZE)) {
        await inngest.send(
          batch.map((leadId) => ({
            name: events.campaignStart,
            data: {
              campaignId,
              leadId
            }
          }))
        );
      }
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
