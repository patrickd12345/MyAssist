import { NextResponse } from "next/server";

import { isBillingEnabled } from "@/lib/billing/config";

/**
 * Public capability flag for the client (no secrets). Billing routes still enforce auth + env server-side.
 */
export async function GET() {
  return NextResponse.json({ enabled: isBillingEnabled() });
}
