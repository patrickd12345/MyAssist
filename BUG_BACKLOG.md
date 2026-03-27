# BUG_BACKLOG

## P0
- None confirmed in this run.

## P1
### 1) Concurrent registration/sign-in race on local user store (Fixed)
- Title: Concurrent registration can fail immediate sign-in.
- User impact: New users intermittently fail to land on dashboard after registration under parallel traffic/tests.
- Repro:
1. Run multiple registration flows in parallel (Playwright workers).
2. Submit Register and wait for auto sign-in.
3. Some sessions stay on sign-in with `Registered. Please sign in.`.
- Likely root cause: Non-atomic JSON store writes plus concurrent read/write windows in `users.json`.
- Recommended smallest fix: Add store-level mutation lock, atomic temp-file+rename writes, and read retry for transient contention.

### 2) `/api/job-hunt/saved` emitted 500 when digest was unavailable (Fixed)
- Title: Dashboard job-hunt saved-jobs fetch returned server 500 on offline digest.
- User impact: Health noise/API 500s and degraded reliability perception when digest process is down.
- Repro:
1. Stop digest service (`http://127.0.0.1:3847`).
2. Open dashboard (which calls `/api/job-hunt/saved`).
3. Observe 500 response from route.
- Likely root cause: Route catch path returned HTTP 500 instead of graceful empty payload.
- Recommended smallest fix: Return structured empty result (`jobs: []`) without 5xx on upstream-unreachable path.

## P2
### 1) Draft reinjection edge case after leaving Assistant tab (Fixed)
- Title: Repeating same inbox draft action could open Assistant without draft card.
- User impact: User can appear to lose a draft when re-triggering the same draft from Inbox.
- Repro:
1. Click `Draft reply` on an Inbox job-hunt signal.
2. Return to Inbox.
3. Click the same `Draft reply` again.
4. Assistant can open with no injected draft in specific state timing.
- Likely root cause: Duplicate-suppression fingerprint check not scoped to current Assistant tab state.
- Recommended smallest fix: Only suppress duplicates while already on Assistant; allow reinjection from Inbox.

### 2) E2E selectors stale/brittle after UI evolution (Fixed)
- Title: Auth/Job-hunt e2e tests failed due non-unique selectors and stale text assumptions.
- User impact: CI false negatives reduce confidence in release signal.
- Repro:
1. Run `pnpm run web:test:e2e`.
2. Observe strict-mode locator failures and stale heading assertion failures.
- Likely root cause: Tests used ambiguous labels (`Password`, `Sign in`) and fixed heading text no longer guaranteed.
- Recommended smallest fix: Use stable element ids/form-scoped selectors and URL-driven assertions for route transitions.
