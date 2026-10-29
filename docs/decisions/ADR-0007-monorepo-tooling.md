# ADR-0007: Monorepo tooling

- Status: Accepted
- Date: 2026-10-29

## Context

One language (TypeScript) across the engine, bots, tools, web app and future
server, with clear package boundaries and fast CI.

## Decisions

- **pnpm workspaces**: strict `node_modules` (a package can only import what it
  declares), fast installs, a single lockfile.
- **Turborepo** runs `build`, `typecheck`, `test` per package in dependency order.
- **Source-first internal packages**: each package's `exports` points at
  `src/index.ts`. Vite, Vitest and tsx consume TypeScript directly, so there is no
  build step between packages and "go to definition" lands in real source.
  The one bundle is `@hasik/bots` → `dist/hasik-bots.mjs` (esbuild), used by the SPRT gate.
- **TypeScript 6.0** (not 7.0): typescript-eslint supports `<6.1`.
- **Worker threads under tsx**: workers register the tsx loader themselves
  (`worker-entry.mjs`), so the arena runs the same under the CLI, Vitest and CI.
- **Boundaries** are enforced by `scripts/check-boundaries.mjs` (declared deps and
  actual imports), with zero extra dependencies.

## Consequences

Packages are not publishable to npm as-is (they ship TypeScript). That is fine for
an application monorepo; add a build step per package if one is ever published.
