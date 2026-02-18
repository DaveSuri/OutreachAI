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

const csvAliases = {
  email: new Set(["email", "workemail", "businessemail", "emailaddress"]),
  firstName: new Set(["firstname", "first", "givenname"]),
  lastName: new Set(["lastname", "last", "surname", "familyname"]),
  company: new Set(["company", "companyname", "organization", "organisation"])
};

function normalizeHeaderName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeOptional(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveColumnValue(
  row: Record<string, unknown>,
  aliases: Set<string>,
  fallbackKeys: string[] = []
): string | undefined {
  for (const [key, value] of Object.entries(row)) {
    if (aliases.has(normalizeHeaderName(key)) && typeof value === "string") {
      const normalized = normalizeOptional(value);
      if (normalized) {
        return normalized;
      }
    }
  }

  for (const key of fallbackKeys) {
    const value = row[key];
    if (typeof value === "string") {
      const normalized = normalizeOptional(value);
      if (normalized) {
        return normalized;
      }
    }
  }

  return undefined;
}

export function parseUploadPayload(input: unknown): { campaignId: string; leads: LeadCSVRow[] } {
  const payload = payloadSchema.parse(input);

  const parsedLeads: LeadCSVRow[] = [];

  if (payload.csv) {
    const csvResult = Papa.parse<Record<string, unknown>>(payload.csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim()
    });

    if (csvResult.errors.length > 0) {
      throw new Error(`CSV parsing failed: ${csvResult.errors[0]?.message ?? "Unknown parsing error"}`);
    }

    for (const row of csvResult.data) {
      const email = resolveColumnValue(row, csvAliases.email, ["email"]);
      if (!email) {
        continue;
      }

      const normalized = leadSchema.parse({
        email,
        firstName: resolveColumnValue(row, csvAliases.firstName, ["firstName"]),
        lastName: resolveColumnValue(row, csvAliases.lastName, ["lastName"]),
        company: resolveColumnValue(row, csvAliases.company, ["company"])
      });

      parsedLeads.push(normalized);
    }
  }

  if (payload.leads) {
    for (const row of payload.leads) {
      const objectRow =
        row && typeof row === "object" && !Array.isArray(row) ? (row as Record<string, unknown>) : {};

      const normalized = leadSchema.parse({
        email: objectRow.email,
        firstName: normalizeOptional(objectRow.firstName),
        lastName: normalizeOptional(objectRow.lastName),
        company: normalizeOptional(objectRow.company)
      });
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
