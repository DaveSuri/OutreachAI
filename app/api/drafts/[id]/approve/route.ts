import { DraftStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { events } from "@/lib/events";
import { inngest } from "@/lib/inngest";

type Params = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: Params) {
  const draftId = params.id;
  const body = await request.json().catch(() => ({}));
  const approvedBy = typeof body?.approvedBy === "string" ? body.approvedBy : "admin";

  const draft = await prisma.draftResponse.findUnique({
    where: { id: draftId },
    select: {
      id: true,
      status: true
    }
  });

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  if (draft.status !== DraftStatus.PENDING_APPROVAL) {
    return NextResponse.json({ error: "Draft is not pending approval" }, { status: 409 });
  }

  await inngest.send({
    name: events.draftApproved,
    data: {
      draftId,
      approvedBy
    }
  });

  return NextResponse.json({ queued: true, draftId, approvedBy });
}
