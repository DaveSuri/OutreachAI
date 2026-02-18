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
