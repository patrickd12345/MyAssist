# MyAssist Full App Review (2026-04-17)

## Scope
- Repository-level install/build readiness check.
- Baseline lint/test/typecheck command execution.
- Quick architecture and operational readiness review based on existing docs and workspace layout.

## What I ran
1. `pnpm install`
2. `npm --prefix apps/web run lint`
3. `npm --prefix apps/web run test`
4. `npm --prefix apps/job-hunt-manager run test`
5. `npm --prefix apps/job-hunt-manager run typecheck`
6. `rg -n "file:\.\./\.\./\.\./\.\./packages" apps/web/package.json`

## Findings

### 1) Critical: workspace install is currently blocked
`pnpm install` fails because `apps/web/package.json` declares local file dependencies to paths that do not exist in this repository checkout:

- `@bookiji-inc/persistent-memory-runtime`: `file:../../../../packages/persistent-memory-runtime`
- `@bookiji-inc/stripe-runtime`: `file:../../../../packages/stripe-runtime`

From `apps/web`, `../../../../` resolves above repo root, and these package directories are also not present in this repo’s `packages/` folder.

**Impact**
- Fresh setup cannot complete.
- `next`, `vitest`, and other CLI tools are not installed, causing lint/test failures.

**Recommendation**
- If these packages should be internal workspace packages, add them under `packages/` and switch to `workspace:*`.
- If they are external artifacts, publish and consume by version.
- If they are local-only modules, fix to correct relative path (likely `../../packages/...`) and ensure directories exist.

### 2) Lint and tests cannot run in `apps/web` due to missing dependencies
Because install is blocked, `apps/web` command execution fails early:

- `npm --prefix apps/web run lint` → `next: not found`
- `npm --prefix apps/web run test` → `vitest: not found`

**Impact**
- CI/local quality gate cannot execute from a clean environment.

### 3) `apps/job-hunt-manager` quality gates also blocked in this environment
`apps/job-hunt-manager` test command fails (`vitest: not found`) and `typecheck` reports missing Node and package type resolution (e.g., `node:fs`, `zod`, MCP SDK), consistent with dependencies not being installed.

**Impact**
- Cannot verify runtime correctness or type safety in clean setup.

## Overall status
**Not release-ready from clean checkout** due to install path/dependency contract issues.

## Priority action plan
1. Restore deterministic installation (`pnpm install` succeeds on clean machine).
2. Re-run lint/test/typecheck in both `apps/web` and `apps/job-hunt-manager`.
3. Gate merges on these checks in CI to prevent recurrence.
