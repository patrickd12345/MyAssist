# MyAssist QA manual checklist

Use this alongside automated tests (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build` in `apps/web`). Record date, commit, and pass/fail per row.

## Auth

| Step | Pass |
| ---- | ---- |
| Register at `/sign-in`, land on dashboard | |
| Sign out and sign in again | |
| Forgot password → email/token path if applicable (`/forgot-password`, `/reset-password`) | |

## Today dashboard (`/`)

| Step | Pass |
| ---- | ---- |
| Overview loads; headline / situation brief appear without infinite spinner | |
| **Refresh** completes (bounded wait; not stuck on "Refreshing…") | |
| Copy payload / theme switch / energy toggle as applicable | |
| Tabs: Overview, Tasks, Inbox, Calendar, Assistant | |

## Data paths

| Step | Pass |
| ---- | ---- |
| First visit: cache behavior matches expectations (`GET /api/daily-context?source=cache` 404 then live fetch if applicable) | |
| No infinite spinners on panels | |

## Assistant

| Step | Pass |
| ---- | ---- |
| Submit via **Ask** on the assistant form (not textarea-only) | |
| Reply appears or explicit in-UI error (no silent failure) | |

## Job Hunt

| Step | Pass |
| ---- | ---- |
| Navigate to `/job-hunt`; cockpit shell visible | |

## Mobile (~375px width)

| Step | Pass |
| ---- | ---- |
| No horizontal overflow on main views | |
| Text readable (light theme contrast) | |
| Task actions: Complete / Defer / Block usable (touch targets) | |

## Production-like

| Step | Pass |
| ---- | ---- |
| `pnpm clean && pnpm build` succeeds | |
| Optional: `pnpm start` smoke after build | |

## Hosted / live integrations (manual)

| Step | Pass |
| ---- | ---- |
| Gmail + Calendar + Todoist connected; Refresh shows live data | |
| OAuth banner clears; query params stripped from URL | |
