import { DraftStatus, EmailDeliveryStatus, LeadStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/resend";

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
    include: {
      lead: {
        select: {
          id: true,
          email: true,
          repliedAt: true
        }
      }
    }
  });

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  if (draft.status !== DraftStatus.PENDING_APPROVAL) {
    return NextResponse.json({ error: "Draft is not pending approval" }, { status: 409 });
  }

  if (draft.lead.repliedAt && draft.lead.repliedAt > draft.createdAt) {
    await prisma.draftResponse.update({
      where: {
        id: draft.id
      },
      data: {
        status: DraftStatus.REJECTED
      }
    });

    return NextResponse.json({ error: "Draft became stale due to a newer reply" }, { status: 409 });
  }

  const sent = await sendEmail({
    to: draft.lead.email,
    subject: draft.generatedSubject,
    html: draft.generatedBody.replace(/\n/g, "<br />")
  });

  await prisma.$transaction(async (tx) => {
    await tx.draftResponse.update({
      where: {
        id: draft.id
      },
      data: {
        status: DraftStatus.APPROVED
      }
    });

    await tx.lead.update({
      where: {
        id: draft.lead.id
      },
      data: {
        status: LeadStatus.CONTACTED,
        lastEmailedAt: new Date(),
        messageId: sent.id,
        version: {
          increment: 1
        }
      }
    });

    await tx.emailLog.create({
      data: {
        leadId: draft.lead.id,
        subject: draft.generatedSubject,
        body: draft.generatedBody,
        stepName: "APPROVED_DRAFT",
        status: EmailDeliveryStatus.sent,
        messageId: sent.id
      }
    });
  });

  return NextResponse.json({
    sent: true,
    draftId,
    approvedBy,
    delivery: sent.status
  });
}
