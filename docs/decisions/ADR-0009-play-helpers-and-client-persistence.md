# ADR-0009: Player helpers and client-side persistence

- **Status:** Accepted
- **Date:** 2026-11-17
- **Context:** PR #4 (play-experience update)

## Context

Milestone 1 shipped a correct but bare play page: a new player had to read the rules elsewhere, a
reload lost the game, and a strong bot gave no feedback beyond its own evaluation. The roadmap listed a
hint mode for milestone 2. There is still no server (ADR-0006), so anything remembered must live in the
browser.

## Options considered

1. Keep the page minimal until the M2 server exists.
2. Add helpers in the client now: preview, hints, undo, saved games, records, stored in `localStorage`.
3. Same as 2, but compute hints with the bot's own `think` result (best move only).

## Decision

Option 2.

- **Move preview** comes from `applyMoveTraced` on the current state (`game/preview.ts`), so it can never
  disagree with the referee.
- **Hint mode** is a new `analyze` worker message (`packages/protocol`). The worker searches every legal
  child with a fixed node budget (`minimax:nodes=30000`) and returns one score per move, keeping the
  score's sign when the mover has an extra turn and negating it otherwise, exactly as the search does.
  Option 3 was rejected because a single best move teaches less than a score on every house.
- **Persistence** uses `localStorage` for settings, the game in progress (seed, opponent, side, moves) and
  a per-opponent record with win streaks. Storage is untrusted: every value is validated, and a saved game
  is restored only if all of its moves replay legally through the engine. Writes never throw (private
  mode and full quotas just mean nothing is remembered).
- **Integrity of the record:** games where the player used a hint or undo are marked assisted and are not
  counted.
- **Cancellation:** asynchronous steps carry the game token and stop when it changes (new game, undo,
  leaving the page); the worker client rejects pending requests with `CancelledError`.

## Consequences

- The web bundle grew from about 10 KB to about 16 KB gzipped.
- Records are per browser and easy to reset; a server-side record arrives with M2 and will replace this
  for signed-in players.
- Hints add up to seven searches per request; at 30k nodes each they finish well under a second on a
  laptop, and they run in the worker, so the page never blocks.
- New tests: 17 unit tests in `apps/web/test/ux.test.ts` and an end-to-end test for preview, hint, undo
  and resume.
