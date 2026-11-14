# Debug log

One entry per non-trivial bug: symptom, cause, fix, and the test that now guards it.

## 2026-10-29: wrong score sign when an extra turn ends the game

- **Symptom:** in a position where moving into your own store left you with no shells,
  minimax valued the (won) ending as lost.
- **Cause:** the search treated "child is terminal" as a side change and negated the score,
  but after an extra turn the side to move is unchanged and `terminalScore` is already from
  the mover's point of view.
- **Fix:** negate exactly when `child.state.toMove !== state.toMove`, terminal or not
  (`packages/bots/src/search/minimax.ts`).
- **Test:** `alpha-beta equals minimax` compares against a classic max/min minimax that never
  negates, on 40 random positions at depths 1-4.

## 2026-10-29: arena workers could not load TypeScript under Vitest

- **Symptom:** `Cannot find module .../src/task` from a worker thread, only in tests.
- **Cause:** worker threads don't inherit the TypeScript loader in every runner; Node's
  built-in type stripping loaded `worker.ts` but couldn't resolve extensionless imports.
- **Fix:** `worker-entry.mjs` registers tsx inside each worker before importing the worker.
- **Test:** `in-thread and worker-thread runs give identical, ordered results`.

## 2026-10-29: Elo intervals clamped to ±3600

- **Symptom:** "+688 (+529 to +3600)" for a bot that scored 98%.
- **Cause:** the interval's upper bound passed 100% and was clamped to 1 − 1e-9 before
  converting to Elo, producing an arbitrary big number.
- **Fix:** report the bound as +∞ (stored as `null` in JSON) and render it as such.
- **Test:** `reports unbounded intervals as infinite, not clamped`.

## 2026-10-29: the strength gate decided after one game pair

- **Symptom:** a deliberately weakened engine was rejected (correctly) after a single pair,
  and identical engines were accepted after five. Right answers, for the wrong reason.
- **Cause:** with one or two pairs the sample variance is close to zero, so the LLR (which
  divides by it) is huge. The SPRT's normal approximation needs a real variance estimate.
- **Fix:** no decision before `minPairs` (default 30); ADR-0005 item 5.
- **Test:** `makes no decision before the minimum sample, however extreme the LLR`.

## 2026-10-30: boundary check would fail on Windows

- **Symptom:** found in review before anyone hit it: `pnpm boundaries` (part of `pnpm verify`)
  would fail on a Windows laptop while passing on Linux CI.
- **Cause:** the script built its root folder from `new URL(import.meta.url).pathname`, which on
  Windows is `/C:/Users/...`; `path.resolve` turns that into an invalid path.
- **Fix:** `fileURLToPath(import.meta.url)` (`scripts/check-boundaries.mjs`); every other script
  already used it.

## 2026-11-14: first CI run on GitHub failed on a test timeout

- **Symptom:** the `test` job failed on the very first push; lint, typecheck, build and e2e passed.
  `pruning, ordering and the TT do not change the root value (extensions on)` timed out at
  30.6 s (limit 30 s).
- **Cause:** plain minimax with up to 4 extra-turn extensions in a row is exponential. Under
  coverage instrumentation it took 29 s locally (passing by a hair) and slightly longer on
  GitHub's runner.
- **Fix:** the comparison uses at most 2 extensions in a row (still exercises the extension
  logic): 29 s down to 1.4 s. The opening-book progress test (12 s on CI) now stops right after
  its first progress report: 0.1 s.
- **Lesson:** a test that passes "just under" a time limit locally will fail on a slower or
  busier CI machine. Keep every test far below the limit.
