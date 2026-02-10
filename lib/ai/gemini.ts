import { GoogleGenerativeAI } from "@google/generative-ai";

type VoiceToolResult = {
  toolName: "get_dashboard_stats" | "query_hot_leads";
  payload: unknown;
};

let geminiClient: GoogleGenerativeAI | null = null;

function getGeminiClient() {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    return null;
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
  }

  return geminiClient;
}

export async function generateVoiceAssistantResponse(userQuery: string, toolResult: VoiceToolResult): Promise<string> {
  const client = getGeminiClient();

  if (!client) {
    return `Tool ${toolResult.toolName} executed successfully. Here is the data: ${JSON.stringify(toolResult.payload)}`;
  }

  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = [
    "You are OutreachAI's voice assistant.",
    "Respond in 2-4 short sentences.",
    `User query: ${userQuery}`,
    `Tool used: ${toolResult.toolName}`,
    `Tool payload: ${JSON.stringify(toolResult.payload)}`
  ].join("\n");

  const result = await model.generateContent(prompt);
  return result.response.text();
}
