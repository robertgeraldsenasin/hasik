# 09. Arena, ratings and SPRT

## Running matches

```bash
pnpm arena --a minimax:nodes=20000 --b greedy --pairs 100 --out results/my-match.jsonl
```

Each pair plays one opening twice with colours swapped. The summary shows W/D/L from
`--a`'s side, the score, Elo per pair with a 95% interval and the pentanomial counts
(how many pairs ended 0, ½, 1, 1½, 2 points for `--a`).

Useful flags: `--workers N` (default: cores − 1), `--seed S`, `--openings file.json`,
`--max-plies N` (adjudicates very long games).

## Round robin and the leaderboard

```bash
pnpm roundrobin --pairs 40
pnpm roundrobin --bots "minimax:nodes=20000;mcts:playouts=3000;greedy" --pairs 20
```

Writes `results/roundrobin.json`, `results/roundrobin-pairs.jsonl` and the web
leaderboard `apps/web/public/data/leaderboard.json`. Glicko-2 treats the whole
tournament as one rating period, starting everyone at 1500 ± 350.

## Elo from a score

Expected score for an Elo difference d: `1 / (1 + 10^(−d/400))`. Inverted: a score of
75% is +191 Elo. The 95% interval comes from the standard error of the mean score
(per game or per pair), converted back to Elo. A 0% or 100% score has no finite Elo;
tables show "won every game" instead of a made-up number.

## Glicko-2 in one paragraph

Every rating carries a deviation (RD): how unsure we are. Playing shrinks RD;
sitting idle grows it. Volatility tracks how erratic results are. The leaderboard
shows rating ± 2 RD, a 95% band. Implementation: `packages/rating/src/glicko2.ts`,
following Glickman (2013) step by step; the test reproduces the paper's example.

## SPRT, worked by hand

Hypotheses: H0 "elo ≤ elo0", H1 "elo ≥ elo1". With α = β = 0.05:

- lower bound = ln(0.05 / 0.95) = −2.944
- upper bound = ln(0.95 / 0.05) = +2.944

Worked example (trinomial, from `packages/sprt/test/math.test.ts`): W = 60, D = 10,
L = 30, bounds [0, 5] Elo.

- N = 100, mean score x = (60 + 5) / 100 = 0.65
- variance = (60·0.35² + 10·0.15² + 30·0.65²) / 100 = 0.2025
- s0 = score(0) = 0.5, s1 = score(5) = 0.507195
- LLR = N (s1 − s0)(2x − s0 − s1) / (2 var) = 100 · 0.007195 · 0.292805 / 0.405 = **0.520**

0.52 is between −2.94 and +2.94, so the test continues.

**Pentanomial:** the same formula with one sample per _pair_ (pair score 0, ¼, ½, ¾, 1).
Pairs remove most of the first-move advantage, so the variance is lower and the test
ends sooner. Two identical engines give only 1-1 pairs; with the 0.001 regularizer the
variance is tiny and the test accepts "not weaker" at once.

## The gate in CI

`strength-gate.yml`: build head and base bundles → `pnpm sprt --mode nonreg|gainer` with
`minimax:nodes=10000`, up to 1,000 pairs or 20 minutes on all cores → comment → enforce.
Run it locally the same way:

```bash
pnpm --filter @hasik/bots build && cp packages/bots/dist/hasik-bots.mjs /tmp/head.mjs
git stash && pnpm --filter @hasik/bots build && cp packages/bots/dist/hasik-bots.mjs /tmp/base.mjs && git stash pop
pnpm sprt --base /tmp/base.mjs --head /tmp/head.mjs --max-pairs 200
```
