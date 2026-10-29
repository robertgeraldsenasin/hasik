# ADR-0005: SPRT strength gate

- Status: Accepted
- Date: 2026-10-29

## Context

Engine changes can silently make the AI weaker. The gate must decide "not weaker"
(or "stronger") with controlled error rates, within ~20 minutes on a GitHub runner,
and give the same answer on any machine.

## Decisions

1. **Fixed node budget, not time.** Both engines search `minimax:nodes=10000` per
   move. Time limits depend on runner load; node limits are deterministic.
2. **Game pairs.** Each opening is played twice with colours swapped. Sungka's
   first-player advantage is large (random openings swing ±40-60 shells at depth 4),
   so single games mostly measure who moved first.
3. **Pentanomial model** (one sample per pair) instead of the spec's trinomial
   model. Pairs have much lower variance, so the test stops sooner at the same error
   rates. Empty buckets are regularized with a 0.001 pseudo-count (as Fishtest does),
   so two identical engines (only 1-1 pairs, variance 0) resolve immediately.
4. **Bounds.** Non-regression [−10, 0] Elo by default; `engine:gainer` label → [0, 5].
   α = β = 0.05 (LLR bounds ±2.94).
5. **Minimum sample: 30 pairs before any decision.** Found while testing the gate:
   with a deliberately weakened engine, the first pair (0-2) produced LLR −3.8 and an
   immediate H0, because the sample variance of one or two pairs is nearly zero and
   the normal approximation behind the LLR breaks down. Thirty pairs give a usable
   variance estimate; the floor is configurable (`--min-pairs`).
6. **Budget.** At most 1,000 pairs or 20 minutes. Inconclusive fails unless a
   maintainer adds `strength:override`, so CI cannot silently pass a weaker engine.
7. **Base vs head** are each bundled into one ES module with esbuild so the two
   versions never share module state; results are processed in pair order so the
   stopping point is reproducible.

## Consequences

- A refactor that does not change play resolves right after the 30-pair minimum (identical games).
- A real change needs hundreds of pairs; at ~0.5 s per game on 4 cores this fits the budget.
- The trinomial formula is kept and tested for comparison and for the README write-up.
