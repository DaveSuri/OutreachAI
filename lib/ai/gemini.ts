import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export type VoiceToolName = "get_dashboard_stats" | "query_hot_leads";

type VoiceToolResult = {
  toolName: VoiceToolName;
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

export async function chooseVoiceToolWithGemini(userQuery: string): Promise<VoiceToolName | null> {
  const client = getGeminiClient();
  if (!client) {
    return null;
  }

  const model = client.getGenerativeModel({
    model: "gemini-1.5-flash",
    tools: [
      {
        functionDeclarations: [
          {
            name: "get_dashboard_stats",
            description: "Get overall outreach KPIs including active campaigns, total leads, and reply rate.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {}
            }
          },
          {
            name: "query_hot_leads",
            description: "Get high-priority leads to call right now based on engagement and reply status.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {}
            }
          }
        ]
      }
    ]
  });

  const result = await model.generateContent(
    `Decide the best tool for this CRM assistant request and call exactly one function.\nUser query: ${userQuery}`
  );
  const response = result.response as any;
  const functionCalls =
    typeof response.functionCalls === "function" ? response.functionCalls() : response.functionCalls;
  const firstCall = Array.isArray(functionCalls) ? functionCalls[0] : null;
  const name = firstCall?.name;

  if (name === "get_dashboard_stats" || name === "query_hot_leads") {
    return name;
  }

  return null;
}
