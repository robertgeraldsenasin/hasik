# 06. CI/CD

Draft workflow files are in `ci-templates/`. Adapt paths and commands once the repo exists.

## Pipelines

| Workflow | Trigger | Jobs | Blocks merge? |
| --- | --- | --- | --- |
| `ci.yml` | Every push and PR | install (pnpm, cached) → lint → typecheck → dependency-boundary check → unit + property tests with coverage → perft golden tests → build all packages → Playwright smoke test | Yes |
| `strength-gate.yml` | PRs that change `packages/engine/**`, `packages/bots/**`, `packages/tablebase/**` | build base (main) and head engines → SPRT match (non-regression by default; gainer bounds if the PR has the `engine:gainer` label) → post a summary comment with W/D/L, LLR, Elo ± CI | Yes, unless H1 accepted (gainer) or H0 rejected (non-regression); "inconclusive" needs the `strength:override` label |
| `deploy.yml` | Push to `main` | build web → deploy to GitHub Pages/Vercel; (M2) build server and worker images → push to GHCR with `sha` and `latest` tags → deploy to Fly.io/Render → run a post-deploy health check | n/a |
| `preview.yml` | PRs touching `apps/web/**` | build web → deploy a preview (Vercel preview or Pages artifact) → comment the link | No |
| `nightly.yml` | Schedule (daily) and manual | round-robin tournament between current bots → update Glicko-2 ratings → publish leaderboard JSON → open an issue if any bot's rating drops by more than 2·RD | No |

## Quality gates (required checks on `main`)

- `ci / lint`, `ci / typecheck`, `ci / test`, `ci / build`, `ci / e2e`
- `strength-gate / sprt` (when it runs)
- Coverage: at least 90% lines for `packages/engine` and `packages/rating`; at least 80% for `packages/bots`
- No `Math.random` or `Date.now` in `packages/engine` or `packages/bots` (ESLint rule)
- Dependency boundaries respected (03_ARCHITECTURE.md)

## Branch protection

- Require PRs to `main`, at least one review (partner or self after `@claude` review if solo), all required checks green, linear history (squash merges).
- Conventional commit messages (`feat:`, `fix:`, `perf:`, `test:`, `docs:`, `ci:`); release notes generated from them.

## SPRT in CI: practical settings

- Fixed **node budget** per move (not time) so results don't depend on runner load. Example: 20,000 nodes per move.
- Run matches in parallel across the runner's cores (worker threads).
- Max 1,000 game pairs or 20 minutes, whichever comes first.
- Cache the base engine build by commit SHA to save time.
- Upload the raw JSON lines as an artifact; the PR comment links to it.

## Secrets and environments

| Secret | Used by | Notes |
| --- | --- | --- |
| `FLY_API_TOKEN` or `RENDER_API_KEY` | deploy.yml | M2 |
| `DATABASE_URL`, `REDIS_URL` | deploy target env vars, not CI | M2 |
| `VERCEL_TOKEN` (if Vercel) | deploy.yml, preview.yml | |
| `ANTHROPIC_API_KEY` | only if `@claude` PR review is enabled | Never in app code; never in the shell where Claude Code runs |

Environments: `preview` (PRs), `production` (main) with required reviewers for production deploys if the duo wants a manual gate.

## Container images

- Multi-stage Dockerfiles: `deps` → `build` → `runtime` (distroless or `node:lts-slim`), running as a non-root user.
- Health endpoint `/healthz` in the server; Docker `HEALTHCHECK` uses it.
- Image scan (e.g. Trivy) in CI as a non-blocking job to start, blocking later.

## Rollback

- Every deploy is tagged with the commit SHA. Roll back by redeploying the previous SHA's image.
- The web app is static; roll back by re-running deploy on the previous commit.
