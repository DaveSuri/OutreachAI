export async function runAiResearch(prompt: string | null | undefined, lead: {
  company?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<Record<string, unknown>> {
  const company = lead.company || "Unknown company";
  const query = prompt || `Research ${company} and identify likely revenue priorities.`;

  // Simulates async third-party research fetch (Perplexity, Google Search, etc.)
  await new Promise((resolve) => setTimeout(resolve, 150));

  return {
    query,
    company,
    summary: `${company} appears to be optimizing pipeline velocity and conversion quality.`,
    keySignals: ["Hiring growth roles", "Expanding B2B messaging", "Improving outbound personalization"],
    confidence: 0.73
  };
}
