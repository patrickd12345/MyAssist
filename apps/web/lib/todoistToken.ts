import { getUserById } from "@/lib/userStore";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { getIntegrationToken } from "./integrations/tokenStore";

export async function resolveTodoistApiToken(userId: string): Promise<string | undefined> {
  const integration = await getIntegrationToken(userId, "todoist");
  const fromIntegration = integration?.access_token?.trim();
  if (fromIntegration) return fromIntegration;
  const user = await getUserById(userId);
  const fromUser = user?.todoistApiToken?.trim();
  if (fromUser) return fromUser;
  return resolveMyAssistRuntimeEnv().todoistApiToken || undefined;
}
