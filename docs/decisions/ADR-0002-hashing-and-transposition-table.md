# ADR-0002: Zobrist hashing and transposition-table design

- Status: Accepted
- Date: 2026-10-29

## Context

The search revisits the same position through different move orders. A
transposition table (TT) keyed by a position hash lets it reuse work. JavaScript's
`BigInt` makes a 64-bit key easy to write but slow: every XOR allocates.

## Options

1. 64-bit `BigInt` key: simple, 10-50× slower per hash operation.
2. Two unsigned 32-bit numbers (`hashHi`, `hashLo`): plain integer XOR, no allocation.
3. A 32-bit key only: fast, but collisions become likely at a million positions.

## Decision

Option 2. `Z[slot][count]` for 16 slots × 0..98 shells plus a side-to-move key,
generated once from the seeded PRNG (fixed seed `0x5EED5EE`). The engine updates
the key incrementally by XOR-ing out the old count and in the new count of every
slot a move changed; a property test checks it equals a full recompute.

TT: structure-of-arrays typed buffers, power-of-two buckets of two entries. Slot 0
is depth-preferred, slot 1 always-replace. Entries store both key halves, depth,
score, bound flag (exact/lower/upper) and best move. A generation byte makes
"clear the table" O(1); the table is logically cleared at the start of every move.

## Consequences

- Same position + same limits = same move, regardless of game history. That makes
  arena and SPRT results reproducible and debugging simple.
- Cost: no TT reuse between consecutive moves (a small strength loss at fixed time).
  Revisit with an ablation once the gate exists to measure it.
- Default size 2^16 buckets ≈ 2 MB, safe in a browser Web Worker.
