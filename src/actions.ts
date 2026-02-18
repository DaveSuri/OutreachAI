"use server";

import { EmailDeliveryStatus, LeadStatus } from "@prisma/client";
import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db";
import { inngest } from "@/src/lib/inngest";
import { generatePersonalizedDraft } from "@/src/lib/openai";
import { sendResendEmail } from "@/src/lib/resend";

type ParsedLead = {
  email: string;
  name?: string;
  company?: string;
};

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRowValue(row: Record<string, unknown>, aliases: string[]) {
  const keys = Object.keys(row);
  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (aliases.includes(normalizedKey)) {
      const value = normalize(row[key]);
      if (value) {
        return value;
      }
    }
  }
  return "";
}

function parseCsvLeads(csv: string): ParsedLead[] {
  const result = Papa.parse<Record<string, unknown>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });

  if (result.errors.length) {
    throw new Error(result.errors[0]?.message || "Invalid CSV");
  }

  const deduped = new Map<string, ParsedLead>();

  for (const row of result.data) {
    const email = getRowValue(row, ["email", "emailaddress", "workemail", "businessemail"]).toLowerCase();
    if (!email) {
      continue;
    }

    const name = getRowValue(row, ["name", "fullname", "firstname"]);
    const company = getRowValue(row, ["company", "companyname", "organization", "organisation"]);

    deduped.set(email, {
      email,
      name: name || undefined,
      company: company || undefined
    });
  }

  return [...deduped.values()];
}

async function withConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) {
        break;
      }
      await task(item);
    }
  });

  await Promise.all(workers);
}

function campaignPath(campaignId: string, notice?: string, tone: "success" | "warning" | "error" = "success") {
  if (!notice) {
    return `/campaigns/${campaignId}`;
  }

  const query = new URLSearchParams({
    notice,
    tone
  });
  return `/campaigns/${campaignId}?${query.toString()}`;
}

export async function createCampaign(formData: FormData) {
  const name = normalize(formData.get("name"));
  const userId = normalize(formData.get("userId")) || "demo-user";

  if (!name) {
    throw new Error("Campaign name is required");
  }

  const campaign = await prisma.campaign.create({
    data: {
      name,
      userId
    },
    select: {
      id: true
    }
  });

  revalidatePath("/");
  redirect(campaignPath(campaign.id, "Campaign created", "success"));
}

export async function uploadLeads(formData: FormData) {
  const campaignId = normalize(formData.get("campaignId"));
  const fileValue = formData.get("file");

  if (!campaignId) {
    throw new Error("Campaign ID is required");
  }

  if (!(fileValue instanceof File)) {
    throw new Error("CSV file is required");
  }

  const csvText = await fileValue.text();
  const leads = parseCsvLeads(csvText);

  if (leads.length === 0) {
    redirect(campaignPath(campaignId, "No valid leads found in CSV", "warning"));
  }

  await prisma.lead.createMany({
    data: leads.map((lead) => ({
      campaignId,
      email: lead.email,
      name: lead.name,
      company: lead.company,
      status: LeadStatus.PENDING
    })),
    skipDuplicates: true
  });

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/");
  redirect(campaignPath(campaignId, `Imported ${leads.length} leads`, "success"));
}

export async function addLead(formData: FormData) {
  const campaignId = normalize(formData.get("campaignId"));
  const email = normalize(formData.get("email")).toLowerCase();
  const name = normalize(formData.get("name"));
  const company = normalize(formData.get("company"));

  if (!campaignId || !email) {
    throw new Error("Campaign ID and email are required");
  }

  await prisma.lead.upsert({
    where: {
      email_campaignId: {
        email,
        campaignId
      }
    },
    create: {
      campaignId,
      email,
      name: name || undefined,
      company: company || undefined,
      status: LeadStatus.PENDING
    },
    update: {
      name: name || undefined,
      company: company || undefined
    }
  });

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/");
  redirect(campaignPath(campaignId, `Lead ${email} saved`, "success"));
}

export async function generateDrafts(formData: FormData) {
  const campaignId = normalize(formData.get("campaignId"));

  if (!campaignId) {
    throw new Error("Campaign ID is required");
  }

  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      status: {
        notIn: [LeadStatus.REPLIED, LeadStatus.BOUNCED]
      }
    },
    select: {
      id: true,
      name: true,
      company: true
    }
  });

  if (leads.length === 0) {
    redirect(campaignPath(campaignId, "No eligible leads found for draft generation", "warning"));
  }

  await withConcurrency(leads, 5, async (lead) => {
    const draft = await generatePersonalizedDraft({
      name: lead.name,
      company: lead.company
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        aiDraft: draft,
        status: LeadStatus.DRAFTED
      }
    });
  });

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(campaignPath(campaignId, `Generated drafts for ${leads.length} leads`, "success"));
}

export async function startCampaign(formData: FormData) {
  const campaignId = normalize(formData.get("campaignId"));
  const waitDuration = normalize(formData.get("waitDuration")) || "2 days";
  const enableThinking = formData.get("enableThinking") === "on";
  const thinkingPrompt = normalize(formData.get("thinkingPrompt"));

  if (!campaignId) {
    throw new Error("Campaign ID is required");
  }

  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      status: LeadStatus.DRAFTED
    },
    select: {
      id: true
    }
  });

  if (leads.length === 0) {
    redirect(campaignPath(campaignId, "Generate drafts first, then start campaign", "warning"));
  }

  await prisma.lead.updateMany({
    where: {
      id: {
        in: leads.map((lead) => lead.id)
      }
    },
    data: {
      status: LeadStatus.SCHEDULED
    }
  });

  await inngest.send(
    leads.map((lead) => ({
      name: "campaign/start",
      data: {
        campaignId,
        leadId: lead.id,
        waitDuration,
        enableThinking,
        thinkingPrompt: thinkingPrompt || undefined
      }
    }))
  );

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/");
  redirect(
    campaignPath(
      campaignId,
      `Started workflow for ${leads.length} leads${enableThinking ? " with AI thinking" : ""}`,
      "success"
    )
  );
}

export async function sendLeadEmailNow(formData: FormData) {
  const leadId = normalize(formData.get("leadId"));
  if (!leadId) {
    throw new Error("Lead ID is required");
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      campaignId: true,
      email: true,
      name: true,
      company: true,
      aiDraft: true,
      status: true
    }
  });

  if (!lead) {
    throw new Error("Lead not found");
  }

  const body =
    lead.aiDraft ||
    (await generatePersonalizedDraft({
      name: lead.name,
      company: lead.company
    }));

  const subject = `Quick idea for ${lead.company || "your team"}`;
  const sendResult = await sendResendEmail({
    to: lead.email,
    subject,
    html: body.replace(/\n/g, "<br />")
  });

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: lead.status === LeadStatus.REPLIED ? LeadStatus.CONTACTED : LeadStatus.SENT,
        lastEmailedAt: new Date(),
        messageId: sendResult.id
      }
    });

    await tx.emailLog.create({
      data: {
        leadId: lead.id,
        status: EmailDeliveryStatus.sent,
        sentAt: new Date(),
        messageId: sendResult.id,
        subject,
        body,
        stepName: "MANUAL_SEND"
      }
    });
  });

  revalidatePath(`/campaigns/${lead.campaignId}`);
  const sentNotice =
    sendResult.status === "mocked"
      ? sendResult.notice || `Email to ${lead.email} simulated`
      : `Email sent to ${lead.email}`;

  redirect(campaignPath(lead.campaignId, sentNotice, sendResult.status === "mocked" ? "warning" : "success"));
}

export async function simulateReply(formData: FormData) {
  const leadId = normalize(formData.get("leadId"));
  if (!leadId) {
    throw new Error("Lead ID is required");
  }

  const lead = await prisma.lead.update({
    where: {
      id: leadId
    },
    data: {
      status: LeadStatus.REPLIED,
      repliedAt: new Date()
    },
    select: {
      campaignId: true,
      email: true
    }
  });

  revalidatePath(`/campaigns/${lead.campaignId}`);
  revalidatePath("/");
  redirect(campaignPath(lead.campaignId, `Marked ${lead.email} as replied`, "success"));
}
