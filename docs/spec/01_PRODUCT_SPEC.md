# 01. Product Spec

## Goals

1. A reviewer can open a link and be playing Sungka against an AI within 10 seconds.
2. The AI is strong enough that most humans lose to the top level, and the README proves it with numbers.
3. The repository demonstrates production habits: a monorepo, typed contracts, tests at several levels, CI/CD with quality and strength gates, containerized deploys.
4. Every algorithm can be shown, measured and explained in an interview.

## Users

| User | What they want |
| --- | --- |
| Recruiter (30 seconds) | A live link, a GIF, a one-line pitch, a results table |
| Engineer reviewer (5 minutes) | Clean architecture, one-command setup, green CI, tests that mean something |
| Casual player | Play a quick game against a bot, pick a difficulty, see who's winning |
| Gerald in interviews | A project he can defend for 30 minutes |

## Features by milestone

### M1: Day 1 MVP (must ship)

- Rules engine with configurable variants (02_GAME_RULES.md)
- Play vs AI in the browser: board, click to move, sowing animation, move log
- Bots: Random, Greedy, Minimax (alpha-beta + iterative deepening + Zobrist transposition table), MCTS (UCT)
- Difficulty levels mapped to search time and depth
- Bot arena runner (CLI): N games between any two bots, colors swapped, results as JSON
- Glicko-2 ratings over arena results, shown as a static leaderboard page
- SPRT tool (CLI) and the CI strength gate
- CI: lint, typecheck, unit tests, property-based tests, perft-style regression, strength gate
- CD: web app deployed (GitHub Pages or Vercel)
- README with the results table

### M2: Days 2-4

- Authoritative game server (Fastify + WebSocket rooms): human vs human online, spectate bot games live
- Job queue (Redis + BullMQ) and bot workers for scheduled tournaments
- Postgres: games, moves (replays), bots, ratings, SPRT runs
- Live leaderboard fed by the rating service
- Retrograde endgame tablebase for small shell counts; the Minimax bot probes it
- Replay viewer
- Docker images pushed to GHCR; server deployed to Fly.io or Render
- Nightly round-robin tournament workflow

### M3: Stretch

- Rust engine compiled to WebAssembly, benchmarked against the TypeScript engine
- Evaluation weight tuning with SPSA
- Opening book from self-play statistics
- Swiss-system tournaments
- Hint mode that shows the engine's evaluation of each legal move

## Non-goals

- Accounts with passwords (use anonymous nicknames plus a device ID)
- Mobile apps (responsive web only)
- Monetization, ads, chat between players
- Copying any existing Sungka app's art, name or code

## Definition of done (project level)

- [ ] Live link loads in under 5 seconds on a laptop; a game against the default bot can start in under 10 seconds
- [ ] Results table in README with real, reproducible numbers on stated hardware
- [ ] CI green on main; branch protection requires CI and the strength gate
- [ ] One-command local setup (`docker compose up` or `pnpm dev`) tested from a fresh clone
- [ ] Decision records for every non-obvious choice
- [ ] AI-use note and credits (who built what)
- [ ] 60-90 second demo video
