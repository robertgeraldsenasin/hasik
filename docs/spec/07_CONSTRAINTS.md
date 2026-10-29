# 07. Constraints

These are fixed. Change one only with an ADR explaining why.

## C1. Hand-written core

Gerald writes these himself. Claude (chat or Claude Code) may explain concepts, review, write tests, and point out bugs, but does not write or rewrite the implementation.

- `packages/engine/src/core/**`: rules, move generation, Zobrist, perft
- `packages/bots/src/search/**`: minimax/alpha-beta/ID/TT, move ordering, evaluation, MCTS
- `packages/tablebase/src/**`: retrograde generator and probe
- `packages/rating/src/glicko2.ts`
- `packages/sprt/src/math.ts`
- `packages/engine/src/prng.ts`

Everything else (UI, server, worker, arena CLI, CI, Docker, README drafts, test scaffolding) may be written with Claude Code, reviewed line by line before merge.

Why: interviewers probe exactly these parts. Gerald must be able to whiteboard each one.

## C2. Determinism

- No `Math.random`, `Date.now`, `performance.now` or `crypto.getRandomValues` inside engine and bots, except a time-check function injected from outside.
- All randomness flows from the seeded PRNG; seeds are recorded.
- Engine functions are pure: input state is never mutated.

## C3. Correctness invariants

- Total shells = 98 after every move.
- `legalMoves` = own non-empty houses, nothing else.
- Incremental Zobrist hash = full recompute.
- Alpha-beta value = plain minimax value at small depths.
- Tablebase value = full search value on covered positions.

All five are tests (05_METHODOLOGY.md).

## C4. Performance budgets

| Item | Budget |
| --- | --- |
| Page load (web, M1) | Under 5 s on a mid-range laptop on a normal connection; engine bundle under 100 KB gzipped |
| Bot move in the browser | Never blocks the UI thread; level 4 under 200 ms, level 5 under 1,000 ms |
| Perft depth 6 from start | Record the time; investigate regressions over 20% |
| Server move validation (M2) | Under 5 ms p95 |
| CI total time | Under 10 min without the strength gate; strength gate under 20 min |
| Tablebase N = 8 generation | Under 5 min on a laptop; probe under 1 µs average |

## C5. Scope guardrails

- Single-round Sungka only. No burnt-house multi-round rules in M1/M2.
- No accounts with passwords.
- No paid services; free tiers only, and check their current terms.
- Original art and name only. Don't copy any existing Sungka app's visuals, name or code; don't prompt image tools for other games' styles.
- Cut order if time runs short: Rust/WASM → SPSA → Swiss tournaments → replays UI → online multiplayer → tablebase. Never cut tests, the strength gate, or the README results table.

## C6. Honesty

- Every number in the README comes from a committed results file and a script.
- AI-use note in the README: what Claude Code wrote (scaffolding, UI, CI, tests), what was hand-written (C1), and how AI output was verified.
- Credits section: who built what (Zea / Soul).
- Sungka rules note: "Rules follow the variant described in docs/spec/02_GAME_RULES.md; regional variants differ."

## C7. Security basics

- Validate every client message with zod; reject unknown fields.
- Rate-limit moves per connection (e.g. 10 per second).
- No secrets in the repo or client bundle; `.env.example` only.
- Server runs as non-root in the container.

## C8. Claude usage budget

- Chat, Claude Code and IDE use share the same plan limits. Batch heavy agent sessions and check `/status`.
- Keep any `ANTHROPIC_API_KEY` out of the shell where Claude Code runs, or Claude Code bills that key instead of the plan.
- This project does not need the Claude API at runtime.
