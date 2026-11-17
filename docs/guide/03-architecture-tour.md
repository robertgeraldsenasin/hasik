# 03. Architecture tour

Where everything lives, how the pieces talk, and which parts to be ready to
whiteboard. For the diagrams (C4 context, containers, packages, game loop, CI/CD), see
[`docs/ARCHITECTURE.md`](../ARCHITECTURE.md). Function names are given instead of line numbers so this stays accurate
as the code changes.

## The map

```
hasik/
├─ packages/
│  ├─ engine/     rules, PRNG, Zobrist, perft          imports: nothing
│  ├─ bots/       random, greedy, minimax, MCTS        imports: engine
│  ├─ rating/     Glicko-2                             imports: nothing
│  ├─ sprt/       SPRT, Elo estimates                  imports: nothing
│  ├─ arena/      games, pairs, worker pool, CLI       imports: engine, bots, rating, sprt
│  └─ protocol/   worker messages, WebSocket schemas   imports: zod
├─ apps/web/      Vite app: board, worker, pages       imports: engine, bots, protocol
├─ tools/         openings generator, bench, ablation
├─ scripts/       boundaries, README tables, GitHub setup, CI helpers
├─ results/       committed match and benchmark outputs (source of every README number)
└─ docs/          spec (original pack), decisions (ADRs), guide (you are here)
```

The arrows only point one way. `scripts/check-boundaries.mjs` fails CI if a package
imports something it shouldn't, or reaches into another package with `../../`.

## Data flow: playing in the browser

1. `apps/web/src/views/play.ts` holds the `GameState`. On the bot's turn it calls
   `BotWorkerClient.think(position, spec, seed)`.
2. `worker/client.ts` posts a `ThinkRequest` (`packages/protocol/src/worker.ts`) to
   the worker; a timeout or crash rejects the promise, replaces the worker and the UI
   shows **Retry**.
3. `worker/bot.worker.ts` decodes the position, builds the bot from its spec
   (`createBot`), injects `performance.now` as the clock and searches.
4. Back on the UI thread the move is checked with `isLegalMove`, applied with
   `applyMoveTraced`, and the event list is animated drop by drop.

Since the play-experience update (ADR-0009):

- **Hints:** `client.analyze()` sends an `AnalyzeRequest`; `worker/analyze.ts` searches every legal child
  with a fixed node budget and keeps or flips the sign depending on who moves next.
- **Preview:** `game/preview.ts` runs `applyMoveTraced` on hover or focus to show where the last shell lands.
- **Persistence and undo:** `game/save.ts` validates everything read from `localStorage` and replays saved
  moves through the engine before restoring a game; `undoTarget()` finds the last position with the human to move.
- **Cancellation:** every async step carries the game token; new game, undo and leaving the page bump it.

## Data flow: the strength gate

1. The PR's `@hasik/bots` is bundled to `.sprt/head.mjs`; the base branch is checked
   out in a git worktree and bundled to `.sprt/base.mjs`.
2. `pnpm sprt` (`packages/arena/src/cli.ts`, `cmdSprt`) creates batches of pair
   tasks; `pool.ts` runs them on worker threads; each worker loads `createBot` from
   the bundle it was told to use (`task.ts`).
3. Results arrive in pair order; after each pair, `sprtStatus` updates the LLR and
   stops at H1, H0 or the budget.
4. The workflow comments the summary on the PR and fails on H0 or an unapproved
   inconclusive result.

## The algorithms, and what to be able to explain

| Algorithm              | File and function                            | Be ready to explain                                                                                                    |
| ---------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Sowing, relay, capture | `engine/src/core/move.ts` `sow()`            | The four outcomes of the last shell, in order; why the opponent's store is skipped via `NEXT`                          |
| Incremental Zobrist    | end of `sow()`; `core/zobrist.ts`            | XOR out the old count, XOR in the new; flip the side key only when the mover changes                                   |
| Perft                  | `core/perft.ts`                              | Depth counts plies, so an extra-turn move still costs one depth                                                        |
| PRNG                   | `engine/src/prng.ts`                         | Why seeded; xoshiro128** in 32-bit math; rejection sampling in `int()`                                                 |
| Negamax + extra turns  | `bots/src/search/minimax.ts` `negamax()`     | `sameSide ? search(child) : -search(child, -beta, -alpha)`                                                             |
| Iterative deepening    | `MinimaxSearch.search()`                     | Depth 1 always completes; soft limit = don't start a depth with less than half the budget left                         |
| Transposition table    | `bots/src/search/tt.ts`                      | Bound flags (exact/lower/upper) and why they're needed; two-tier replacement; generations                              |
| Move ordering          | `orderMoves()`                               | TT move → extra turn → capture → killers → history; ordering is what makes pruning effective (10.8× → 47× fewer nodes) |
| Evaluation             | `search/eval.ts`                             | Terms and weights; the direct-landing approximation; why terminal scores are ±100,000 + margin                         |
| MCTS (UCT)             | `search/mcts.ts` `mctsSearch()`              | Selection, expansion, simulation, backpropagation; crediting `mover` so extra turns work                               |
| Glicko-2               | `rating/src/glicko2.ts` `updateRating()`     | Steps 1-8 of Glickman's paper; what RD and volatility mean; why better than Elo for bots                               |
| SPRT                   | `sprt/src/math.ts`                           | H0/H1, bounds `ln(β/(1−α))`, the LLR formula; trinomial vs pentanomial; why pairs                                      |
| Game pairs, Elo CI     | `arena/src/game.ts` `playPair()`, `stats.ts` | Why colours are swapped; Elo from score; the 95% interval                                                              |

## Determinism, everywhere

- No clock or `Math.random` in engine, bots, rating, sprt (ESLint).
- All randomness from `createRng(seed)`; every game records its seed; per-move seeds
  come from `deriveSeed(gameSeed, ply)`.
- The TT is logically cleared each move, so a position + limits always yields the same move.
- Matches use node or playout budgets, not time.

Consequence: any result in `results/` can be regenerated exactly with the command
that produced it.

## Performance notes

- `applyMove` copies a 16-byte `Uint8Array`; the hash update touches only changed slots.
- The TT is six typed arrays (no objects per entry).
- Move ordering uses an insertion sort (at most 7 moves) instead of `Array.sort`.
- Measured: ~1.5 M perft leaves/s and ~780 k search nodes/s on a 2.1 GHz Xeon core.
  The next big win is avoiding the per-move `MoveResult` object allocation.
