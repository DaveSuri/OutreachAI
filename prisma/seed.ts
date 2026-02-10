import {
  CampaignStatus,
  LeadStatus,
  PrismaClient,
  SequenceStepType
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const campaign = await prisma.campaign.upsert({
    where: {
      id: "seed_campaign_outreachai"
    },
    update: {
      status: CampaignStatus.ACTIVE
    },
    create: {
      id: "seed_campaign_outreachai",
      name: "Seed Campaign - Product Ops Leaders",
      status: CampaignStatus.ACTIVE,
      sequenceSteps: {
        create: [
          {
            order: 1,
            type: SequenceStepType.AI_RESEARCH,
            researchPrompt: "Research the company and map likely GTM friction points"
          },
          {
            order: 2,
            type: SequenceStepType.EMAIL,
            template:
              "Hi {{firstName}}, we help teams like {{company}} improve outbound conversion with AI-driven sequencing."
          },
          {
            order: 3,
            type: SequenceStepType.WAIT,
            delayMinutes: 1440
          },
          {
            order: 4,
            type: SequenceStepType.EMAIL,
            template: "Quick bump, {{firstName}}. Worth exploring for {{company}} this quarter?"
          }
        ]
      }
    }
  });

  const demoLeads = [
    {
      email: "ava.northwind@example.com",
      firstName: "Ava",
      lastName: "Stone",
      company: "Northwind",
      engagementScore: 72
    },
    {
      email: "noah.acme@example.com",
      firstName: "Noah",
      lastName: "Shah",
      company: "Acme Labs",
      engagementScore: 88
    },
    {
      email: "liam.peak@example.com",
      firstName: "Liam",
      lastName: "Khan",
      company: "Peakline",
      engagementScore: 34
    }
  ];

  for (const lead of demoLeads) {
    await prisma.lead.upsert({
      where: {
        email_campaignId: {
          email: lead.email,
          campaignId: campaign.id
        }
      },
      update: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        engagementScore: lead.engagementScore,
        status: LeadStatus.PENDING
      },
      create: {
        campaignId: campaign.id,
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        engagementScore: lead.engagementScore,
        status: LeadStatus.PENDING
      }
    });
  }

  console.log("Seed completed for OutreachAI");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
