import { NextResponse } from "next/server";
import { isValidUiVariant, persistUiVariant, type UiVariant } from "@/lib/uiVariant";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const variant = (payload as { variant?: unknown } | null)?.variant;
  if (!isValidUiVariant(variant)) {
    return NextResponse.json(
      { error: "Invalid variant. Expected 'classic' or 'refactor'." },
      { status: 400 },
    );
  }

  const res = NextResponse.json({ ok: true, variant: variant as UiVariant });
  persistUiVariant(res, variant);
  return res;
}

