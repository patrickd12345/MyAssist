# Infisical and team secrets (MyAssist)

**Purpose:** one place for how this repo uses [Infisical](https://infisical.com), the CLI, optional **AI / MCP** integrations, and syncing from `apps/web/.env.local` — so operators and any coding agent (Cursor, CLI, or other) get the same story.

**Also read:** [AGENTS.md](../AGENTS.md) (workstream policy, including *Infisical for agents*), [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) (symptom table), [apps/web/README.md](../apps/web/README.md) (day-to-day app env and Vercel).

---

## 1. What goes where in Infisical

| Path | Use |
|------|-----|
| `/platform` | Bookiji-wide shared secrets (e.g. shared Supabase URL/keys, `SHARED_DB_*` when used) |
| `/myassist` | **MyAssist app** keys: `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`, `AUTH_URL`, Google/Microsoft/Todoist/Resend, Ollama/job-hunt when the team stores them, etc. |

**Environment slugs** (e.g. `dev`, `staging`, `prod`) are chosen in Infisical. Local team dev usually uses **`dev`**. Production deployments mirror the same *names* in Vercel and/or a `prod` env in Infisical — do not use `localhost` for production public URLs.

**Production Option 1 required names:**

- `/platform`: `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`, `SHARED_DB_TIER=prod`, `SHARED_DB_ENV_STRICT=1`
- `/myassist`: `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `MYASSIST_INTEGRATIONS_ENCRYPTION_KEY`, `AI_MODE=gateway`, `VERCEL_AI_BASE_URL` or `AI_GATEWAY_BASE_URL`, `VERCEL_VIRTUAL_KEY` or `AI_GATEWAY_API_KEY` or `OPENAI_API_KEY`, `OPENAI_MODEL` or `AI_GATEWAY_MODEL`, `JOB_HUNT_DIGEST_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TODOIST_CLIENT_ID`, `TODOIST_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `RESEND_API_KEY`, `MYASSIST_PASSWORD_RESET_EMAIL_FROM`

Production values must point at hosted services. Runtime/readiness guards reject configured `localhost`, `127.0.0.1`, `0.0.0.0`, and `[::1]` service URLs in production.

---

## 2. How the app loads secrets locally

1. **Recommended:** from repo root, **`pnpm dev:all`**, or for web only: **`pnpm dev:infisical`** (from root or per `package.json` scripts; implementation pulls `/platform` + `/myassist` into the process — see `scripts/infisical-merge.mjs` and `apps/web/scripts/dev-with-infisical.mjs`).

2. **Infisical CLI** must be installed and, for interactive use, you have run **`infisical login`**. The web app’s folder **`apps/web`** should contain **`.infisical.json`** (from **`infisical init`**, **gitignored**). Commands that need project context are run **from `apps/web`** (or with explicit flags if your team documents otherwise).

3. **Without Infisical:** **`apps/web/.env.local`** only (copy from `apps/web/.env.example`). For stable sessions and production-like checks, still set real `AUTH_SECRET` and URLs here or in the vault.

4. **Strict check without starting Next:** `pnpm verify:infisical` (from `apps/web` or root per scripts) — optional `-- --env=prod` style args as documented in `package.json` / `apps/web/README.md`.

---

## 3. AI assistants and the official Infisical MCP

Infisical ships a **Model Context Protocol** server so tools can list/create/update secrets with proper identity — **not** by pasting API keys into chat.

- **Package:** [`@infisical/mcp` on npm](https://www.npmjs.com/package/@infisical/mcp) — e.g. `npx -y @infisical/mcp`
- **Auth (typical):** [Universal Auth](https://infisical.com/docs/documentation/platform/identities/universal-auth) with a Machine Identity — `INFISICAL_UNIVERSAL_AUTH_CLIENT_ID` and `INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET` — or **`INFISICAL_TOKEN`** with `INFISICAL_AUTH_METHOD=access-token`
- **Source / issues:** [Infisical/infisical-mcp-server](https://github.com/Infisical/infisical-mcp-server)
- **Platform governance (optional org feature):** [Agent Sentinel](https://infisical.com/docs/documentation/platform/agent-sentinel/overview) — MCP endpoints, audit, PII filtering

**This repository does not commit a Cursor/IDE MCP config for Infisical**; add the server in your own `mcp.json` / app settings when you want agents to use it.

---

## 4. Infisical CLI (human or scripts)

**Working directory:** `apps/web` (for `.infisical.json`).

**Examples (dev, `/myassist`):**

```bash
cd apps/web
infisical secrets set KEY=value --path=/myassist --env=dev
```

Use `infisical secrets` / `infisical secrets --help` for your CLI version. Prefer **`--silent`** in CI/scripts to reduce table output. **Never** paste real secret values into public tickets or chat.

---

## 5. Pushing a local `.env.local` into Infisical (keys and values)

When a **trusted** machine has a complete `apps/web/.env.local` and you want the **team `dev` vault** to match it:

| Action | Command (from `apps/web`) |
|--------|---------------------------|
| Create/update **only names missing** in Infisical | `node scripts/sync-env-to-infisical-once.mjs` |
| **Overwrite** every key that exists in `.env.local` with a **non-empty** value (align vault to file) | `node scripts/sync-env-to-infisical-once.mjs --all` |

**Rules:**

- **Empty values** are **skipped** (e.g. `AUTH_SECRET=` placeholder). The script never sends empty strings; Infisical’s **`infisical secrets set --file .env.local`** may **fail** if any key in the file is empty, so the script is the safe path for mixed full/empty lines.
- **Do not commit** `apps/web/.env.local` or use a committed file with real secrets.
- **After a mistake or leak** (e.g. secrets appeared in a log or screen share): **rotate** affected keys in the provider (Supabase, Google, etc.) and update Infisical + Vercel, not just one place.

**Paths/env** in the script are **`/myassist`**, **`dev`** — change the source if the team standardizes a different target (edit the script in one place).

---

## 6. Vercel and production

- `NEXT_PUBLIC_*` is **baked at build time**; set the MyAssist Vercel project’s env for Production/Preview to match the public origin you use (`NEXT_PUBLIC_SITE_URL`, etc.).
- Server secrets (`SUPABASE_SECRET_KEY`, `AUTH_SECRET`, …) must exist on the **same** Vercel project that deploys this app. See [apps/web/README.md](../apps/web/README.md) (Production / Vercel) and [commercial-pilot-readiness.md](./commercial-pilot-readiness.md) where applicable.
- For hosted AI, production must set `AI_MODE=gateway`; local Ollama remains a dev path only.
- For JobHunt digest, production must set `JOB_HUNT_DIGEST_URL`; the app only falls back to `http://127.0.0.1:3847/digest` outside production.

---

## 7. Checklist before blaming “env”

- [ ] Using **`pnpm dev:infisical` or `pnpm dev:all`**, not plain `pnpm dev` alone, when you expect Infisical?
- [ ] **`NEXT_PUBLIC_SITE_URL`** set to the **MyAssist** origin (not a sibling app)?
- [ ] **Supabase** Site URL and Redirect URLs allow your MyAssist host + `/auth/callback`?
- [ ] `pnpm verify:infisical` / `pnpm --prefix apps/web run check:env:prod` clean for the scenario you are testing?

---

*When Infisical workflows, the sync script, or `pnpm dev:infisical` behavior change, update this file, [AGENTS.md](../AGENTS.md), and the Infisical bullets in [apps/web/README.md](../apps/web/README.md) and [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) so they stay in sync.*
