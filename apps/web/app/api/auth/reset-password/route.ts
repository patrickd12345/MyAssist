import { NextResponse } from "next/server";
import { resetPasswordWithToken } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { token?: unknown; password?: unknown };
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";
    const ok = await resetPasswordWithToken({ token, password });
    if (!ok) {
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reset password." }, { status: 400 });
  }
}
