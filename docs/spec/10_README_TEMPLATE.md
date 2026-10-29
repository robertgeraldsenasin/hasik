# 10. README Template (public repo)

Copy the block below into the repo's README.md and fill the bracketed parts. Tables are generated from `results/` by a script; don't type numbers by hand.

````markdown
# Sungka Arena

Play Sungka, the Filipino mancala, against AI that searches like a chess engine.
**[Play now](LINK)** · [Demo video](LINK) · [Design docs](docs/spec)

![gameplay gif](docs/media/demo.gif)

![CI](BADGE) ![Strength gate](BADGE) ![Coverage](BADGE)

## What's inside
- **Engine:** configurable Sungka rules, perft-verified move generation, Zobrist hashing
- **AI:** alpha-beta with iterative deepening and a transposition table; Monte Carlo Tree Search; a retrograde-analysis endgame tablebase
- **Ratings:** Glicko-2 leaderboard from round-robin tournaments
- **CI strength gate:** every engine change must pass an SPRT match against main before merge, the same method Stockfish's testing framework uses

## Results
Hardware: [CPU, RAM, OS, Node version]. Matches: [N] game pairs per pairing from [M] balanced openings, colors swapped.

| Bot | Score vs Greedy | Elo vs Greedy (95% CI) | Glicko-2 (± 2 RD) |
| --- | --- | --- | --- |
| Random | | | |
| Minimax 200 ms | | | |
| Minimax 1 s + tablebase | | | |
| MCTS 1 s | | | |

| Technique (ablation) | Nodes to depth [D] | Elo gain |
| --- | --- | --- |
| Plain minimax | | — |
| + alpha-beta | | |
| + move ordering | | |
| + transposition table | | |
| + tablebase (N = 8) | | |

Engine speed: [X] perft moves/s, [Y] search nodes/s.

## Architecture
[diagram from docs/spec/03_ARCHITECTURE.md as an image or Mermaid]

## Run it
```bash
pnpm install
pnpm --filter web dev     # play locally
pnpm arena --a minimax --b greedy --pairs 200
```

## How it works
Short sections: rules and indexing; alpha-beta with extra turns; TT and Zobrist; MCTS; tablebase; Glicko-2; SPRT gate.

## Decisions
See docs/decisions/ (ADR-0001 rule variant, ADR-0002 TT design, ...).

## What I'd improve
[honest list]

## Credits and AI use
Built by [Zea/Soul: who built what]. Hand-written: rules engine, search, MCTS, tablebase, Glicko-2, SPRT math. Claude Code assisted with: scaffolding, UI, CI/CD, tests, docs; all AI-written code was reviewed and tested before merge.
Rules follow the variant in docs/spec/02_GAME_RULES.md; regional variants differ.
````
