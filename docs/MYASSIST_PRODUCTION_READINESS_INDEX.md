# MyAssist Production Readiness Evidence Index

This index tracks MyAssist production deployment readiness evidence across MYA-DEPLOY tasks. It records documentation, verification commands, current results, and unresolved blockers without storing secret values.

| ID | Title | Status | Files changed | Verification run | Result | Notes / blockers |
| --- | --- | --- | --- | --- | --- | --- |
| MYA-DEPLOY-001 | Production smoke checklist doc | Complete | `docs/MYASSIST_PRODUCTION_SMOKE.md` | Documentation review; production smoke checklist captured. | Complete | Checklist exists for production app load, auth, provider integrations, assistant, JobHunt, localhost leak checks, evidence capture, and stop conditions. |
| MYA-DEPLOY-002 | Env readiness output hardening | Complete | Readiness/env docs and scripts from prior task; exact file list not reconciled in this index pass. | Env readiness hardening tests. | Complete | Env readiness output hardened with grouped output, exit codes (0/1/2), localhost detection, and tests passing. |
| MYA-DEPLOY-006 | Playwright production smoke harness | Complete | Production smoke harness files from prior task; exact file list not reconciled in this index pass. | `pnpm --prefix apps/web run test:smoke:prod` | Production smoke passed 7/7 | Treat as complete based on supplied readiness seed. Preserve production URL evidence separately and redact secret-bearing output. |
| MYA-DEPLOY-007 | One-command production readiness verdict | Launched / pending final readiness evidence | `docs/MYASSIST_PRODUCTION_SMOKE.md` | `pnpm --prefix apps/web run readiness:prod` | Pending | Smoke doc now documents deterministic `readiness:prod` verdicts and blocker categories. Final PASS remains blocked until production env and deployment prerequisites pass. |
| MYA-DEPLOY-008 | Production secrets gap runbook | Complete | `docs/MYASSIST_PRODUCTION_SECRETS_RUNBOOK.md` | `pnpm --prefix apps/web run verify:infisical -- --env=prod`; `pnpm --prefix apps/web run check:env:prod:infisical`; `pnpm --prefix apps/web run readiness:prod:infisical` | BLOCKED ON ENV | Runbook exists. 2026-04-24 run confirmed: Infisical prod accessible (8+18 keys). 5 values still missing: AI gateway key, JOB_HUNT_DIGEST_URL, MICROSOFT_CLIENT_ID/SECRET, RESEND_API_KEY, MYASSIST_PASSWORD_RESET_EMAIL_FROM. Lint/typecheck/vitest all PASS. |
| MYA-DEPLOY-012 | Readiness failure classification mapping | Complete | `apps/web/scripts/readiness-prod.mjs`; `docs/MYASSIST_PRODUCTION_SMOKE.md`; `docs/MYASSIST_PRODUCTION_READINESS_INDEX.md` | `node --check apps/web/scripts/readiness-prod.mjs` | Complete | Script syntax verified clean. Failure classification (BLOCKED ON ENV / BLOCKED ON OAUTH / BLOCKED ON DEPLOYMENT / FAIL) wired and documented in smoke doc. |
| OPTION-B | Option B production green readiness verification | Run 2026-04-24 | `docs/MYASSIST_PRODUCTION_SMOKE.md`; `docs/MYASSIST_PRODUCTION_READINESS_INDEX.md` | lint (exit 0), typecheck (exit 0), vitest 516 passed (exit 0), verify:infisical prod (8+18 keys loaded), check:env:prod:infisical (exit 1) | BLOCKED ON ENV | Engineering checks PASS. Only real-world provisioning blocks Option B green: AI key, JOB_HUNT_DIGEST_URL, and optionally Microsoft OAuth + Resend. No localhost leaks. No product-code failures. |

## Maintenance Notes

- Keep this file docs-only unless a future task explicitly widens scope.
- Update the `Files changed`, `Verification run`, and `Result` columns when each readiness task is reconciled with concrete evidence.
- Do not paste secret values, raw tokens, or unredacted provider output into this index.
