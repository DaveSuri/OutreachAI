import { DraftStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const drafts = await prisma.draftResponse.findMany({
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
          repliedAt: true,
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
    take: 100
  });

  return NextResponse.json({ drafts });
}
