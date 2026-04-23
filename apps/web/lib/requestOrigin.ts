import "server-only";

/** Origin the browser used (respects reverse proxies on Vercel). */
export function resolveBrowserFacingOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (url.protocol === "https:" ? "https" : "http");
  if (host && host.length > 0 && host !== "localhost" && !host.startsWith("127.")) {
    try {
      return new URL(`${proto}://${host}`).origin;
    } catch {
      // fall through
    }
  }
  return url.origin;
}
