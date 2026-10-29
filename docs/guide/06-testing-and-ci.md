# 06. Testing and CI

## The test pyramid

| Level                     | Where                                                      | Runs                              |
| ------------------------- | ---------------------------------------------------------- | --------------------------------- |
| Unit                      | `packages/*/test/*.test.ts`, `apps/web/test`               | Every push (`pnpm test`)          |
| Differential              | `packages/engine/test/properties.test.ts` + `reference.ts` | Every push                        |
| Property (fast-check)     | `packages/engine/test/properties.test.ts`                  | Every push                        |
| Golden (perft)            | `packages/engine/test/perft.test.ts`                       | Every push                        |
| Search correctness        | `packages/bots/test/search.test.ts`                        | Every push                        |
| Statistics                | `packages/rating/test`, `packages/sprt/test`               | Every push                        |
| Integration (worker pool) | `packages/arena/test/arena.test.ts`                        | Every push                        |
| End-to-end                | `apps/web/e2e/smoke.spec.ts` (Playwright)                  | Every push and PR                 |
| Strength                  | `strength-gate.yml` (SPRT)                                 | PRs that touch the engine or bots |

Run one package: `pnpm --filter @hasik/engine test`. Run one file in VS Code: open it
and use the Testing panel, or press F5 with "Tests: debug current test file".

## Coverage gates

`pnpm test:coverage` enforces line/function/statement coverage per package: engine,
rating, sprt 90%; bots 80%; protocol 80%; arena 70% (the CLI entry point is excluded
because it is exercised by real runs, not unit tests). **Why gates:** coverage only
matters if dropping it fails the build.

## Writing a new test

- Name the behaviour, not the function: `it('a capture moves the landing shell plus the opposite house into the store')`.
- Build positions with `pos()` from `packages/engine/test/helpers.ts`: describe only the
  houses that matter; the rest of the 98 shells go to a store.
- Test failure paths too: illegal moves, finished games, malformed messages, timeouts.
- If you change the rules on purpose, perft golden values will fail. Update them in the
  same PR as an ADR explaining the rule change.

## What CI does (`.github/workflows/ci.yml`)

| Job         | Steps                                                            | Why separate                               |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------ |
| `lint`      | ESLint, Prettier check, dependency boundaries                    | Fast feedback on style and architecture    |
| `typecheck` | `tsc` in every package via Turborepo                             | Type errors are their own class of failure |
| `test`      | All tests with coverage gates; coverage table in the run summary | The core quality signal                    |
| `build`     | Bots bundle + web app; perft speed in the run summary            | Proves the shipped artifacts build         |
| `e2e`       | Production build + Playwright smoke test                         | Proves the real page works                 |

Each job is a required check on `main`. A shared composite action
(`.github/actions/setup`) installs pnpm, Node from `.nvmrc` and dependencies with caching,
so all jobs use the same toolchain.

## Reading a red run

1. Open the failing job; the step name tells you which category failed.
2. Reproduce locally with the same command (`pnpm lint`, `pnpm typecheck`, `pnpm test`, ...).
3. For e2e failures, download the `playwright-report` artifact and open `index.html`: it
   has a trace of every step.
4. For coverage drops, the `coverage` artifact has `lcov.info` per package.

## Benchmarks (`pnpm bench`)

Median of 5 runs for perft; search nodes/s and depth at 200 ms and 1 s; nodes to finish
depth 6 with each technique added. Hardware is recorded with the results, because a
number without hardware is meaningless. Investigate any regression over 20%.
