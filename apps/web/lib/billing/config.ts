import "server-only";

import { isBillingEnabled as isSharedBillingEnabled } from "@bookiji-inc/stripe-runtime";

export function isBillingEnabled(): boolean {
  return isSharedBillingEnabled(process.env);
}
