import { NextResponse } from "next/server";
import {
  checkRegisterRateLimit,
  clientIpFromRequest,
} from "@/lib/registerRateLimit";
import { createUser } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ipLimit = checkRegisterRateLimit(clientIpFromRequest(req));
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(ipLimit.retryAfterSec) },
        },
      );
    }

    const body = (await req.json()) as {
      email?: unknown;
      password?: unknown;
      inviteCode?: unknown;
    };
    const expectedInvite = process.env.MYASSIST_REGISTRATION_INVITE_CODE?.trim();
    if (expectedInvite) {
      const code = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";
      if (code !== expectedInvite) {
        return NextResponse.json({ error: "Could not complete registration." }, { status: 400 });
      }
    }

    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    await createUser({ email, password });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "DUPLICATE" || error.message === "INVALID_INPUT")) {
      return NextResponse.json({ error: "Could not complete registration." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not complete registration." }, { status: 400 });
  }
}
