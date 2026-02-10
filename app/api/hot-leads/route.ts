import { NextResponse } from "next/server";
import { queryHotLeads } from "@/lib/voice-tools";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await queryHotLeads();
  return NextResponse.json(data);
}
