import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }

  return openaiClient;
}

export async function generatePersonalizedDraft(input: { name?: string | null; company?: string | null }) {
  const openai = getOpenAIClient();
  if (!openai) {
    const fallbackName = input.name || "there";
    const fallbackCompany = input.company || "your team";
    return `Hi ${fallbackName},\n\nI noticed ${fallbackCompany} is growing fast. I have one idea that can improve response rates without increasing send volume.\n\nOpen to a quick 10-minute chat this week?\n\nBest,\nOutreach AI`;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          "You write concise B2B cold emails. Return only plain text body. Keep under 120 words and include a clear CTA."
      },
      {
        role: "user",
        content: `Write an outreach email for ${input.name || "a prospect"} at ${input.company || "their company"}.`
      }
    ]
  });

  return completion.choices[0]?.message?.content?.trim() || "Hi, quick idea for your team. Open to chat?";
}

export async function generateThinkingInsight(input: {
  name?: string | null;
  company?: string | null;
  priorDraft?: string | null;
  prompt?: string | null;
}) {
  const fallback = `Focus on a concrete business pain point at ${input.company || "the company"} and offer one low-friction next step.`;
  const openai = getOpenAIClient();

  if (!openai) {
    return fallback;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You are an outreach strategist. Return a concise 'thinking note' (2 sentences max) for a follow-up email angle."
      },
      {
        role: "user",
        content: JSON.stringify({
          name: input.name ?? null,
          company: input.company ?? null,
          priorDraft: input.priorDraft ?? null,
          prompt: input.prompt ?? "Think of the best follow-up angle to increase reply chance."
        })
      }
    ]
  });

  return completion.choices[0]?.message?.content?.trim() || fallback;
}

export async function generateReplyDraft(input: {
  incomingEmail: string;
  leadName?: string | null;
  company?: string | null;
}) {
  const fallbackSubject = `Re: ${input.company || "your note"}`;
  const fallbackBody = [
    `Hi ${input.leadName || "there"},`,
    "",
    "Thanks for your reply. I appreciate the context.",
    "",
    "Happy to tailor this to your current priorities and keep it practical. If useful, we can do a short call this week.",
    "",
    "Best,",
    "Outreach AI"
  ].join("\n");

  const openai = getOpenAIClient();
  if (!openai) {
    return {
      subject: fallbackSubject,
      body: fallbackBody
    };
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You are a B2B sales assistant. Return a JSON object with keys subject and body. Keep body concise, professional, and specific."
      },
      {
        role: "user",
        content: JSON.stringify({
          incomingEmail: input.incomingEmail,
          leadName: input.leadName ?? null,
          company: input.company ?? null
        })
      }
    ],
    response_format: { type: "json_object" }
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(raw) as { subject?: string; body?: string };
    return {
      subject: parsed.subject?.trim() || fallbackSubject,
      body: parsed.body?.trim() || fallbackBody
    };
  } catch {
    return {
      subject: fallbackSubject,
      body: raw.trim() || fallbackBody
    };
  }
}
