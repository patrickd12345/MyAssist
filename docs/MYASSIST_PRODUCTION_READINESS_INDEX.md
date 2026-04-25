# MyAssist Production Readiness Evidence Index

This index tracks MyAssist production deployment readiness evidence across MYA-DEPLOY tasks. It records documentation, verification commands, current results, and unresolved blockers without storing secret values.

| ID | Title | Status | Files changed | Verification run | Result | Notes / blockers |
| --- | --- | --- | --- | --- | --- | --- |
| MYA-DEPLOY-001 | Production smoke checklist doc | Complete | `docs/MYASSIST_PRODUCTION_SMOKE.md` | Documentation review; production smoke checklist captured. | Complete | Checklist exists for production app load, auth, provider integrations, assistant, JobHunt, localhost leak checks, evidence capture, and stop conditions. |
| MYA-DEPLOY-002 | Env readiness output hardening | Complete | Readiness/env docs and scripts from prior task; exact file list not reconciled in this index pass. | Env readiness hardening tests. | Complete | Env readiness output hardened with grouped output, exit codes (0/1/2), localhost detection, and tests passing. |
| MYA-DEPLOY-006 | Playwright production smoke harness | Complete | Production smoke harness files from prior task; exact file list not reconciled in this index pass. | `pnpm --prefix apps/web run test:smoke:prod` | Production smoke passed 7/7 | Treat as complete based on supplied readiness seed. Preserve production URL evidence separately and redact secret-bearing output. |
| MYA-DEPLOY-007 | One-command production readiness verdict | Launched / pending final readiness evidence | `docs/MYASSIST_PRODUCTION_SMOKE.md` | `pnpm --prefix apps/web run readiness:prod` | Pending | Smoke doc now documents deterministic `readiness:prod` verdicts and blocker categories. Final PASS remains blocked until production env and deployment prerequisites pass. |
| MYA-DEPLOY-008 | Production secrets gap runbook | Launched / pending closure | `docs/MYASSIST_PRODUCTION_SECRETS_RUNBOOK.md` | `pnpm --prefix apps/web run verify:infisical -- --env=prod`; `pnpm --prefix apps/web run check:env:prod`; `pnpm --prefix apps/web run readiness:prod` | Pending / blocked on env | Runbook exists and lists remaining blocker key names only. Do not edit Infisical, Vercel, or secrets from this index task. |
| MYA-DEPLOY-012 | Readiness failure classification mapping | Pending execution result | `apps/web/scripts/readiness-prod.mjs`; `docs/MYASSIST_PRODUCTION_SMOKE.md`; `docs/MYASSIST_PRODUCTION_READINESS_INDEX.md` | `pnpm --prefix apps/web run readiness:prod`; `node --check apps/web/scripts/readiness-prod.mjs`; `git diff --check -- apps/web/scripts/readiness-prod.mjs docs/MYASSIST_PRODUCTION_SMOKE.md docs/MYASSIST_PRODUCTION_READINESS_INDEX.md` | Pending | Readiness output should classify each failed/skipped step with blocker class, reason, and next action. Final PASS remains blocked until production env and deployment prerequisites pass. |

## Maintenance Notes

- Keep this file docs-only unless a future task explicitly widens scope.
- Update the `Files changed`, `Verification run`, and `Result` columns when each readiness task is reconciled with concrete evidence.
- Do not paste secret values, raw tokens, or unredacted provider output into this index.
