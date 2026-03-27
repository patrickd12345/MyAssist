export async function getSessionUserId(): Promise<string | null> {
  if (process.env.MYASSIST_AUTH_DISABLED === "true") {
    const dev = process.env.MYASSIST_DEV_USER_ID?.trim();
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
