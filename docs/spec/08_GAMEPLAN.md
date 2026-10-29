# 08. Gameplan

Two parallel tracks all the way: **You** (hand-written core, decisions, review) and **Claude Code** (scaffolding, UI, CI, tests, docs). Start each Claude Code task in plan mode, approve, then let it run while you work on the core.

## Day 1: MVP (about 12 focused hours)

| Time | You | Claude Code (in parallel) | Done when |
| --- | --- | --- | --- |
| 0:00-1:00 | Write the rules doc in your own words; reconcile with 02_GAME_RULES.md; fill in `RuleConfig` defaults; write ADR-0001 (rule variant) | Scaffold monorepo (pnpm + Turborepo), TS strict, ESLint (with the `Math.random` ban), Prettier, Vitest, `ci.yml` skeleton | Repo builds; CI runs green on an empty test |
| 1:00-3:00 | **A1** rules engine + **A12** PRNG | Generate unit tests from the 02 checklist and property tests (fast-check) against the engine API | All rule tests and property tests pass |
| 3:00-3:30 | **A2** perft; record golden values | Bench script skeleton in `tools/bench` | Perft golden test locked |
| 3:30-5:30 | **A3** Zobrist + **A4** alpha-beta, iterative deepening, TT, **A6** ordering, **A5** eval | Random and Greedy bots (not core); arena runner CLI with game pairs, JSON lines output; opening sampler file generation | Minimax beats Greedy in a quick 50-pair match |
| 5:30-6:00 | Break | Web app: Canvas board, click to move, sowing animation, bot in a Web Worker, level picker | Can play vs level 3 locally |
| 6:00-7:30 | **A8** MCTS | Leaderboard page reading static JSON | MCTS runs within budget and beats Random |
| 7:30-8:30 | **A9** Glicko-2 with the worked-example test | Arena script: round robin → results JSON → ratings | Leaderboard shows ratings ± RD |
| 8:30-9:30 | **A10** SPRT math with hand-computed test values | `strength-gate.yml`: build base and head, run SPRT, comment results | A deliberately weakened PR fails the gate |
| 9:30-10:30 | Review every Claude-written diff; fix anything you don't understand | `deploy.yml` to GitHub Pages/Vercel; Playwright smoke test | Live link works |
| 10:30-12:00 | Run the full round robin and the benchmarks; check numbers | README from 10_README_TEMPLATE.md with generated tables; record a GIF | README has real numbers and a live link |

**Day 1 definition of done:** live link, five bots, ratings table, green CI including the strength gate, README with results. If behind schedule, drop MCTS to day 2 before anything else.

## Day 2: tablebase and polish

- **A7** retrograde tablebase for N = 6, then N = 8; probe in search; tests against full search
- Ablation runs: TT on/off, ordering on/off, tablebase on/off; add the Elo table to the README
- Hint mode in the UI (principal variation, depth, nodes per second)
- ADRs for TT design, extension cap, tablebase indexing

## Day 3: online play (M2)

- Fastify server with WebSocket rooms; protocol package with zod schemas
- Postgres schema (Drizzle) and game persistence
- Docker images, GHCR push, deploy server; health check
- Integration tests for illegal moves, reconnects, persistence

## Day 4: tournaments and replays

- Redis + BullMQ, worker app, nightly tournament workflow
- Live leaderboard API
- Replay viewer
- Demo video (60-90 s) and a LinkedIn post

## Stretch (any time after day 4)

Rust/WASM engine with matching perft, SPSA tuning validated by SPRT, Swiss tournaments, opening book.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Rule ambiguity causes rework | Hour 1 rules doc + `RuleConfig` flags; ADR-0001 records the chosen variant |
| Extra-turn handling breaks search sign | Alpha-beta vs plain-minimax equality test on random positions |
| SPRT too slow in CI | Node-limited matches, parallel workers, game-pair cap, cached base build |
| Relay sowing loops | `maxSowSteps` guard + property test that games terminate |
| Tablebase cycles | Layered value iteration with a cap; `UNKNOWN` fallback |
| Free-tier limits | M1 runs entirely static (no server); M2 services are optional for the demo |
| Time overrun | Cut order in 07_CONSTRAINTS.md C5 |

## Daily routine while building

1. Morning: pick the day's milestones from this file; open Claude Code tasks in plan mode.
2. Work the core while Claude Code builds the shell.
3. Review diffs between core sessions, never at the end of the day.
4. Evening: update README numbers, debug log, and push a short devlog note.
