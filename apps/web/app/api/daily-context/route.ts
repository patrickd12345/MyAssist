import { NextResponse } from "next/server";
import { fetchDailyContextFromN8n } from "@/lib/fetchDailyContext";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchDailyContextFromN8n();
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
