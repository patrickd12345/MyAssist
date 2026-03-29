import { resolveMyAssistRuntimeEnv } from "./env/runtime";

export async function getSessionUserId(): Promise<string | null> {
  const runtime = resolveMyAssistRuntimeEnv();
  if (runtime.authDisabledRaw === "true") {
    const dev = runtime.devUserId;
    return dev && dev !== "" ? dev : "dev-user";
  }

  const { auth } = await import("./auth");
  const session = await auth();
  const id = session?.user?.id;
  if (typeof id === "string" && id.trim() !== "") {
    return id;
  }
  return null;
}
