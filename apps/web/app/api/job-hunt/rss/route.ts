import { NextResponse } from "next/server";
import {
  RSS_SOURCE_ENV_KEYS,
  effectiveUrlsSnapshot,
  readRssSourcesFile,
  rssSourcesFilePath,
  writeRssSourcesFile,
  type RssSourcesFileV1,
} from "job-hunt-manager/config/rss-sources";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type PutBody = {
  overrides?: Partial<Record<(typeof RSS_SOURCE_ENV_KEYS)[number], string[] | null>>;
};

function badRequest(message: string) {
  return NextResponse.json({ ok: false as const, error: message }, { status: 400 });
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const file = readRssSourcesFile();
    const effective = effectiveUrlsSnapshot();
    return NextResponse.json({
      ok: true as const,
      filePath: rssSourcesFilePath(),
      overrides: file.overrides,
      effective,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false as const, error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return badRequest("Invalid JSON");
  }

  const incoming = body.overrides;
  if (!incoming || typeof incoming !== "object") {
    return badRequest("Missing overrides object");
  }

  const current = readRssSourcesFile();
  const next: RssSourcesFileV1 = { version: 1, overrides: { ...current.overrides } };

  for (const key of RSS_SOURCE_ENV_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
    const v = incoming[key];
    if (v === null) {
      delete next.overrides[key];
      continue;
    }
    if (!Array.isArray(v)) {
      return badRequest(`Invalid value for ${key}: expected array or null`);
    }
    const cleaned = v.map((s) => String(s).trim()).filter(Boolean);
    next.overrides[key] = cleaned;
  }

  try {
    writeRssSourcesFile(next);
    return NextResponse.json({
      ok: true as const,
      filePath: rssSourcesFilePath(),
      overrides: readRssSourcesFile().overrides,
      effective: effectiveUrlsSnapshot(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false as const, error: message }, { status: 500 });
  }
}
