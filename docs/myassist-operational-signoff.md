# MyAssist operational sign-off (pilot)

Use this checklist to close the remaining **Now** items in [`PROJECT_TRACKER.md`](../PROJECT_TRACKER.md): live AI path, live Today view after OAuth, and stable adapter boundaries.

## 1. Live Ollama vs gateway

**Local (Ollama)**

- Ollama is running on the same host the Next.js server can reach (`OLLAMA_BASE_URL`, default `http://127.0.0.1:11434`).
- Required models are pulled (`ollama pull` as needed).
- Sign-in, open **Assistant**, send a short question. In **Network**, inspect `POST /api/assistant`: JSON should show `mode: "ollama"` when the model responds (not only `fallback`). Server logs may show `assistant_chat_completed` vs `assistant_chat_fallback`.

**Hosted (gateway)**

- Vercel (or host) env: `AI_MODE=gateway`, gateway base URL + key, model vars per [`commercial-pilot-readiness.md`](./commercial-pilot-readiness.md) **AI inference**.
- Same assistant request: `mode` / `provider` should reflect **gateway**, not only **fallback**.

**Optional automated**

- From `apps/web`, hosted Supabase round-trip (no provider OAuth):  
  `RUN_MYASSIST_HOSTED_SMOKE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/hostedRuntimeSmoke.test.ts`  
  (see header in [`apps/web/lib/hostedRuntimeSmoke.test.ts`](../apps/web/lib/hostedRuntimeSmoke.test.ts)).

## 2. Live Gmail / Calendar / Todoist Today (manual)

Prerequisites: **not** `MYASSIST_USE_MOCK_CONTEXT` / **not** `MYASSIST_DEMO_MODE` for this pass. Real OAuth clients and redirect URIs for this origin.

1. Register or sign in.
2. Connect **Google** (Gmail + Calendar) and **Todoist** from the dashboard.
3. After redirect, confirm the OAuth banner (if shown) and that **Today** updates without relying only on the manual Refresh control.
4. In DevTools **Network**, select `GET /api/daily-context`: response header **`x-myassist-context-source`** should be **`live`** when mocks/demo are off.
5. Spot-check: inbox/calendar/tasks sections show data consistent with each provider (at least one real row per connected provider where data exists).

## 3. Adapter boundaries (process)

- No new runtime dependency on n8n for product paths (n8n remains **dormant** per tracker).
- Provider reads/writes stay in existing adapters and services; no new mirror tables for provider entities.
- After a change set, confirm [`docs/architecture.md`](./architecture.md) still matches how data flows.

**Sign-off:** Record date and environment (e.g. local, Vercel production) in the tracker or team notes when the above are satisfied.
