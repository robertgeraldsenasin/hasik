# ADR-0010: An animated board scene, a played tutorial and a portrait layout

- **Status:** Accepted
- **Date:** 2026-11-26
- **Context:** UI redesign. Research and measurements: [docs/design/ui-research.md](../design/ui-research.md)

## Context

The play page worked, but it didn't feel like a game. The canvas redrew a static frame per shell at a
fixed 130 ms, so the one move in ten that drops 37 to 48 shells took about seven seconds and the longest
moves took over 20. Half of all moves relay, and the only help for counting them was a line of text
under the board. A second row of buttons repeated the houses. Opponent, side and speed were dropdowns.
On a 390 px phone the pits were about 30 px wide, below every touch-target guideline. The rules were a
text dialog.

## Options considered

1. **Polish the existing renderer.** Faster delays, nicer colours, keep the static frame model. Cheap,
   but it can't show a shell travelling, and the length problem needs a different timing model anyway.
2. **Adopt a game framework** (PixiJS, Phaser). Sprites, tweens and particles for free, at 100 KB or more
   of gzipped JavaScript for a page that was 16 KB, plus a second rendering model to learn and test.
3. **A small animated scene of our own** on Canvas 2D, with DOM buttons laid over the pits.

## Decision

Option 3.

- **`board/scene.ts`** owns display counts and a scene clock. It plays a traced move as scoop, hand
  glide, drop with bounce, relay and capture flight, and resolves `false` when cancelled so the game-token
  rule from ADR-0009 still holds. The board art is painted once per resize to an offscreen canvas; shells
  are cached sprites. The loop only runs while something moves.
- **`board/pacing.ts`** gives each move a time budget: about 115 ms per shell up to 2.6 s of sowing,
  with the first drops weighted slower. Tapping the board or pressing Space runs the scene clock 8 times
  faster. Pure and unit-tested.
- **Overlay buttons.** The seven house buttons sit exactly over the pits. They are the hit targets for
  mouse, touch, keyboard, screen readers and Playwright, so the canvas stays `aria-hidden` and nothing is
  drawn twice. On touch, the first tap aims (preview) and the second sows.
- **Portrait layout.** `computeLayout(width, flip, { orientation: 'portrait' })` turns the board a
  quarter turn clockwise when the page is narrower than 560 px and taller than wide. Sowing stays
  counter-clockwise and your store sits nearest your thumbs.
- **Tutorial.** `game/lessons.ts` holds five positions, each with one move and what it must do. A unit
  test holds every lesson to the engine, so the copy can't drift from the rules. `#/learn` opens it
  directly, which makes it linkable.
- **Opponent picker.** A dialog of opponents with emblems and difficulty marks replaces the dropdowns.

## Consequences

- Saved settings, saved games and records keep their format; nothing in `localStorage` changes.
- The page costs more to download: the CI build of this change is 28.4 KB of gzipped JavaScript
  (75 KB minified) plus 5.1 KB of CSS, up from about 16 KB (ADR-0009). Still no framework and no
  images, fonts or audio files.
- `board/renderer.ts` is gone. Its unit tests were on `layout.ts`, which keeps its API (one optional
  argument added).
- The end-to-end tests change where the UI changed: the opponent and side are chosen in the picker, and
  two tests were added (the full tutorial, and aim-then-sow on a phone viewport).
- The page is dark only. A light theme would need a second palette for the board art and is not planned.
- Not done: pass-and-play for two people on one device, and a check with real players that the
  tutorial's five lessons are the right five.
