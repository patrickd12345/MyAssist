import "server-only";

export function isBillingEnabled(): boolean {
  return process.env.MYASSIST_BILLING_ENABLED === "true" || process.env.BILLING_ENABLED === "true";
}
