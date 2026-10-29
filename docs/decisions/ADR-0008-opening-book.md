# ADR-0008: Opening book

- Status: Accepted
- Date: 2026-10-29

## Context

Deterministic engines replay identical games from the standard start. Matches need
varied, roughly balanced, reproducible starting positions.

## Data

From 300 random 2-4 ply openings, a depth-4 search scored 0.3% within ±1 shell,
3% within ±3 shells and 6% within ±5 shells; half of all positions were scored more
than 33 shells from even. Sungka's extra-turn chains make most openings lopsided.

## Decision

Generate 200 openings by playing 2-6 random moves (seed 2026) and keeping positions
a depth-4 search scores within ±5 shells (500 in engine units). About 6% of candidates
pass; generation takes ~4 minutes. The file is committed (`tools/openings/openings.json`).

## Consequences

Paired games absorb the remaining imbalance. Regenerate only when rules or the
evaluation change meaningfully (`pnpm openings`), and note it in the changelog,
because it changes every downstream result.
