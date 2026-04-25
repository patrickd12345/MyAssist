# MYA-DEPLOY-008 MyAssist Production Secrets Gap Runbook

This runbook closes the remaining MyAssist production environment blockers without exposing, copying, or inventing secret values. Use key names, owners, and verification results only.

## Current Blocker List

- `VERCEL_VIRTUAL_KEY` or `OPENAI_API_KEY`
- `JOB_HUNT_DIGEST_URL`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `RESEND_API_KEY`
- `MYASSIST_PASSWORD_RESET_EMAIL_FROM`

## Infisical Paths

Production secrets are sourced from Infisical using the MyAssist production environment:

- `/platform`
- `/myassist`

Resolution order follows the Bookiji secret standard: shared `/platform` first, then product-specific `/myassist`.

## Vercel Project

Production env values must be mirrored into this Vercel project:

- `my-assist`

Do not update a sibling or legacy Vercel project when validating `https://myassist.bookiji.com`.

## Secret Ownership Table

| Variable | Required for | Source of truth | Destination | Required for PASS? | Notes |
| --- | --- | --- | --- | --- | --- |
| `VERCEL_VIRTUAL_KEY` or `OPENAI_API_KEY` | Assistant gateway inference when `AI_MODE=gateway` | Infisical `/myassist` | Vercel project `my-assist`, Production environment | Yes | Prefer the approved AI gateway key name already used by the deployment. Do not place placeholder API keys in Infisical or Vercel. |
| `JOB_HUNT_DIGEST_URL` | Production JobHunt saved jobs and digest route | Infisical `/myassist` | Vercel project `my-assist`, Production environment | Yes | Must be a hosted URL. Localhost, `127.0.0.1`, `::1`, and laptop-only service URLs keep production blocked. |
| `MICROSOFT_CLIENT_ID` | Supabase/Auth.js Microsoft Outlook login provider | Infisical `/myassist` | Vercel project `my-assist`, Production environment | Conditional | Required for PASS when Microsoft OAuth is enabled. If Microsoft OAuth is intentionally disabled, record the feature-gating decision before marking N/A. |
| `MICROSOFT_CLIENT_SECRET` | Supabase/Auth.js Microsoft Outlook login provider | Infisical `/myassist` | Vercel project `my-assist`, Production environment | Conditional | Must match the Microsoft Entra app registration for `https://myassist.bookiji.com/api/auth/callback/microsoft-entra-id`. Do not paste or log the value. |
| `RESEND_API_KEY` | Production password-reset email delivery | Infisical `/myassist` | Vercel project `my-assist`, Production environment | Conditional | Required for PASS when password reset email is enabled. If password reset is intentionally disabled, record the decision before marking N/A. |
| `MYASSIST_PASSWORD_RESET_EMAIL_FROM` | Verified sender for production password-reset email | Infisical `/myassist` | Vercel project `my-assist`, Production environment | Conditional | Must be a Resend-verified sender/domain. Do not use fake sender addresses to satisfy readiness. |

## Feature Gating Decisions

- Microsoft OAuth can be `PASS` only if it is enabled and real Microsoft credentials exist in Infisical and the `my-assist` Vercel Production environment.
- Microsoft OAuth can be `N/A` only if the provider is intentionally disabled and the smoke evidence records that decision.
- Password reset can be `N/A` only if it is intentionally disabled.
- JobHunt digest is `BLOCKED ON ENV` until a hosted `JOB_HUNT_DIGEST_URL` exists.
- Assistant is `BLOCKED ON ENV` until the AI gateway key exists.

## Safe Verification Commands

Run from `products/MyAssist`. These commands must not print raw secret values.

```sh
pnpm --prefix apps/web run verify:infisical -- --env=prod
pnpm --prefix apps/web run check:env:prod
pnpm --prefix apps/web run readiness:prod
```

For production smoke against the public host:

```powershell
$env:PLAYWRIGHT_PROD_SMOKE_BASE_URL='https://myassist.bookiji.com'
pnpm --prefix apps/web run test:smoke:prod
```

## Forbidden Actions

- No placeholder secrets.
- No localhost production URLs.
- No disabling checks to force pass.
- No editing production logic to bypass env checks.

## Final PASS Criteria

- `verify:infisical` passes.
- `check:env:prod` passes under the intended env-loading mode.
- `readiness:prod` returns `PASS`.
- Production smoke has no 500s and no localhost leaks.

## Evidence To Capture

- Confirmation that the Infisical paths checked were `/platform` and `/myassist`.
- Confirmation that the Vercel project checked was `my-assist`.
- Command names, exit codes, and final verdicts.
- Any `N/A` feature decision and the reason it is intentional.
- Redacted screenshots or logs only when they do not expose secret values.
