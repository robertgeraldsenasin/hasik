## What and why

<!-- One or two sentences. Link the issue: Closes #123 -->

## Type

- [ ] feat · [ ] fix · [ ] perf · [ ] refactor · [ ] test · [ ] docs · [ ] ci · [ ] chore

## Engine changes (only if `packages/engine` or `packages/bots` changed)

- [ ] The strength gate runs automatically. Add `engine:gainer` if this PR claims to make the engine **stronger**.
- [ ] Perft golden values unchanged, or changed together with an ADR explaining the rule change.

## Checklist

- [ ] `pnpm verify` passes locally (lint, format, typecheck, boundaries, tests)
- [ ] New code has tests, including failure paths
- [ ] Docs / ADR updated if behaviour or a decision changed
- [ ] README numbers regenerated (`pnpm readme:tables`) if results changed
