import { DraftStatus, LeadStatus, Prisma } from "@prisma/client";
import { Webhook } from "svix";
import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { inngest } from "@/src/lib/inngest";
import { generateReplyDraft } from "@/src/lib/openai";
import { sendResendEmail } from "@/src/lib/resend";

type ResendInboundPayload = {
  type?: string;
  data?: {
    from?: string | { email?: string };
    subject?: string;
    text?: string;
    html?: string;
    message_id?: string;
  };
};

function extractEmail(from: string | { email?: string } | undefined) {
  if (!from) {
    return "";
  }

  if (typeof from === "object") {
    return (from.email || "").trim().toLowerCase();
  }

  const angleMatch = from.match(/<([^>]+)>/);
  return (angleMatch?.[1] || from).trim().toLowerCase();
}

function toPlainText(text?: string, html?: string) {
  if (text?.trim()) {
    return text.trim();
  }

  if (html?.trim()) {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  return "";
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: "Missing RESEND_WEBHOOK_SECRET" }, { status: 500 });
  }

  let payload: ResendInboundPayload;
  try {
    const verifier = new Webhook(webhookSecret);
    payload = verifier.verify(rawBody, {
      "svix-id": request.headers.get("svix-id") || "",
      "svix-timestamp": request.headers.get("svix-timestamp") || "",
      "svix-signature": request.headers.get("svix-signature") || ""
    }) as ResendInboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  if (payload.type && payload.type !== "email.received" && payload.type !== "email.replied") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const fromEmail = extractEmail(payload.data?.from);
  if (!fromEmail) {
    return NextResponse.json({ ok: true, ignored: true, reason: "missing-from" });
  }

  const lead = await prisma.lead.findFirst({
    where: {
      email: {
        equals: fromEmail,
        mode: "insensitive"
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      id: true,
      campaignId: true
    }
  });

  if (!lead) {
    return NextResponse.json({ ok: true, ignored: true, reason: "lead-not-found" });
  }

  const messageId = payload.data?.message_id?.trim() || `resend_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const textBody = toPlainText(payload.data?.text, payload.data?.html);

  let duplicateInbound = false;
  try {
    await prisma.inboundEmail.create({
      data: {
        leadId: lead.id,
        providerMessageId: messageId,
        fromEmail,
        subject: payload.data?.subject || null,
        body: textBody || "(empty body)",
        raw: payload as Prisma.InputJsonValue
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      duplicateInbound = true;
    } else {
      throw error;
    }
  }

  await prisma.lead.updateMany({
    where: { id: lead.id },
    data: {
      status: LeadStatus.REPLIED,
      repliedAt: new Date(),
      version: {
        increment: 1
      }
    }
  });

  if (!duplicateInbound) {
    let draftId: string | null = null;
    const existingDraft = await prisma.draftResponse.findFirst({
      where: {
        leadId: lead.id,
        incomingEmail: textBody || null,
        status: DraftStatus.PENDING_APPROVAL
      },
      select: {
        id: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    if (existingDraft) {
      draftId = existingDraft.id;
    } else {
      const generated = await generateReplyDraft({
        incomingEmail: textBody || "Lead replied with an empty body.",
        leadName: fromEmail,
        company: null
      });

      const createdDraft = await prisma.draftResponse.create({
        data: {
          leadId: lead.id,
          incomingEmail: textBody || null,
          generatedSubject: generated.subject,
          generatedBody: generated.body,
          status: DraftStatus.PENDING_APPROVAL
        },
        select: {
          id: true
        }
      });
      draftId = createdDraft.id;

      if (process.env.ALERT_EMAIL_TO) {
        await sendResendEmail({
          to: process.env.ALERT_EMAIL_TO,
          subject: `New Reply from ${fromEmail} - Draft ready`,
          html: `<p>Inbound reply received from ${fromEmail}. Draft ID: ${createdDraft.id}</p>`
        });
      }
    }

    await inngest.send({
      name: "lead/reply.received",
      data: {
        leadId: lead.id,
        campaignId: lead.campaignId,
        fromEmail,
        subject: payload.data?.subject,
        textBody,
        messageId,
        draftId
      }
    });
  }

  return NextResponse.json({ ok: true, leadId: lead.id, status: "REPLIED", duplicateInbound });
}
