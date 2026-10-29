# Contributing to Hasik

Thanks for helping. The short version: branch, small commits, `pnpm verify`, pull request.

1. **Set up** your machine: [docs/guide/01-local-setup-vscode.md](docs/guide/01-local-setup-vscode.md).
2. **Pick or open an issue** and agree on the definition of done.
3. **Branch** from `main`: `feat/…`, `fix/…`, `perf/…`, `docs/…`, `ci/…`, `test/…`, `chore/…`.
4. **Commit** with [Conventional Commits](https://www.conventionalcommits.org): `feat(bots): add aspiration windows`.
5. **Run `pnpm verify`** (lint, format, typecheck, boundaries, README tables, tests).
6. **Open a PR** using the template. CI must be green.
7. **Engine or bot changes** also run the SPRT strength gate. Add the `engine:gainer` label
   if the change claims to make the engine stronger.
8. **Squash and merge** after review.

## House rules

- No `Math.random`, `Date.now` or `performance.now` in `engine`, `bots`, `rating`, `sprt`
  (ESLint enforces it). Use the seeded PRNG and the injected clock.
- Never assume turns alternate: read `state.toMove` (extra turns exist).
- Every new module gets tests, including failure paths.
- Shared message types live in `packages/protocol`.
- README numbers come from `results/` via `pnpm readme:tables`, never typed.
- A non-obvious decision gets an ADR in `docs/decisions/`; a non-trivial bug gets an entry
  in `docs/debug-log.md`.

Full workflow: [docs/guide/05-daily-workflow.md](docs/guide/05-daily-workflow.md).
