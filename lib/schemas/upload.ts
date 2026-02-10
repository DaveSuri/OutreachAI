import Papa from "papaparse";
import { z } from "zod";
import type { LeadCSVRow } from "@/lib/domain";

const leadSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional()
});

const payloadSchema = z.object({
  campaignId: z.string().min(1),
  leads: z.array(z.unknown()).optional(),
  csv: z.string().optional()
});

export type UploadPayload = z.infer<typeof payloadSchema>;

export function parseUploadPayload(input: unknown): { campaignId: string; leads: LeadCSVRow[] } {
  const payload = payloadSchema.parse(input);

  const parsedLeads: LeadCSVRow[] = [];

  if (payload.csv) {
    const csvResult = Papa.parse<LeadCSVRow>(payload.csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim()
    });

    if (csvResult.errors.length > 0) {
      throw new Error(`CSV parsing failed: ${csvResult.errors[0]?.message ?? "Unknown parsing error"}`);
    }

    for (const row of csvResult.data) {
      if (!row.email) {
        continue;
      }

      const normalized = leadSchema.parse({
        email: row.email,
        firstName: row.firstName?.trim() || undefined,
        lastName: row.lastName?.trim() || undefined,
        company: row.company?.trim() || undefined
      });

      parsedLeads.push(normalized);
    }
  }

  if (payload.leads) {
    for (const row of payload.leads) {
      const normalized = leadSchema.parse(row);
      parsedLeads.push(normalized);
    }
  }

  const dedupedMap = new Map<string, LeadCSVRow>();
  for (const lead of parsedLeads) {
    dedupedMap.set(lead.email, lead);
  }

  return {
    campaignId: payload.campaignId,
    leads: [...dedupedMap.values()]
  };
}
