import { NextResponse } from "next/server";
import { ensureAppUser } from "@/lib/ensureAppUser";
import { getSupabaseServerUser } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSupabaseServerUser();
  if (!user) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED" as const }, { status: 401 });
  }

  const result = await ensureAppUser(user);
  if (result.ok) {
    return NextResponse.json({ ok: true as const });
  }
  return NextResponse.json({ ok: false as const, code: result.code });
}
