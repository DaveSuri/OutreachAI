import OpenAI from "openai";
import { renderTemplate } from "@/lib/templates";

type ColdEmailInput = {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  template?: string | null;
  aiContext?: unknown;
};

type DraftInput = {
  incomingEmail: string;
  leadName?: string;
  company?: string;
};

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return openaiClient;
}

function fallbackEmail(input: ColdEmailInput) {
  const firstName = input.firstName || "there";
  const company = input.company ? ` at ${input.company}` : "";

  return {
    subject: `Quick idea${company}`,
    body: `Hi ${firstName},\n\nI wanted to share a short idea that could improve outbound efficiency${company}. If useful, I can send a 2-minute breakdown.\n\nBest,\nOutreachAI`
  };
}

export async function generateColdEmail(input: ColdEmailInput): Promise<{ subject: string; body: string }> {
  const client = getOpenAIClient();

  const templateOutput = renderTemplate(input.template, {
    firstName: input.firstName ?? "",
    lastName: input.lastName ?? "",
    company: input.company ?? ""
  });

  if (!client) {
    return fallbackEmail(input);
  }

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You write concise, high-conversion cold emails. Return strict JSON with keys subject and body."
      },
      {
        role: "user",
        content: JSON.stringify({
          lead: {
            firstName: input.firstName,
            lastName: input.lastName,
            company: input.company
          },
          aiContext: input.aiContext ?? null,
          template: templateOutput
        })
      }
    ],
    response_format: { type: "json_object" }
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    return fallbackEmail(input);
  }

  try {
    const parsed = JSON.parse(raw) as { subject: string; body: string };
    return {
      subject: parsed.subject,
      body: parsed.body
    };
  } catch {
    return fallbackEmail(input);
  }
}

export async function analyzeReplySentiment(incomingEmail: string): Promise<"positive" | "neutral" | "negative"> {
  const client = getOpenAIClient();
  if (!client) {
    const lower = incomingEmail.toLowerCase();
    if (lower.includes("not interested") || lower.includes("stop") || lower.includes("unsubscribe")) {
      return "negative";
    }
    if (lower.includes("yes") || lower.includes("interested") || lower.includes("book")) {
      return "positive";
    }
    return "neutral";
  }

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Classify the sentiment of the email reply as positive, neutral, or negative. Return one word."
      },
      {
        role: "user",
        content: incomingEmail
      }
    ]
  });

  const result = completion.choices[0]?.message?.content?.trim().toLowerCase() ?? "neutral";
  if (result.includes("positive")) {
    return "positive";
  }
  if (result.includes("negative")) {
    return "negative";
  }
  return "neutral";
}

export async function generateDraftResponse(input: DraftInput): Promise<{ subject: string; body: string }> {
  const client = getOpenAIClient();
  const defaultSubject = "Re: Thanks for your reply";
  const defaultBody = `Hi ${input.leadName || "there"},\n\nThanks for the reply. Happy to share details tailored to ${input.company || "your team"}. Let me know the best time for a short call this week.\n\nBest,\nOutreachAI`;

  if (!client) {
    return { subject: defaultSubject, body: defaultBody };
  }

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Draft a concise sales follow-up reply. Return strict JSON with keys subject and body. Respect the lead's tone."
      },
      {
        role: "user",
        content: JSON.stringify(input)
      }
    ],
    response_format: { type: "json_object" }
  });

  try {
    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}") as {
      subject?: string;
      body?: string;
    };
    return {
      subject: parsed.subject || defaultSubject,
      body: parsed.body || defaultBody
    };
  } catch {
    return {
      subject: defaultSubject,
      body: defaultBody
    };
  }
}
