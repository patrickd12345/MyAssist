import { runAuthCallbackGet } from "@/lib/auth/completeAuthCallback";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runAuthCallbackGet(request);
}
