# Architecture Decision Records

Short records of every non-obvious choice: the context, the options considered,
the decision and its consequences. When a decision changes, add a new ADR that
supersedes the old one rather than editing history.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](ADR-0001-rule-variant.md) | Reference Sungka rule variant and its flags | Accepted |
| [0002](ADR-0002-hashing-and-transposition-table.md) | Zobrist keys as two 32-bit halves; two-tier TT cleared per move | Accepted |
| [0003](ADR-0003-project-name.md) | Name the project Hasik | Accepted |
| [0004](ADR-0004-retire-hand-written-core.md) | Retire constraint C1 (hand-written core) | Accepted |
| [0005](ADR-0005-sprt-strength-gate.md) | SPRT strength gate: pentanomial model, fixed node budget | Accepted |
| [0006](ADR-0006-hosting.md) | GitHub Pages for milestone 1; server hosting deferred | Accepted |
| [0007](ADR-0007-monorepo-tooling.md) | pnpm + Turborepo with source-first internal packages | Accepted |
| [0008](ADR-0008-opening-book.md) | 200 seeded openings within ±5 shells at depth 4 | Accepted |
| [0009](ADR-0009-play-helpers-and-client-persistence.md) | Player helpers (preview, hints, undo) and validated client-side persistence | Accepted |
| [0010](ADR-0010-game-ui-redesign.md) | Animated board scene, played tutorial, portrait layout for phones | Accepted |

Template: [ADR-template.md](ADR-template.md).
