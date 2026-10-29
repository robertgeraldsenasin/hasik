# Sungka Arena: Project Spec Pack

Version 1, Oct 29, 2026. Owner: Gerald Senasin (duo: Zea and Soul).

This folder is everything needed to plan and build Sungka Arena without re-explaining it. Hand it to a new Claude chat, a Claude Project, or Claude Code, and point to the file you want to work from.

## One-paragraph summary

Sungka Arena is a web platform for Sungka, the Filipino mancala. People play in the browser against AI opponents of increasing strength, watch bots play each other, and follow a live leaderboard. The engine is built like a serious chess engine: alpha-beta search with Zobrist-hashed transposition tables, Monte Carlo Tree Search as a second AI, a retrograde-analysis endgame tablebase, and Glicko-2 ratings. Its CI pipeline has a strength gate: every change to the engine plays the main branch's engine under a Sequential Probability Ratio Test (SPRT), and the pull request fails unless the new version is proven at least as strong. That is the same method Stockfish's testing framework uses to decide what ships.

## Why this project

- It shows algorithms (search, hashing, Monte Carlo methods, retrograde analysis, rating systems, sequential statistics), architecture (monorepo, authoritative server, job queue, workers, database), and CI/CD (quality gates, a statistical strength gate, container builds, automated deploys) in one coherent product.
- It is playable in seconds, which is what reviewers want.
- It is Filipino, which makes it memorable.
- It covers all three career lanes: game AI (game studios), system architecture and CI/CD (software roles), statistical testing and evaluation (AI and data roles).

## Files in this pack

| File | What it covers |
| --- | --- |
| 00_START_HERE.md | This file: summary, how to use the pack, kickoff prompts |
| 01_PRODUCT_SPEC.md | Goals, users, features, scope, non-goals, definition of done |
| 02_GAME_RULES.md | Reference Sungka ruleset, variant flags, edge cases, rules test checklist |
| 03_ARCHITECTURE.md | Monorepo layout, services, data flow, data model, WebSocket protocol, deployment |
| 04_ALGORITHMS.md | Every algorithm with purpose, pseudocode, parameters, complexity, pitfalls |
| 05_METHODOLOGY.md | Testing strategy, SPRT method, benchmarking, evaluation, reproducibility |
| 06_CICD.md | Pipelines, gates, branch protection, secrets, environments |
| 07_CONSTRAINTS.md | Hard rules, performance budgets, determinism, honesty and AI-use rules |
| 08_GAMEPLAN.md | Day 1 hour-by-hour, days 2-4, cut list, risks, definition of done per milestone |
| 09_CLAUDE_CODE_SETUP.md | CLAUDE.md template, subagents, hooks, how to split work with Claude Code |
| 10_README_TEMPLATE.md | The public README skeleton with the results table |
| 11_INTERVIEW_PREP.md | Questions to expect and how to answer them; resume bullets |
| ci-templates/*.yml | Draft GitHub Actions workflows to adapt |

## How to use this pack in a new chat

Upload the zip (or the files) and paste one of these.

**Planning chat:**

> This is my Sungka Arena spec pack. Read every file first. I'm Gerald, a final-year CS student. I want to [plan day 2 / review my architecture / debug X]. Work from 08_GAMEPLAN.md and 07_CONSTRAINTS.md, and tell me if anything in the pack is inconsistent or missing.

**Claude Code kickoff (in the empty repo):**

> Read the spec pack in /docs/spec. Then, in plan mode, propose the monorepo scaffold from 03_ARCHITECTURE.md and the CI skeleton from 06_CICD.md. Do NOT write anything inside packages/engine/src/core or packages/bots/src/search: those are hand-written by me (see 07_CONSTRAINTS.md). You may write tests for them.

**Rules review:**

> Here is my Sungka rules doc in my own words. Compare it with 02_GAME_RULES.md and list every gap or ambiguity before I write the engine.

## Status as of Oct 29, 2026

- Nothing is built yet. The rules doc in Gerald's own words is the first task (08_GAMEPLAN.md, hour 1).
- Open decisions are marked **DECISION** throughout the pack. The main ones: which rule variant to adopt (02), whether the engine moves to Rust/WebAssembly later (03), and the hosting provider (06).
