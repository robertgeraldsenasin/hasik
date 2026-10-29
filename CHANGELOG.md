# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-29

Milestone 1: playable MVP.

### Added

- Rules engine with configurable variants, seeded PRNG, incremental Zobrist hashing, perft.
- Bots: Random, Greedy, Minimax (alpha-beta, iterative deepening, transposition table,
  move ordering, extra-turn extension), Monte Carlo Tree Search.
- Glicko-2 ratings; SPRT and Elo statistics.
- Arena CLI (matches, round robin, SPRT) on worker threads; 200-position opening book.
- Web app: Canvas board, sowing animation, Web Worker bots, five levels plus MCTS,
  engine insight panel, leaderboard page.
- CI (lint, typecheck, test with coverage gates, build, e2e), SPRT strength gate,
  GitHub Pages deploy, nightly tournament, Dependabot.
- README with generated results tables, eight ADRs, a step-by-step build guide.
