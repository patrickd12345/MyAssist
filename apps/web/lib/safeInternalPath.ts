/**
 * Same-origin relative paths only — safe for open redirects after auth.
 * Rejects protocol-relative URLs (`//evil.com`), backslashes, and obvious escapes.
 */
export function safeInternalPath(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//")) return "/";
  if (trimmed.includes("\\")) return "/";
  if (trimmed.includes("@")) return "/";
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return "/";
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return "/";
  const pathOnly = decoded.split("?")[0]?.split("#")[0] ?? "/";
  if (!pathOnly.startsWith("/") || pathOnly.startsWith("//")) return "/";
  return pathOnly;
}
