import { NextResponse } from "next/server";
import { chooseVoiceToolWithGemini, generateVoiceAssistantResponse, type VoiceToolName } from "@/lib/ai/gemini";
import { getDashboardStats, queryHotLeads } from "@/lib/voice-tools";

function chooseToolHeuristic(query: string): VoiceToolName {
  const normalized = query.toLowerCase();

  if (
    normalized.includes("how are we doing") ||
    normalized.includes("dashboard") ||
    normalized.includes("stats") ||
    normalized.includes("reply rate")
  ) {
    return "get_dashboard_stats";
  }

  if (
    normalized.includes("hot lead") ||
    normalized.includes("who should i call") ||
    normalized.includes("call right now") ||
    normalized.includes("priority lead")
  ) {
    return "query_hot_leads";
  }

  return "get_dashboard_stats";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";

  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  let toolName = chooseToolHeuristic(query);
  try {
    const modelChoice = await chooseVoiceToolWithGemini(query);
    if (modelChoice) {
      toolName = modelChoice;
    }
  } catch {
    // Fall back to deterministic routing when Gemini tool-calling is unavailable.
  }

  const payload =
    toolName === "get_dashboard_stats" ? await getDashboardStats() : await queryHotLeads();

  let message = "";
  try {
    message = await generateVoiceAssistantResponse(query, { toolName, payload });
  } catch {
    message = `Tool ${toolName} executed successfully. Here is the latest data: ${JSON.stringify(payload)}`;
  }

  return NextResponse.json({
    toolName,
    payload,
    message
  });
}
