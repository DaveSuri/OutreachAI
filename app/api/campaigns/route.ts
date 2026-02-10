import { CampaignStatus, SequenceStepType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const createCampaignSchema = z.object({
  name: z.string().min(2),
  steps: z
    .array(
      z.object({
        order: z.number().int().min(1),
        type: z.nativeEnum(SequenceStepType),
        template: z.string().optional(),
        delayMinutes: z.number().int().positive().optional(),
        researchPrompt: z.string().optional()
      })
    )
    .optional()
});

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    include: {
      _count: {
        select: {
          leads: true,
          sequenceSteps: true
        }
      },
      sequenceSteps: {
        orderBy: {
          order: "asc"
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return NextResponse.json({ campaigns });
}

export async function POST(request: Request) {
  const body = await request.json();
  const payload = createCampaignSchema.parse(body);

  const fallbackSteps = [
    {
      order: 1,
      type: SequenceStepType.AI_RESEARCH,
      researchPrompt: "Research this lead's company and detect growth priorities"
    },
    {
      order: 2,
      type: SequenceStepType.EMAIL,
      template: "Hi {{firstName}}, quick idea for {{company}} to improve outbound conversion with AI-assisted sequencing."
    },
    {
      order: 3,
      type: SequenceStepType.WAIT,
      delayMinutes: 2880
    },
    {
      order: 4,
      type: SequenceStepType.EMAIL,
      template: "Following up in case this helps {{company}} this quarter."
    }
  ];

  const campaign = await prisma.campaign.create({
    data: {
      name: payload.name,
      status: CampaignStatus.DRAFT,
      sequenceSteps: {
        createMany: {
          data: payload.steps && payload.steps.length > 0 ? payload.steps : fallbackSteps
        }
      }
    },
    include: {
      sequenceSteps: {
        orderBy: {
          order: "asc"
        }
      }
    }
  });

  return NextResponse.json({ campaign }, { status: 201 });
}
