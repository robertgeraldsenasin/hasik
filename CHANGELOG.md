# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Play experience and robustness in the web app, then a full redesign of the play page
([ADR-0010](docs/decisions/ADR-0010-game-ui-redesign.md), research in
[docs/design/ui-research.md](docs/design/ui-research.md)).

### Changed

- New look: a carved, boat-shaped sungkaan on a bordered banig, on a bamboo floor, in a dark
  room lit by one oil lamp. Saffron is you and inabel indigo is the bot everywhere (seats,
  scores, rings, effects). Under simulated red-green colour blindness, indigo and saffron sit
  about twice as far apart as the earlier pink did.
  Dark theme only.
- The board is 2.5D: seen through a tilted camera, it has thickness and a shadow on a woven
  mat lit by a flickering lamp, store heaps grow as shells are banked, the hand floats over the
  board and shells arc through the air with shadows. Each game opens with the camera swinging
  down onto the table. `V` (or the view button) switches to a flat overhead view; the choice is
  remembered.
- The board is animated: shells are scooped into a hand that glides from pit to pit and drops
  one at a time, pits bounce and knock as shells land, relays are called out (_Tuloy_),
  captured shells fly to the store with a burst sized to the capture (_Kain +9_), and an
  extra turn gets a banner (_Isa pa!_).
- Moves get a time budget instead of a fixed delay per shell: a 48-shell move now takes about
  3.6 s instead of 7.4 s, a 137-shell move about 5.2 s instead of 20.6 s. Tap the board or
  press Space to fast-forward.
- The move preview is drawn on the board: a bead on every pit the move touches, relay marks,
  the landing ring, an outcome chip and the store gain. On touch screens the first tap aims
  and the second sows.
- The house buttons now sit over the pits instead of in a row under the board.
- Opponents are chosen in a picker with emblems and difficulty marks; the seats show each
  player's banked shells, and a bar shows the split of all 98 with the 50-shell line.
- The bot's row shimmers while it searches and the house it picks pulses before it plays.
- On phones held upright the board turns a quarter turn so houses are big enough to tap.
- The rules card has one sentence and one drawing per rule. Speed is a single button with
  four steps; reduced motion turns off shake, particles and ambient glow.
- Sound: knocks for each shell, a climbing clack as a store fills, a rattle on each scoop.

### Added

- An interactive tutorial (`#/learn`, or "Teach me" on a first visit): five one-move lessons
  on real positions, each checked against the engine in a unit test, replayable at any time.
- `pnpm move-lengths`, which measures move and game lengths from seeded self-play and writes
  `results/move-lengths.json`.

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
