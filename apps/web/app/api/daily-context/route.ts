import { NextResponse } from "next/server";
import { fetchDailyContextFromN8n, MYASSIST_CONTEXT_SOURCE_HEADER } from "@/lib/fetchDailyContext";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { context, source } = await fetchDailyContextFromN8n();
    const res = NextResponse.json(context);
    res.headers.set(MYASSIST_CONTEXT_SOURCE_HEADER, source);
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
