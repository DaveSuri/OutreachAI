"use server";

import { LeadStatus } from "@prisma/client";
import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/lib/db";
import { inngest } from "@/src/lib/inngest";
import { generatePersonalizedDraft } from "@/src/lib/openai";

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

export async function createCampaign(formData: FormData) {
  const name = normalize(formData.get("name"));
  const userId = normalize(formData.get("userId")) || "demo-user";

  if (!name) {
    throw new Error("Campaign name is required");
  }

  await prisma.campaign.create({
    data: {
      name,
      userId
    }
  });

  revalidatePath("/");
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
    throw new Error("No valid leads found in CSV");
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
}

export async function generateDrafts(campaignId: string) {
  if (!campaignId.trim()) {
    throw new Error("Campaign ID is required");
  }

  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      status: LeadStatus.PENDING
    },
    select: {
      id: true,
      name: true,
      company: true
    }
  });

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
}

export async function startCampaign(campaignId: string) {
  if (!campaignId.trim()) {
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
    return;
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
        waitDuration: "2 days"
      }
    }))
  );

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/");
}

export async function simulateReply(leadId: string) {
  if (!leadId.trim()) {
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
      campaignId: true
    }
  });

  revalidatePath(`/campaigns/${lead.campaignId}`);
  revalidatePath("/");
}
