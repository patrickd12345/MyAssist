import type { NextRequest } from "next/server";

import { handleMyAssistStripeWebhook } from "@/lib/stripeWebhookHandler";

export async function POST(request: NextRequest) {
  return handleMyAssistStripeWebhook(request);
}
