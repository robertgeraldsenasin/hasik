# 11. Interview Prep

## The 30-second pitch

"Sungka Arena is a web platform for Sungka, the Filipino mancala, with AIs that search like chess engines: alpha-beta with a transposition table, MCTS, and an endgame tablebase built by retrograde analysis. Bots are rated with Glicko-2, and my CI has a strength gate: every engine change plays the main branch under a sequential probability ratio test and can't merge unless it's proven not to be weaker. The best bot beats a greedy player [X]% of the time."

## The 30-minute walkthrough

1. Problem and rules (2 min), including why extra turns make search tricky
2. Architecture (5 min): pure engine package, Web Worker, authoritative server, queue, database
3. Search (8 min): alpha-beta, iterative deepening, TT, ordering, extensions; ablation numbers
4. Tablebase (5 min): why stores don't matter, indexing, cycles
5. Testing and CI (7 min): property tests, perft, the SPRT gate, what it caught
6. What went wrong and what I'd change (3 min)

## Questions to expect

**Algorithms**
- Why does alpha-beta give the same answer as minimax? What does good move ordering change?
- How do extra turns affect negamax? (Same player moves again: no sign flip, same window.)
- What's in a TT entry, and why do you need the bound flag?
- Why Zobrist hashing, and what's the collision risk with 64 bits?
- Why is the tablebase possible at all? (Stores don't affect future moves, so board-only states suffice.) How did you handle cycles?
- MCTS vs alpha-beta here: which won, and why do you think so?
- Why Glicko-2 over Elo?
- Explain SPRT in plain words. Why not just play 1,000 games and compare? (SPRT stops early with controlled error rates.)
- Why play games in pairs with swapped colors?

**Engineering**
- How do you keep the engine identical in browser, server and CI? (Pure package, no I/O, seeded PRNG.)
- What stops the UI from freezing during search?
- What happens if a client sends an illegal or stale move?
- Why fixed node budgets in CI instead of time limits?
- How do you know your README numbers are real? (Generated from committed results by a script.)
- Which parts did AI write, and how did you verify them?

**Behavioral**
- A bug that took longest to find (keep a real one in docs/debug-log.md).
- A decision you'd reverse.
- How you split work with your partner.

## Resume bullets (fill in real numbers)

- Built Sungka Arena, a competitive AI platform for Filipino mancala with alpha-beta search, Zobrist-hashed transposition tables and MCTS; the strongest bot beats a greedy baseline in X% of 1,000 games.
- Generated a retrograde-analysis endgame tablebase solving Y positions, giving perfect play once 8 or fewer shells remain.
- Added a CI strength gate that runs SPRT matches on every engine change and blocks merges not proven at least as strong; ranked bots with Glicko-2.
- Designed a TypeScript monorepo (engine, bots, server, workers) with property-based tests, perft regression tests and containerized deploys via GitHub Actions.
