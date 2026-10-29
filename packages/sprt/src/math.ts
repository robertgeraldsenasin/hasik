/**
 * Sequential Probability Ratio Test (SPRT) and Elo statistics (algorithm A10).
 *
 * The question the strength gate asks: "is the pull request's engine at least
 * as strong as main?" Playing a fixed 1,000 games wastes time when the answer is
 * obvious early and is not enough when it is close. SPRT (Wald, 1945) keeps a
 * running log-likelihood ratio (LLR) between two hypotheses and stops as soon as
 * the evidence crosses a bound, with false-accept rate alpha and false-reject rate
 * beta fixed in advance. Stockfish's testing framework decides what ships this way.
 *
 *   H0: elo <= elo0      H1: elo >= elo1
 *   lower = ln(beta / (1 - alpha)),  upper = ln((1 - beta) / alpha)
 *
 * The LLR uses the normal ("GSPRT") approximation, which only needs the mean and
 * variance of the per-sample score:
 *
 *   LLR = N (s1 - s0) (2 x - s0 - s1) / (2 var)
 *
 * Two sample models:
 *  - trinomial:  one sample per game, outcome in {0, 0.5, 1} (the spec's formula)
 *  - pentanomial: one sample per game PAIR (same opening, colours swapped), pair
 *    score in {0, 0.25, 0.5, 0.75, 1}. Pairs cancel most of the first-player
 *    advantage, so their variance is much lower and the test finishes sooner.
 *    The gate uses this one (ADR-0005).
 */

export type Hypothesis = 'H0' | 'H1';
export type SprtDecision = Hypothesis | 'continue';

/** Expected score for an Elo difference (logistic model). */
export const scoreFromElo = (elo: number): number => 1 / (1 + Math.pow(10, -elo / 400));

/** Elo difference for an expected score in (0, 1). */
export function eloFromScore(score: number): number {
  if (score <= 0) return -Infinity;
  if (score >= 1) return Infinity;
  return -400 * Math.log10(1 / score - 1);
}

export interface SprtBounds {
  readonly lower: number;
  readonly upper: number;
}

export function sprtBounds(alpha: number, beta: number): SprtBounds {
  if (!(alpha > 0 && alpha < 1 && beta > 0 && beta < 1))
    throw new RangeError('alpha and beta must be in (0, 1)');
  return { lower: Math.log(beta / (1 - alpha)), upper: Math.log((1 - beta) / alpha) };
}

export function decide(llr: number, bounds: SprtBounds): SprtDecision {
  if (llr >= bounds.upper) return 'H1';
  if (llr <= bounds.lower) return 'H0';
  return 'continue';
}

/** Mean and variance of samples given as (value, count) buckets. */
function moments(
  values: readonly number[],
  counts: readonly number[],
): { n: number; mean: number; variance: number } {
  let n = 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    n += counts[i] as number;
    sum += (values[i] as number) * (counts[i] as number);
  }
  if (n === 0) return { n: 0, mean: 0.5, variance: 0 };
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < values.length; i++)
    sq += (counts[i] as number) * ((values[i] as number) - mean) ** 2;
  return { n, mean, variance: sq / n };
}

function llrFromMoments(
  n: number,
  mean: number,
  variance: number,
  elo0: number,
  elo1: number,
): number {
  if (n === 0 || variance <= 0) return 0;
  const s0 = scoreFromElo(elo0);
  const s1 = scoreFromElo(elo1);
  return (n * (s1 - s0) * (2 * mean - s0 - s1)) / (2 * variance);
}

/** Trinomial LLR from wins, draws and losses (the spec's formula, one sample per game). */
export function llrTrinomial(
  wins: number,
  draws: number,
  losses: number,
  elo0: number,
  elo1: number,
): number {
  const { n, mean, variance } = moments([1, 0.5, 0], [wins, draws, losses]);
  return llrFromMoments(n, mean, variance, elo0, elo1);
}

/** Pentanomial counts: index = points scored in the pair x 2 (0 = lost both ... 4 = won both). */
export type Pentanomial = readonly [number, number, number, number, number];

/**
 * Empty buckets make the variance estimate degenerate (two identical engines
 * produce only 1-1 pairs and a variance of 0). Fishtest's fix: treat each empty
 * bucket as if it held a tiny count.
 */
export const PENTA_REGULARIZER = 1e-3;

export function regularize(p: Pentanomial): Pentanomial {
  return p.map((c) => (c === 0 ? PENTA_REGULARIZER : c)) as unknown as Pentanomial;
}

const PAIR_SCORES = [0, 0.25, 0.5, 0.75, 1];

export function llrPentanomial(pairs: Pentanomial, elo0: number, elo1: number): number {
  const { n, mean, variance } = moments(PAIR_SCORES, regularize(pairs));
  return llrFromMoments(n, mean, variance, elo0, elo1);
}

export interface EloEstimate {
  readonly elo: number;
  /** 95% confidence interval. */
  readonly lo: number;
  readonly hi: number;
  readonly score: number;
  readonly samples: number;
}

const Z95 = 1.959964;

function eloFromMoments(n: number, mean: number, variance: number): EloEstimate {
  const se = n > 0 ? Math.sqrt(variance / n) : 0;
  return {
    elo: eloFromScore(mean),
    // A bound at or beyond a 0% / 100% score is reported as -Infinity / +Infinity
    // (stored as null in JSON) rather than an arbitrary clamped number.
    lo: eloFromScore(mean - Z95 * se),
    hi: eloFromScore(mean + Z95 * se),
    score: mean,
    samples: n,
  };
}

/** Elo difference and 95% CI from W/D/L (per-game model). */
export function eloFromWdl(wins: number, draws: number, losses: number): EloEstimate {
  const { n, mean, variance } = moments([1, 0.5, 0], [wins, draws, losses]);
  return eloFromMoments(n, mean, variance);
}

/** Elo difference and 95% CI from pentanomial pair counts (per-pair model, tighter). */
export function eloFromPentanomial(pairs: Pentanomial): EloEstimate {
  const { n, mean, variance } = moments(PAIR_SCORES, pairs);
  return eloFromMoments(n, mean, variance);
}

export interface SprtConfig {
  readonly elo0: number;
  readonly elo1: number;
  readonly alpha: number;
  readonly beta: number;
  /**
   * No decision before this many pairs. The normal approximation behind the LLR
   * needs a real variance estimate: after one or two pairs the sample variance is
   * close to zero and the LLR explodes, so a single lost pair could "prove" a
   * regression. Default 30 (ADR-0005).
   */
  readonly minPairs?: number;
}

export const DEFAULT_MIN_PAIRS = 30;

export interface SprtStatus {
  readonly llr: number;
  readonly bounds: SprtBounds;
  readonly decision: SprtDecision;
}

/** One call per update: LLR, bounds and decision for the current pair counts. */
export function sprtStatus(pairs: Pentanomial, cfg: SprtConfig): SprtStatus {
  const bounds = sprtBounds(cfg.alpha, cfg.beta);
  const llr = llrPentanomial(pairs, cfg.elo0, cfg.elo1);
  const n = pairs.reduce((a, b) => a + b, 0);
  const decision = n < (cfg.minPairs ?? DEFAULT_MIN_PAIRS) ? 'continue' : decide(llr, bounds);
  return { llr, bounds, decision };
}
