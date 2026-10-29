# 02. Game Rules (reference ruleset)

Sungka has regional variants. This file is a **reference** so the engine has something concrete to target. Gerald still writes the rules in his own words first (08_GAMEPLAN.md, hour 1) and then reconciles the two. Every rule that varies by region is a flag in `RuleConfig`, so the engine supports variants instead of hard-coding one.

## Board

- Two rows of 7 small houses (*bahay*), one row per player. Player A owns the bottom row, Player B the top row.
- Each player has one large store (*ulo* or *bahay* in some regions) at their end of the board.
- Start: 7 shells in each small house, 0 in each store. Total 98 shells.

## Indexing (fixed in code)

```
Index layout, sowing direction = counter-clockwise from Player A's view:

        B6  B5  B4  B3  B2  B1  B0              top row: indices 14..8 (right to left = 8..14)
  STORE_B                          STORE_A
        A0  A1  A2  A3  A4  A5  A6              bottom row: indices 0..6

Array of 16 slots:
  0..6   = Player A houses (A0..A6)
  7      = Player A store
  8..14  = Player B houses (B0..B6)
  15     = Player B store

Next index when sowing for player P: (i + 1) % 16, skipping the OPPONENT's store.
Opposite house of i (for i in 0..6 or 8..14): 14 - i.
```

**DECISION:** confirm direction and store placement against the variant Gerald grew up with; only the index mapping changes.

## A turn

1. The player picks one of their own non-empty houses.
2. They take all shells from it and sow one shell into each following slot in sowing order, **including their own store, skipping the opponent's store**.
3. Where the last shell lands decides what happens next:

| Last shell lands in | Result | Flag |
| --- | --- | --- |
| Own store | The player moves again (extra turn) | `extraTurnOnStore` (default true) |
| A non-empty house (either side), i.e. it now holds more than 1 | The player picks up all shells there and keeps sowing from the next slot (relay sowing) | `relaySowing` (default true) |
| An empty house on **own** side (now holds exactly 1) | Capture: that shell plus all shells in the opposite house go to the player's store. Turn ends. | `captureRequiresNonEmptyOpposite` (default false); `captureIncludesLandingShell` (default true) |
| An empty house on the **opponent's** side | Turn ends | none |

## Opening

Traditional play often starts with both players sowing at the same time. That is awkward for an engine.

- `simultaneousOpening`: default **false** (alternating turns, Player A first)
- **DECISION:** if true, model the opening as both players choosing a first move secretly, applied in a fixed order. Leave this as a stretch goal.

## End of game

- The game ends when the player to move has no shells in any of their houses.
- `remainingShellsGoTo`: `"owner"` (default: each player adds the shells still in their houses to their store) or `"capturer"` (the player who still has shells takes them).
- Winner: more shells in store. Equal stores (49-49) is a draw.

## Multi-round play (not in MVP)

Traditional Sungka can continue for several rounds, where a player who can't fill a house leaves it "burnt" (*sunog*) and out of play. **Non-goal for M1 and M2.** Only single-round games are in scope.

## Safety rules for the engine (not part of the folk rules)

- Relay sowing can run for a long time. Enforce `maxSowSteps` (default 10,000 single-shell drops per move). Hitting it is a bug; the move generator must throw in tests and resolve as "turn ends" in production, with a logged error.
- Shell conservation: the sum of all 16 slots is always 98. Assert it after every move in debug builds and in property tests.

## RuleConfig (TypeScript shape)

```ts
export interface RuleConfig {
  housesPerSide: 7;           // fixed for now
  shellsPerHouse: 7;          // fixed for now
  extraTurnOnStore: boolean;
  relaySowing: boolean;
  captureRequiresNonEmptyOpposite: boolean;
  captureIncludesLandingShell: boolean;
  remainingShellsGoTo: 'owner' | 'capturer';
  simultaneousOpening: false; // true is a stretch goal
  maxSowSteps: number;
}
export const DEFAULT_RULES: RuleConfig = { /* defaults as listed above */ };
```

## Rules test checklist (each item becomes at least one test)

- [ ] Initial position: 7 shells in each of 14 houses, 0 in stores, total 98
- [ ] Legal moves are exactly the player's non-empty houses
- [ ] Sowing skips the opponent's store and includes the own store
- [ ] Last shell in own store gives an extra turn; with the flag off, it doesn't
- [ ] Relay sowing continues from the slot after the pickup house
- [ ] Capture on own empty house moves landing shell plus opposite shells to the store
- [ ] Capture with an empty opposite house follows `captureRequiresNonEmptyOpposite`
- [ ] Last shell on an empty opponent house ends the turn with no capture
- [ ] A sow of 15+ shells laps the board correctly (skips the opponent's store each lap)
- [ ] Game ends exactly when the player to move has no shells; remaining shells go per the flag
- [ ] Draw at 49-49
- [ ] Total shells stay at 98 after every move (property test over random games)
- [ ] `maxSowSteps` triggers in a constructed pathological position (if one can be built) and never in random play
