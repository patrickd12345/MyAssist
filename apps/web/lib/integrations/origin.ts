import "server-only";

export function resolvePublicOrigin(req: Request): string {
  const requestOrigin = new URL(req.url).origin;
  // In local development, always use the current request origin to avoid
  // OAuth redirect_uri mismatches when dev server runs on a non-default port.
  if (process.env.NODE_ENV !== "production") {
    try {
      const host = new URL(requestOrigin).hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        return requestOrigin;
      }
    } catch {
      // continue to configured fallback
    }
  }

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
  return requestOrigin;
}

