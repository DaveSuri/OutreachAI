import { CampaignStatus, LeadStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { events } from "@/lib/events";
import { inngest } from "@/lib/inngest";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;

    // Get campaign with its leads
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        leads: {
          where: {
            status: {
              in: [LeadStatus.PENDING, LeadStatus.IN_SEQUENCE]
            }
          },
          select: {
            id: true
          }
        },
        sequenceSteps: true
      }
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.status === CampaignStatus.ACTIVE) {
      return NextResponse.json({ 
        error: "Campaign is already active",
        leadsCount: campaign.leads.length 
      }, { status: 400 });
    }

    if (campaign.leads.length === 0) {
      return NextResponse.json({ 
        error: "No leads in campaign. Import leads first." 
      }, { status: 400 });
    }

    // Activate campaign and trigger workflow for all leads
    await prisma.$transaction(async (tx) => {
      // Update campaign status
      await tx.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.ACTIVE }
      });

      // Update all leads to IN_SEQUENCE
      await tx.lead.updateMany({
        where: {
          id: { in: campaign.leads.map(l => l.id) },
          status: LeadStatus.PENDING
        },
        data: { status: LeadStatus.IN_SEQUENCE }
      });
    });

    // Trigger Inngest workflow for each lead
    const leadIds = campaign.leads.map(l => l.id);
    await inngest.send(
      leadIds.map((leadId) => ({
        name: events.campaignStart,
        data: {
          campaignId,
          leadId
        }
      }))
    );

    return NextResponse.json({
      success: true,
      campaignId,
      leadsTriggered: leadIds.length,
      message: `Campaign activated and ${leadIds.length} lead(s) queued for processing`
    });

  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Activation failed" },
      { status: 500 }
    );
  }
}
