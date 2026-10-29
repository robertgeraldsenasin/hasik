# Hasik

Sungka (Filipino mancala) engine, bots and web app. Monorepo: pnpm workspaces +
Turborepo, TypeScript strict. Spec: docs/spec/. Decisions: docs/decisions/. Guide: docs/guide/.

## Commands

- Install: pnpm install
- Dev (web): pnpm dev
- Everything CI checks: pnpm verify
- Tests: pnpm test (one package: pnpm --filter @hasik/engine test)
- Perft: pnpm perft 6
- Arena: pnpm arena --a minimax:nodes=20000 --b greedy --pairs 100
- Round robin: pnpm roundrobin --pairs 40
- SPRT: pnpm sprt --base base.mjs --head head.mjs --mode nonreg
- README tables: pnpm readme:tables

## Rules

- No Math.random / Date.now / performance.now in engine, bots, rating, sprt. Use createRng(seed) and limits.now.
- Never assume turns alternate (extra turns exist). Use state.toMove.
- Engine functions are pure; never mutate a GameState.
- Every new module gets tests, failure paths too. Engine changes must keep perft golden values (or come with an ADR).
- Shared message types live in packages/protocol (zod for network input).
- README numbers are generated from results/ by scripts/gen-readme-tables.ts.
- Constraint C1 (hand-written core) is retired: see docs/decisions/ADR-0004.

## Definition of done

pnpm verify passes, docs/ADR updated if a decision changed, no new warnings.
