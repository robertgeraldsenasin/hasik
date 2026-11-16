# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Play experience and robustness in the web app.

### Added

- Move preview: hovering over or focusing a house marks where its last shell lands and
  says what the move does (extra turn, relays, captures, store gain).
- Hint mode (roadmap, milestone 2): the worker searches every legal move with a fixed
  node budget and the board shows each score, the best in gold. Extra turns keep the
  score's sign, as in the search.
- Undo, a saved game that survives a reload or a closed tab, saved settings, and a win,
  draw and loss record per opponent with win streaks. Games that use hints or undo are
  not counted. Beaten levels get a check mark.
- End-of-game screen with the score, captures, extra turns and longest move for both
  sides, "Play again", "Try the next level" and "Copy result".
- On-board callouts for captures and extra turns, a turn indicator, shell counts on the
  house buttons, synthesized sound effects (off with M or the checkbox), and a
  how-to-play dialog that opens on the first visit.
- Keyboard: H hint, U undo, M sound, ? help, alongside 1-7 and N.

### Fixed

- Starting a new game while the bot's move was animating could let the old game's bot
  move again in the new game. Every async step now checks the game token first.
- Keyboard shortcuts fired with Ctrl, Cmd or Alt held (Ctrl+N started a new game).
- Saved data is validated before use; corrupt storage falls back to defaults.
- Accessibility: the play page has an h1, and the engine-insight list is a valid
  description list (axe reports no violations on any view, light or dark).
- An uncaught error now shows a dismissible notice instead of failing silently.

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
