## Summary
Set up a **CI pipeline** (GitHub Actions) that runs on every push and pull request: install, typecheck, lint, test, and build.

## Motivation
Issues in this repo are built by automated agents opening PRs. Without CI, regressions slip in silently. A green check on every PR is the safety net that keeps `master` releasable.

## Requirements
- A workflow at `.github/workflows/ci.yml` triggered on `push` and `pull_request`.
- Steps: checkout → setup Node 20+ (with npm cache) → `npm ci` → `npm run typecheck` → `npm run lint` → `npm run test` → `npm run build`.
- Fail the job if any step fails.
- Reasonable matrix is optional; a single `ubuntu-latest` job is sufficient for CI (packaging per-OS is a separate issue).
- Keep it fast: cache `node_modules`/npm appropriately.

## Implementation notes
- Use `actions/checkout@v4`, `actions/setup-node@v4` with `cache: 'npm'`.
- `npm run lint` must succeed — if the current codebase has lint errors, either fix them in this PR or adjust rules deliberately (document why).
- Do not run Electron GUI in CI; only headless typecheck/test/build.

## Acceptance criteria
- [ ] `ci.yml` exists and runs on push + PR.
- [ ] All steps (typecheck, lint, test, build) pass on a clean checkout.
- [ ] The workflow is reasonably cached/fast.
- [ ] A status badge is added to `README.md`.
