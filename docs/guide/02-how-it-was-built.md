# 02. How this repo was built, step by step

This is the order the project was built in, what each step produced, and why it
came at that point. The ordering principle comes from the spec's methodology:
**spec first, then the core, then the shell**. Each layer is tested before anything
is built on top of it, so a bug is found in the layer that caused it.

## Step 0: Read the spec, settle the open decisions

**What:** read all of `docs/spec/` and listed the decisions that had to be made before
writing code: the project name, whether the core is hand-written (constraint C1), and
where the code lives.

**Why first:** two of them change file names and package names everywhere. Renaming
later costs more than deciding now. Results: [ADR-0003](../decisions/ADR-0003-project-name.md)
(name: Hasik) and [ADR-0004](../decisions/ADR-0004-retire-hand-written-core.md) (C1 retired).

## Step 1: Scaffold the monorepo and the guard rails

**What:** `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` (strict), ESLint
flat config, Prettier, EditorConfig, `.gitignore`, `.nvmrc`, one `package.json`,
`tsconfig.json` and `vitest.config.ts` per package.

**Why before any game code:** the guard rails catch mistakes from the first line.
The ESLint rule that bans `Math.random`, `Date.now` and `performance.now` in the
engine, bots, rating and SPRT packages exists before the engine does, so determinism
is enforced rather than hoped for.

**Why these packages** (`engine`, `bots`, `rating`, `sprt`, `arena`, `protocol`,
`web`): each has one job and a one-way dependency arrow, which the boundary script
later enforces. [ADR-0007](../decisions/ADR-0007-monorepo-tooling.md)

## Step 2: The rules engine (`packages/engine`)

**What, in order:**

1. `prng.ts`: seeded xoshiro128** generator. **Why first:** the Zobrist table needs
   random numbers, and they must be identical on every machine.
2. `core/constants.ts`: the 16-slot layout and a precomputed `NEXT[player][slot]`
   table. **Why a table:** the sowing loop is the hottest code in the project; one
   array lookup beats an `if` for "skip the opponent's store" on every shell.
3. `core/rules.ts`: `RuleConfig` with one flag per regional difference.
4. `core/zobrist.ts` and `core/state.ts`: the immutable `GameState`.
   **Why immutable:** search, undo and the UI never fight over shared state;
   `applyMove` returns a new state and a test proves the input is untouched.
5. `core/move.ts`: `applyMove` (fast path) and `applyMoveTraced` (records every
   pickup, drop and capture for the animation). Same code path, so the animation can
   never disagree with the rules.
6. `core/perft.ts`: leaf counts for regression testing.

**Then immediately the tests** (step 3), before any bot. **Why:** every bot, every
match result and every rating depends on the rules being right.

## Step 3: Prove the engine correct

**What:** `test/rules.test.ts` (every checklist item from `02_GAME_RULES.md`, plus one
move traced by hand from the start position), `test/properties.test.ts` (fast-check),
`test/perft.test.ts` (golden values), and `test/reference.ts`.

**Why an independent reference implementation:** a test written by the same mind as
the code shares its blind spots. `reference.ts` implements the rules again in a
deliberately different style (plain arrays, explicit modular walking, no lookup
tables). The differential test plays hundreds of random games under random rule
variants through both and requires identical results after every move. Two
different implementations agreeing is much stronger evidence than either alone.

**Why property tests:** example tests check the cases you thought of. Property tests
check invariants (98 shells always, input never mutated, incremental hash = full
hash, games terminate) over thousands of games you didn't think of.

Result: 47 engine tests; perft from the start position is 7 / 36 / 230 / 1,406 /
8,293 / 48,263 at depths 1-6, locked as golden values.

## Step 4: The bots (`packages/bots`)

**What, in order:**

1. `types.ts`: the `Bot` interface. Limits include an injected `now()` clock, the
   only way a bot can see time (determinism again).
2. `simple.ts`: Random and Greedy. **Why first:** they are the baselines every
   stronger bot is measured against.
3. `search/eval.ts`: the evaluation function (store difference, shells on side,
   mobility, extra-turn moves, best capture).
4. `search/tt.ts`: the transposition table. [ADR-0002](../decisions/ADR-0002-hashing-and-transposition-table.md)
5. `search/minimax.ts`: negamax + alpha-beta + iterative deepening + TT + move
   ordering + extra-turn extension. Every technique has an on/off switch.
   **Why switches:** so step 8 can measure what each one is worth.
6. `search/mcts.ts`: UCT with ε-greedy playouts, a second AI on a different principle.
7. `registry.ts`: build any bot from a text spec like `minimax:nodes=20000`. **Why:**
   the CLI, CI, the web app and the docs all name bots the same way.

**The bug the tests caught on the way:** in the first version, a move that ended the
game _during an extra turn_ was treated as a side change, so its score had the wrong
sign. The fix and its explanation are in `minimax.ts` ("Negate exactly when the side
to move changed"). The test that guards it compares alpha-beta with a classic max/min
minimax that never negates anything, so a sign error cannot hide in both.

## Step 5: Ratings and statistics (`packages/rating`, `packages/sprt`)

**What:** Glicko-2 exactly as in Glickman's paper, and the SPRT/Elo math.

**Why tests against published numbers:** these formulas are easy to get subtly wrong.
The Glicko-2 test reproduces the paper's worked example. (Exact arithmetic gives
1464.05; the paper prints 1464.06 because it rounds intermediate steps. The test
documents that.) The SPRT tests check bounds and LLR against values computed by hand
in the test file.

## Step 6: The arena (`packages/arena`)

**What:** play games and **pairs** (same opening, colours swapped), run them in
parallel on worker threads, summarize W/D/L, pentanomial counts and Elo with 95%
intervals; CLI commands `arena`, `roundrobin`, `sprt`; the opening generator.

**Why pairs:** Sungka's first-move advantage is huge (see ADR-0008). One game mostly
measures who moved first; a pair cancels that.

**Why results come back in order:** worker threads finish in random order. Emitting
results in pair order makes the SPRT stopping point and every results file
reproducible.

**Why a committed opening book:** deterministic engines would otherwise replay one
identical game forever. [ADR-0008](../decisions/ADR-0008-opening-book.md)

## Step 7: The web app (`apps/web`)

**What:** Vite + TypeScript, no framework. `board/layout.ts` (pure geometry, unit
tested), `board/renderer.ts` (Canvas 2D, all art drawn in code; replaced by the animated
`board/scene.ts` in [ADR-0010](../decisions/ADR-0010-game-ui-redesign.md)), `worker/` (the bot
runs in a Web Worker), `views/play.ts` (the game loop), leaderboard and about pages,
and one Playwright smoke test.

**Why a Web Worker:** a 1-second search on the main thread would freeze the page.
**Why no framework:** the board is a canvas; a framework would add weight without
helping. The whole app is about 10 KB gzipped.
**Why the engine referees the bot:** the UI checks every bot move with `isLegalMove`
before applying it. Never trust a component you can verify.
**Accessibility:** a row of real buttons mirrors the board (keyboard `1`-`7`, screen
readers), and the status line is an ARIA live region.

## Step 8: Generate the numbers

**What:** `pnpm openings` (200 openings), `pnpm roundrobin --pairs 40`, `pnpm bench`,
`pnpm ablation`, then `pnpm readme:tables`.

**Why generated, never typed:** constraint C6. CI runs `pnpm readme:tables --check`, so
a hand-edited number fails the build.

## Step 9: CI/CD (`.github/`)

**What:** `ci.yml` (lint, typecheck, test, build, e2e as separate required checks),
`strength-gate.yml` (SPRT on engine PRs), `deploy.yml` (Pages, only after CI passes),
`nightly.yml` (fresh-seed tournament, opens an issue on a rating drop), a shared setup
action, Dependabot, issue and PR templates, CODEOWNERS.

**Why deploy waits for CI:** a broken `main` never reaches the live site.
**Why the gate uses a node budget:** time limits depend on how busy the runner is.
[ADR-0005](../decisions/ADR-0005-sprt-strength-gate.md)

## Step 10: Documentation

**What:** README (from the spec's template), eight ADRs, this guide, CONTRIBUTING,
SECURITY, CODE_OF_CONDUCT, CHANGELOG, VS Code tasks and launch configs, dev container.

**Why ADRs:** six months from now, "why is the TT cleared every move?" has a written
answer with the alternatives that were rejected.

## Step 11: Publish

**What:** first commit authored by the repo owner, pushed to GitHub, then
`scripts/setup-github.sh` for labels, Pages and branch protection (guide 04), and a
Google Drive folder for everything that isn't code (guide 07).
