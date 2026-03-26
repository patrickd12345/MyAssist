import { getUserById } from "@/lib/userStore";

export async function resolveTodoistApiToken(userId: string): Promise<string | undefined> {
  const user = await getUserById(userId);
  const fromUser = user?.todoistApiToken?.trim();
  if (fromUser) return fromUser;
  return process.env.TODOIST_API_TOKEN?.trim();
}
