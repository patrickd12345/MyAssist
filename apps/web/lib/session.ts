import { resolveMyAssistRuntimeEnv } from "./env/runtime";
import { getSupabaseServerUser } from "./supabaseServer";

function isNonProductionAuthBypassAllowed(nodeEnv: string): boolean {
  return nodeEnv === "test" || nodeEnv === "development";
}

export async function getSessionUserId(): Promise<string | null> {
  const runtime = resolveMyAssistRuntimeEnv();
  if (runtime.authDisabledRaw === "true") {
    if (!isNonProductionAuthBypassAllowed(runtime.nodeEnv)) {
      throw new Error("MYASSIST_AUTH_DISABLED is only allowed when NODE_ENV is test or development.");
    }
    const dev = runtime.devUserId;
    return dev && dev !== "" ? dev : "dev-user";
  }

  const user = await getSupabaseServerUser();
  const id = user?.id;
  if (typeof id === "string" && id.trim() !== "") {
    return id;
  }
  return null;
}

function greetingFirstNameFromEmail(email: string | null | undefined): string {
  if (!email?.trim()) return "there";
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return "there";
  const first = local.split(/[._-]/)[0] ?? local;
  const cap = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return cap || "there";
}

/** First name for dashboard greeting (from session email local-part); `"there"` when unavailable. */
export async function getSessionUserDisplayFirstName(): Promise<string> {
  const runtime = resolveMyAssistRuntimeEnv();
  if (runtime.authDisabledRaw === "true") {
    if (!isNonProductionAuthBypassAllowed(runtime.nodeEnv)) {
      throw new Error("MYASSIST_AUTH_DISABLED is only allowed when NODE_ENV is test or development.");
    }
    return "there";
  }
  const user = await getSupabaseServerUser();
  return greetingFirstNameFromEmail(user?.email);
}
