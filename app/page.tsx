import { DraftStatus } from "@prisma/client";
import { OutreachWorkspace } from "@/components/OutreachWorkspace";
import { prisma } from "@/lib/db/prisma";
import { getDashboardStats } from "@/lib/voice-tools";

export const dynamic = "force-dynamic";

async function loadWorkspaceData() {
  const [stats, campaigns, leads, pendingDrafts] = await Promise.all([
    getDashboardStats(),
    prisma.campaign.findMany({
      include: {
        _count: {
          select: {
            leads: true,
            sequenceSteps: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.lead.findMany({
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                sequenceSteps: true
              }
            }
          }
        },
        _count: {
          select: {
            emailLogs: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 120
    }),
    prisma.draftResponse.findMany({
      where: {
        status: DraftStatus.PENDING_APPROVAL
      },
      include: {
        lead: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            company: true,
            campaign: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 50
    })
  ]);

  return {
    stats,
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      type: campaign.type,
      createdAt: campaign.createdAt.toISOString(),
      stepCount: campaign._count.sequenceSteps,
      leadsCount: campaign._count.leads
    })),
    leads: leads.map((lead) => ({
      id: lead.id,
      campaignId: lead.campaignId,
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      status: lead.status,
      engagementScore: lead.engagementScore,
      repliedAt: lead.repliedAt?.toISOString() ?? null,
      lastEmailedAt: lead.lastEmailedAt?.toISOString() ?? null,
      emailLogCount: lead._count.emailLogs,
      campaign: {
        id: lead.campaign.id,
        name: lead.campaign.name,
        stepCount: lead.campaign._count.sequenceSteps
      }
    })),
    pendingDrafts: pendingDrafts.map((draft) => ({
      id: draft.id,
      createdAt: draft.createdAt.toISOString(),
      incomingEmail: draft.incomingEmail,
      generatedSubject: draft.generatedSubject,
      generatedBody: draft.generatedBody,
      lead: {
        id: draft.lead.id,
        email: draft.lead.email,
        firstName: draft.lead.firstName,
        lastName: draft.lead.lastName,
        company: draft.lead.company,
        campaign: {
          id: draft.lead.campaign.id,
          name: draft.lead.campaign.name
        }
      }
    }))
  };
}

export default async function HomePage() {
  const data = await loadWorkspaceData();
  return <OutreachWorkspace data={data} />;
}
