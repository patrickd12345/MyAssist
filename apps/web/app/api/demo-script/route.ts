import { NextResponse } from "next/server";
import { getDemoWalkthrough } from "@/lib/demoScript";
import { getSessionUserId } from "@/lib/session";
import { jsonLegacyApiError } from "@/lib/api/error-contract";

export const dynamic = "force-dynamic";

/** GET JSON for the deterministic demo walkthrough (pairs with MYASSIST_DEMO_MODE). */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  return NextResponse.json(getDemoWalkthrough());
}
