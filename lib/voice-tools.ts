import { CampaignStatus, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function getDashboardStats() {
  const [activeCampaigns, totalLeads, repliedLeads] = await Promise.all([
    prisma.campaign.count({
      where: {
        status: CampaignStatus.ACTIVE
      }
    }),
    prisma.lead.count(),
    prisma.lead.count({
      where: {
        status: LeadStatus.REPLIED
      }
    })
  ]);

  return {
    active_campaigns: activeCampaigns,
    total_leads: totalLeads,
    reply_rate: totalLeads > 0 ? Number(((repliedLeads / totalLeads) * 100).toFixed(2)) : 0
  };
}

export async function queryHotLeads() {
  const leads = await prisma.lead.findMany({
    where: {
      OR: [{ engagementScore: { gt: 80 } }, { status: LeadStatus.REPLIED }]
    },
    orderBy: [{ engagementScore: "desc" }, { updatedAt: "desc" }],
    take: 25,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      company: true,
      status: true,
      engagementScore: true,
      repliedAt: true
    }
  });

  return leads;
}
