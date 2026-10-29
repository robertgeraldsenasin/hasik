# ADR-0001: Reference rule variant

- Status: Accepted (revisit after the "rules in my own words" review)
- Date: 2026-10-29

## Context

Sungka varies by region: sowing direction, whether captures need a non-empty
opposite house, what happens to leftover shells, simultaneous openings, and
multi-round "burnt house" play. The engine needs one concrete default to target,
and must not hard-code a variant others will want.

## Options

1. Hard-code one regional ruleset: simplest, but every variant becomes a rewrite.
2. A `RuleConfig` object with one flag per varying rule, defaults from
   `docs/spec/02_GAME_RULES.md`: small cost (a few branches in the sowing loop).

## Decision

Option 2. Defaults: 7 houses × 7 shells; counter-clockwise sowing from A's view,
skipping the opponent's store; extra turn on own store; relay sowing; capture on an
empty own house takes the landing shell plus the opposite house, even if that house
is empty; single round; alternating turns with A first; `maxSowSteps = 10,000`.

## Consequences

- Perft golden values are a fingerprint of these defaults; changing a default
  changes them, which the perft test catches, and needs a new ADR.
- **Spec finding:** with the end rule "the game ends when the player to move has no
  shells", only the _other_ player can still have shells, so `remainingShellsGoTo:
'owner'` and `'capturer'` give the same result at game end. The flag is kept for
  shape compatibility. A variant where the stuck player passes and the opponent keeps
  sowing would make the difference real; that is a candidate flag for later.
- Multi-round play and the simultaneous opening stay out of scope (non-goals for M1/M2).
- `throwOnSowLimit` was added to the config so tests can make the safety cap throw
  while production ends the turn and keeps every shell on the board.
