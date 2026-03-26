import "server-only";

export function resolvePublicOrigin(req: Request): string {
  const configured =
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.MYASSIST_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fallback to request origin
    }
  }
  return new URL(req.url).origin;
}

