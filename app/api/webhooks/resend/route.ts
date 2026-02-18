import { LeadStatus } from "@prisma/client";
import { Webhook } from "svix";
import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { inngest } from "@/src/lib/inngest";

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

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: LeadStatus.REPLIED,
      repliedAt: new Date()
    }
  });

  await inngest.send({
    name: "lead/replied",
    data: {
      leadId: lead.id,
      campaignId: lead.campaignId,
      fromEmail,
      subject: payload.data?.subject,
      messageId: payload.data?.message_id
    }
  });

  return NextResponse.json({ ok: true, leadId: lead.id, status: "REPLIED" });
}
