# ADR-0004: Retire constraint C1 (hand-written core)

- Status: Accepted. Supersedes C1 in `docs/spec/07_CONSTRAINTS.md`.
- Date: 2026-10-29

## Context

C1 reserved the rules engine, search, MCTS, tablebase, Glicko-2, SPRT math and PRNG
for hand-writing, so they could be defended in interviews. The project owner chose
instead to have a complete, working implementation of the whole system from the start.

## Options

1. Keep C1: the shell is built around stubs; nothing plays until the core is written.
2. Reference core with swap-in: an assisted core now, replaced by a hand-written one
   that must pass the same tests.
3. Retire C1: the core is implemented now and owned like the rest of the code.

## Decision

Option 3.

## Consequences

- The core's correctness rests on its tests, not on who typed it: a hand-traced rules
  test, an independent reference implementation (differential testing), property tests,
  perft golden values, classic-minimax equivalence for alpha-beta, Glickman's worked
  example and hand-computed SPRT values.
- Interview readiness now comes from studying the code: `docs/guide/03-architecture-tour.md`
  maps every algorithm to its file and the lines worth explaining.
- The README's AI-use note says which parts were AI-assisted (constraint C6 still applies).
