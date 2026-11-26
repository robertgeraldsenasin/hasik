# ADR-0010: A 2.5D animated board, a played tutorial and a portrait layout

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
4. **Real 3D with WebGL** (three.js). Lighting and depth for free, but at least 150 KB of gzipped
   JavaScript, a model pipeline for the board and shells, and a much harder time keeping text crisp and
   hit targets exact.

## Decision

Option 3, drawn in 2.5D: a true perspective camera over a flat canvas.

- **`board/scene.ts`** owns display counts and a scene clock. It plays a traced move as scoop, hand
  glide, drop with bounce, relay and capture flight, and resolves `false` when cancelled so the game-token
  rule from ADR-0009 still holds. The board art is painted once per resize to an offscreen canvas; shells
  are cached sprites. The loop only runs while something moves.
- **`board/pacing.ts`** gives each move a time budget: about 115 ms per shell up to 2.6 s of sowing,
  with the first drops weighted slower. Tapping the board or pressing Space runs the scene clock 8 times
  faster. Pure and unit-tested.
- **`board/camera.ts`** projects board space (the flat layout plus a height above the wood) through a
  camera that tilts about the board's left-right axis: 50° from the table in landscape, a steeper 62° on
  portrait phones so the far end doesn't shrink too much. Because it only tilts about that axis, a line
  across the board stays horizontal on screen, so the scene lays the wood texture onto the tilted board
  in 2-pixel horizontal strips with ordinary `drawImage`. The board gets thickness, a shadow on a woven
  banig with a woven border, on a bamboo floor that falls away into the dark page, shell heaps that grow in the stores, a hand that floats above the board,
  and shells that arc through the air with a shadow under them. A new game opens with the camera swinging
  down from overhead. Pure maths, unit-tested.
- **A flat view.** `V` or the view button moves the camera straight overhead (pitch 90°), for anyone who
  finds counting easier that way or gets motion-sick. The choice is saved with the other settings; old
  saved settings load as the 2.5D view.
- **Overlay buttons.** The seven house buttons sit exactly over the pits. They are the hit targets for
  mouse, touch, keyboard, screen readers and Playwright, so the canvas stays `aria-hidden` and nothing is
  drawn twice. They are placed from the projected outline of each pit, at least 44 px each way. On touch,
  the first tap aims (preview) and the second sows.
- **Portrait layout.** `computeLayout(width, flip, { orientation: 'portrait' })` turns the board a
  quarter turn clockwise when the page is narrower than 560 px and taller than wide. Sowing stays
  counter-clockwise and your store sits nearest your thumbs.
- **Tutorial.** `game/lessons.ts` holds five positions, each with one move and what it must do. A unit
  test holds every lesson to the engine, so the copy can't drift from the rules. `#/learn` opens it
  directly, which makes it linkable.
- **Opponent picker.** A dialog of opponents with emblems and difficulty marks replaces the dropdowns.

## Consequences

- Saved games and records keep their format. Settings gain one field, `view`, which older saved
  settings don't have; they load with the default.
- In headless Chrome the scene holds 60 frames a second during a slow move, on a desktop viewport and on
  a 390 px viewport at 3× pixel density. The texture is re-laid only on resize and while the camera moves.
- The page costs more to download: the CI build is 31.9 KB of gzipped JavaScript (85 KB minified)
  plus 5.1 KB of CSS, up from about 16 KB (ADR-0009). The 2.5D camera accounts for about 3.5 KB of
  that. Still no framework and no images, fonts or audio files.
- `board/renderer.ts` is gone. Its unit tests were on `layout.ts`, which keeps its API (one optional
  argument added).
- The end-to-end tests change where the UI changed: the opponent and side are chosen in the picker, and
  three tests were added (the full tutorial, aim-then-sow on a phone viewport, and the view switch).
- The page is dark only. A light theme would need a second palette for the board art and is not planned.
- Not done: pass-and-play for two people on one device, and a check with real players that the
  tutorial's five lessons are the right five.
