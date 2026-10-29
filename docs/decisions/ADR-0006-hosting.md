# ADR-0006: Hosting

- Status: Accepted for milestone 1; milestone 2 open
- Date: 2026-10-29

## Context

M1 is a static site: bots run in the browser, the leaderboard is a JSON file. M2
adds a WebSocket server, Postgres and Redis. Free tiers change often.

## Decision

M1: **GitHub Pages**, deployed by `deploy.yml` only after CI passes on `main`.
Free for public repositories, no extra account, no secrets, same place as the code.
M2: decide between Fly.io and Render (server) and Neon/Supabase (Postgres), Upstash
(Redis) when M2 starts, after checking each provider's current free-tier terms.

## Consequences

- The Vite build uses `BASE_PATH=/hasik/` because Pages serves project sites under a sub-path.
- Rollback = re-run the deploy workflow on an earlier commit.
