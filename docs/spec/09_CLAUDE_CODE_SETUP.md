# 09. Claude Code Setup

## CLAUDE.md (put this at the repo root)

```markdown
# Sungka Arena

Monorepo: pnpm workspaces + Turborepo, TypeScript strict. Spec: docs/spec/.

## Commands
- Install: pnpm install
- Dev (web): pnpm --filter web dev
- Test all: pnpm test
- Property tests only: pnpm --filter engine test:prop
- Perft: pnpm --filter engine perft
- Arena: pnpm arena --a minimax --b greedy --pairs 200 --nodes 20000
- SPRT: pnpm sprt --base <sha> --head <sha> --mode nonreg
- Lint/typecheck: pnpm lint && pnpm typecheck

## Hand-written core: DO NOT WRITE OR REWRITE
You may read, test, review, and suggest changes in comments. You may not edit:
- packages/engine/src/core/**
- packages/engine/src/prng.ts
- packages/bots/src/search/**
- packages/tablebase/src/**
- packages/rating/src/glicko2.ts
- packages/sprt/src/math.ts
If a task needs a change there, stop and describe the change instead.

## Rules
- No Math.random / Date.now in engine or bots.
- Never assume turns alternate (extra turns exist). Use state.toMove.
- Every new module gets tests. Failure paths too.
- Shared message types live in packages/protocol (zod).
- Keep README numbers generated from results/ by scripts/gen-readme-tables.ts.

## Definition of done for any task
Tests pass, lint and typecheck clean, docs updated, no new warnings.
```

## Subagents (`.claude/agents/`)

| Agent | Job |
| --- | --- |
| `test-writer` | Writes unit and property tests for a given module from the spec checklist, including failure paths. Never edits implementation. |
| `reviewer` | Reviews diffs for correctness, complexity, determinism violations, and security (input validation, secrets). Outputs a checklist. |
| `docs-writer` | Drafts ADRs, README sections and debug-log entries from the conversation and diff. |
| `ci-engineer` | Edits workflows in `.github/workflows/` and Dockerfiles only. |

## Hooks

- After any edit: run `pnpm lint --filter <changed>` and the changed package's tests.
- Before commit: typecheck + perft golden test.

## How to split work (pattern)

1. You: "Plan mode. Read docs/spec/08_GAMEPLAN.md, Day 1, 0:00-1:00 row, Claude Code column. Propose the scaffold."
2. Approve the plan, let it run.
3. Meanwhile, write the engine core yourself.
4. When it finishes, review the diff fully before merging. Ask it to explain anything you don't understand.
5. Ask `test-writer` for tests against your core; fix your code until they pass. If you think a test is wrong, check it against 02_GAME_RULES.md and decide yourself.

## MCP servers worth connecting

- GitHub (issues, PRs) for task tracking from inside Claude Code.
- Postgres (M2) for inspecting game data during debugging.

## Prompts you'll reuse

- "Write property tests for packages/engine against these invariants: [list from 07 C3]. Do not modify src/core."
- "Review my alpha-beta in packages/bots/src/search/alphabeta.ts for sign errors with extra turns. Explain, don't rewrite."
- "Generate the README results tables from results/*.jsonl using scripts/gen-readme-tables.ts."
