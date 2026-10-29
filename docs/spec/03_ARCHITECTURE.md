# 03. Architecture

## Principles

1. **Pure core.** The rules engine and search have zero runtime dependencies and no I/O. They run the same in the browser, on the server, in workers and in CI.
2. **Determinism.** Same seed + same moves = same game, everywhere. No `Math.random` or `Date.now` inside the engine or bots.
3. **Typed contracts.** Every message between processes is a zod schema in one shared package.
4. **Authoritative server.** Clients send intents; the server validates with the same engine and broadcasts state.
5. **Search off the main thread.** In the browser, bots run in a Web Worker so the UI never freezes.

## Tech stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript (strict) everywhere | One language keeps the day-1 scope realistic |
| Monorepo | pnpm workspaces + Turborepo | Cached builds and test runs |
| Web | Vite + plain Canvas 2D (or React shell + Canvas board) | Keep the board renderer framework-free |
| Server | Fastify + `@fastify/websocket` | Authoritative rooms |
| Queue | Redis + BullMQ | M2 |
| Database | Postgres + Drizzle ORM (or Prisma) | M2; SQLite file allowed for local dev |
| Validation | zod | Shared protocol package |
| Tests | Vitest, fast-check (property tests), Playwright (one smoke test) | |
| Lint/format | ESLint (with a rule banning `Math.random` in core) + Prettier | |
| Containers | Docker, Docker Compose | |
| CI/CD | GitHub Actions; GHCR for images | |
| Hosting | Web: GitHub Pages or Vercel. Server: Fly.io or Render. DB/Redis: a managed free tier (Neon/Supabase for Postgres, Upstash for Redis) | **DECISION**; check current free-tier terms |
| Stretch | Rust + wasm-bindgen engine | Benchmarked against the TS engine |

## Repository layout

```
sungka-arena/
├─ apps/
│  ├─ web/                 # Vite app: board, play vs AI, leaderboard, replays
│  │  └─ src/worker/       # Web Worker that runs bots
│  ├─ server/              # Fastify + WebSocket rooms, REST for leaderboard/replays (M2)
│  └─ worker/              # BullMQ consumers: arena matches, tournaments, rating updates (M2)
├─ packages/
│  ├─ engine/              # HAND-WRITTEN CORE: rules, move gen, Zobrist, perft
│  │  ├─ src/core/         # hand-written; Claude may test/review only
│  │  └─ test/
│  ├─ bots/                # HAND-WRITTEN CORE: random, greedy, minimax, mcts, eval
│  │  ├─ src/search/       # hand-written
│  │  └─ test/
│  ├─ tablebase/           # retrograde analysis generator + probe (M2, hand-written)
│  ├─ rating/              # Glicko-2 (hand-written)
│  ├─ sprt/                # SPRT math + match orchestration (math hand-written)
│  ├─ arena/               # match runner library + CLI (Claude may scaffold)
│  └─ protocol/            # zod schemas for WS messages and API payloads
├─ tools/
│  ├─ bench/               # nodes/sec, depth reached, perft timing
│  └─ openings/            # opening position sampler for fair matches
├─ infra/
│  ├─ docker/              # Dockerfiles for server, worker
│  └─ compose.yml          # postgres, redis, server, worker, web
├─ .github/workflows/      # ci.yml, strength-gate.yml, deploy.yml, nightly.yml
├─ docs/
│  ├─ spec/                # this pack
│  ├─ decisions/           # ADR-0001-*.md ...
│  └─ debug-log.md
└─ CLAUDE.md
```

## Module boundaries

```
protocol  ◄── server, worker, web
engine    ◄── bots, tablebase, arena, server, web
bots      ◄── arena, worker, web (via worker)
rating    ◄── arena, worker
sprt      ◄── arena (CLI), CI
tablebase ◄── bots (probe only)
```

Rule: `engine` imports nothing from the repo. `bots` imports only `engine` (and `tablebase` probe). Enforce with ESLint `import/no-restricted-paths` or dependency-cruiser in CI.

## Engine API (shape, not implementation)

```ts
type Player = 0 | 1;
interface GameState {
  slots: Uint8Array;      // length 16, see 02_GAME_RULES.md indexing
  toMove: Player;
  ply: number;
  hash: bigint;           // Zobrist, updated incrementally
  over: boolean;
}
interface MoveResult { state: GameState; extraTurn: boolean; captured: number; sowSteps: number; }

export function initialState(rules?: RuleConfig): GameState;
export function legalMoves(s: GameState): number[];            // house indices
export function applyMove(s: GameState, house: number, rules?: RuleConfig): MoveResult;
export function isTerminal(s: GameState): boolean;
export function finalScore(s: GameState, rules?: RuleConfig): { a: number; b: number };
export function perft(s: GameState, depth: number): number;   // leaf count, for regression tests
```

Bots share one interface:

```ts
interface Bot {
  id: string;            // e.g. "minimax-v3"
  version: string;       // semver or git sha
  chooseMove(s: GameState, limits: { timeMs?: number; depth?: number; nodes?: number; seed: number }): Promise<{
    move: number; score?: number; depth?: number; nodes?: number; pv?: number[];
  }>;
}
```

Note on extra turns: the side to move does not always alternate. Search must use `state.toMove` after each move, not assume alternation (see 04_ALGORITHMS.md).

## Data flow

**Play vs AI (M1, no server):** web UI → Web Worker (bot) → move → engine applies → renderer animates.

**Online game (M2):**
1. Client opens WS, sends `join` with nickname and room or "vs bot".
2. Server validates every `move` with the engine; rejects illegal moves with an `error` message.
3. For bot opponents, the server enqueues a `bot-move` job or runs the bot in-process under a time budget.
4. Server broadcasts `state` to players and spectators; persists moves.
5. On game end, server enqueues a `rate-game` job; the rating service updates Glicko-2 values; the leaderboard reads from Postgres.

**Tournaments (M2):** a scheduled job creates pairings → workers play matches → results stored → ratings recomputed at the end of a rating period.

## Data model (Postgres, M2)

```
players(id, nickname, device_id, created_at)
bots(id, name, version, git_sha, params_json, created_at)
games(id, player_a_type, player_a_id, player_b_type, player_b_id,
      rules_json, seed, opening_id, result, score_a, score_b,
      started_at, ended_at, source /* 'online' | 'arena' | 'tournament' | 'sprt' */)
moves(game_id, ply, mover, house, extra_turn, captured, sow_steps, eval, think_ms)
ratings(entity_type, entity_id, rating, rd, volatility, period, updated_at)
sprt_runs(id, base_sha, test_sha, elo0, elo1, alpha, beta,
          wins, draws, losses, llr, result /* 'H1' | 'H0' | 'inconclusive' */, created_at)
tournaments(id, format, created_at, status)
```

## WebSocket protocol (packages/protocol)

Client → server:

```
{ type: "join",  room?: string, vsBot?: { botId: string, level: 1..5 }, nickname: string }
{ type: "move",  gameId: string, house: number, clientPly: number }
{ type: "resign", gameId: string }
{ type: "spectate", gameId: string }
```

Server → client:

```
{ type: "state", gameId, slots: number[16], toMove, ply, lastMove?, over, result? }
{ type: "error", code: "ILLEGAL_MOVE" | "NOT_YOUR_TURN" | "STALE_PLY" | "ROOM_FULL", message }
{ type: "bot-thinking", gameId, botId }
{ type: "game-over", gameId, scoreA, scoreB, result }
```

`clientPly` prevents double-submits and stale moves.

## Deployment

| Piece | Where | How |
| --- | --- | --- |
| Web (M1) | GitHub Pages or Vercel | Static build; bots run in the browser |
| Server + worker (M2) | Fly.io or Render | Docker images from GHCR |
| Postgres | Managed free tier (Neon or Supabase) | `DATABASE_URL` secret |
| Redis | Managed free tier (Upstash) | `REDIS_URL` secret |
| Leaderboard (M1) | Static JSON generated by the arena, committed or published as an artifact | Replaced by the live API in M2 |

**DECISION:** final hosting choice. Check each provider's current free-tier terms before committing; they change.
