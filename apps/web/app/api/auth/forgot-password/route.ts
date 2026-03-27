import { NextResponse } from "next/server";
import { createPasswordResetToken } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const token = await createPasswordResetToken(email);
    const response: Record<string, unknown> = { ok: true };
    if (token && process.env.NODE_ENV !== "production") {
      const base = process.env.AUTH_URL?.trim() || process.env.NEXTAUTH_URL?.trim() || "http://localhost:3000";
      response.devResetUrl = `${base.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
    } else if (!token && process.env.NODE_ENV !== "production") {
      response.devHint = "No local account found for this email. Use Register first, then reset if needed.";
    }
    // Always return success to avoid account enumeration.
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ ok: true });
  }
}
