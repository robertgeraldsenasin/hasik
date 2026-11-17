# 08. Roadmap

Milestone 1 is done. The rest follows `docs/spec/08_GAMEPLAN.md`, in the cut order of
constraint C5 (never cut tests, the strength gate or the README results).

## Milestone 1: MVP (done)

- [x] Rules engine with variant flags, perft, Zobrist, seeded PRNG
- [x] Random, Greedy, Minimax (alpha-beta, ID, TT, ordering, extension), MCTS
- [x] Arena CLI with paired games on worker threads; 200-opening book
- [x] Glicko-2 leaderboard; SPRT math and CLI
- [x] Web app: Canvas board, sowing animation, Web Worker, 5 levels + MCTS, engine insight
- [x] CI (lint, typecheck, test with coverage gates, build, e2e), strength gate, Pages deploy, nightly tournament
- [x] README with generated tables, 8 ADRs, this guide

## Before calling M1 "shipped"

- [ ] First push and `scripts/setup-github.sh` (guide 04)
- [ ] Watch the first `ci` and `deploy` runs go green; check the live link
- [ ] Prove the gate: open a PR that deliberately weakens the eval (e.g. set `capture: 0`) and watch SPRT fail it
- [ ] Record a 60-90 s demo video and a GIF for the README (`docs/media/demo.gif`)
- [ ] Fill in the credits (who built what)
- [ ] Rerun `roundrobin`, `bench`, `ablation` on your own laptop for the README

## Milestone 2: depth and online play

| Task                                              | Notes                                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Retrograde endgame tablebase (N = 6, then 8)      | `packages/tablebase`; layered value iteration with a cycle cap; probe in minimax; test tablebase value = full search |
| Ablations with more pairs                         | 200 pairs per technique to shrink the Elo intervals                                                                  |
| TT reuse between moves                            | Measure with SPRT at fixed time (ADR-0002 follow-up)                                                                 |
| Hint mode (done)                                  | Every legal move searched with a fixed node budget; scores shown on the board (`apps/web/src/worker/analyze.ts`)     |
| Fastify + WebSocket server                        | `apps/server`; validates every message with `packages/protocol`; rate limits; `/healthz`                             |
| Postgres (Drizzle)                                | Games, moves, ratings, SPRT runs; replays                                                                            |
| Redis + BullMQ worker                             | Scheduled tournaments; live leaderboard API                                                                          |
| Docker images to GHCR, deploy to Fly.io or Render | Multi-stage, non-root; decide hosting in a new ADR                                                                   |

## Milestone 3: stretch

Rust/WebAssembly engine with matching perft; SPSA tuning validated by SPRT; Swiss
tournaments; opening book from self-play.

## How we'll work through it

Each task becomes an issue with a definition of done, then a branch and a PR (guide 05).
