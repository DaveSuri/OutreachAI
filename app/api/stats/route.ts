import { NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/voice-tools";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getDashboardStats();
  return NextResponse.json(data);
}
