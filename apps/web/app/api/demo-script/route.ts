import { NextResponse } from "next/server";
import { getDemoWalkthrough } from "@/lib/demoScript";

export const dynamic = "force-dynamic";

/** GET JSON for the deterministic demo walkthrough (pairs with MYASSIST_DEMO_MODE). */
export async function GET() {
  return NextResponse.json(getDemoWalkthrough());
}
