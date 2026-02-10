import { LeadStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { events } from "@/lib/events";
import { inngest } from "@/lib/inngest";

type ResendPayload = {
  type?: string;
  data?: {
    from?: string | { email?: string };
    subject?: string;
    text?: string;
    html?: string;
    message_id?: string;
  };
};

function extractEmail(input: string | { email?: string } | undefined): string | null {
  if (!input) {
    return null;
  }

  if (typeof input === "object" && input.email) {
    return input.email.toLowerCase();
  }

  if (typeof input === "string") {
    const angleMatch = input.match(/<([^>]+)>/);
    if (angleMatch?.[1]) {
      return angleMatch[1].toLowerCase();
    }

    return input.trim().toLowerCase();
  }

  return null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const isProduction = env.NODE_ENV === "production";
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (isProduction && !webhookSecret) {
    return NextResponse.json(
      {
        error: "Server misconfigured: RESEND_WEBHOOK_SECRET is required in production"
      },
      { status: 500 }
    );
  }

  let payload: ResendPayload;
  try {
    if (webhookSecret) {
      const svixHeaders = {
        "svix-id": request.headers.get("svix-id") || "",
        "svix-timestamp": request.headers.get("svix-timestamp") || "",
        "svix-signature": request.headers.get("svix-signature") || ""
      };

      const verifier = new Webhook(webhookSecret);
      payload = verifier.verify(rawBody, svixHeaders) as ResendPayload;
    } else {
      payload = JSON.parse(rawBody) as ResendPayload;
    }
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  // Ignore non-inbound events when a shared webhook endpoint is used.
  if (payload.type && payload.type !== "email.received") {
    return NextResponse.json({ ignored: true, reason: `Unsupported event type: ${payload.type}` });
  }

  const fromEmail = extractEmail(payload.data?.from);
  if (!fromEmail) {
    return NextResponse.json({ ignored: true, reason: "Missing sender email" });
  }

  const textBody = payload.data?.text || (payload.data?.html ? stripHtml(payload.data.html) : "");

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
      campaignId: true,
      repliedAt: true
    }
  });

  if (!lead) {
    return NextResponse.json({ ignored: true, reason: "No matching lead" });
  }

  const now = new Date();
  const update = await prisma.lead.updateMany({
    where: {
      id: lead.id,
      repliedAt: null
    },
    data: {
      status: LeadStatus.REPLIED,
      repliedAt: now,
      version: {
        increment: 1
      }
    }
  });

  if (update.count > 0) {
    await inngest.send({
      name: events.leadReplyReceived,
      data: {
        leadId: lead.id,
        campaignId: lead.campaignId,
        fromEmail,
        subject: payload.data?.subject,
        textBody,
        messageId: payload.data?.message_id
      }
    });
  }

  return NextResponse.json({
    received: true,
    event: payload.type || "email.received",
    leadId: lead.id,
    updated: update.count > 0
  });
}
