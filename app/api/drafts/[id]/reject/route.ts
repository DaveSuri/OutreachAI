import { DraftStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

type Params = {
  params: {
    id: string;
  };
};

export async function POST(_request: Request, { params }: Params) {
  const draftId = params.id;

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

  await prisma.draftResponse.update({
    where: { id: draftId },
    data: {
      status: DraftStatus.REJECTED
    }
  });

  return NextResponse.json({ rejected: true, draftId });
}
