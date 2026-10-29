/**
 * Glicko-2 rating system (algorithm A9).
 * Reference: Mark E. Glickman, "Example of the Glicko-2 system" (2013),
 * http://www.glicko.net/glicko/glicko2.pdf. Step numbers below follow that paper.
 *
 * Why Glicko-2 instead of plain Elo: each rating carries a rating deviation (RD),
 * an uncertainty band that shrinks as an entity plays and grows while it is idle,
 * plus a volatility that tracks how erratic its results are. A bot that has
 * played 20 games and one that has played 2,000 should not look equally certain.
 */

export interface Rating {
  /** Glicko scale rating (1500 = new player). */
  readonly rating: number;
  /** Rating deviation: roughly one standard deviation of the rating estimate. */
  readonly rd: number;
  /** Volatility: expected fluctuation of the rating. */
  readonly vol: number;
}

export interface Outcome {
  readonly opponent: Rating;
  /** 1 win, 0.5 draw, 0 loss. */
  readonly score: number;
}

export interface Glicko2Options {
  /** System constant tau: constrains volatility change. 0.3-1.2; 0.5 is the paper's example. */
  readonly tau: number;
  /** Convergence tolerance for the volatility iteration. */
  readonly epsilon: number;
  /** RD never grows past this (an unknown player). */
  readonly maxRd: number;
}

export const DEFAULT_RATING: Rating = Object.freeze({ rating: 1500, rd: 350, vol: 0.06 });
export const DEFAULT_GLICKO2: Glicko2Options = Object.freeze({
  tau: 0.5,
  epsilon: 0.000001,
  maxRd: 350,
});

/** Conversion factor between the Glicko and Glicko-2 scales: 400 / ln(10). */
const SCALE = 173.7178;

const g = (phi: number): number => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu: number, muJ: number, phiJ: number): number =>
  1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/** Update one player's rating from all games in one rating period. */
export function updateRating(
  player: Rating,
  games: readonly Outcome[],
  options: Partial<Glicko2Options> = {},
): Rating {
  const o = { ...DEFAULT_GLICKO2, ...options };
  // Step 2: convert to the Glicko-2 scale.
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const sigma = player.vol;

  // A player who did not play only becomes less certain (Step 6 applied alone).
  if (games.length === 0) {
    const rd = Math.min(Math.sqrt(phi * phi + sigma * sigma) * SCALE, o.maxRd);
    return { rating: player.rating, rd, vol: sigma };
  }

  // Steps 3 and 4: estimated variance v and estimated improvement delta.
  let vInv = 0;
  let deltaSum = 0;
  for (const { opponent, score } of games) {
    const muJ = (opponent.rating - 1500) / SCALE;
    const phiJ = opponent.rd / SCALE;
    const gJ = g(phiJ);
    const e = expected(mu, muJ, phiJ);
    vInv += gJ * gJ * e * (1 - e);
    deltaSum += gJ * (score - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Step 5: new volatility via the Illinois variant of regula falsi.
  const a = Math.log(sigma * sigma);
  const tau2 = o.tau * o.tau;
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const d = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d * d) - (x - a) / tau2;
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * o.tau) < 0) k++;
    B = a - k * o.tau;
  }
  let fA = f(A);
  let fB = f(B);
  for (let iter = 0; Math.abs(B - A) > o.epsilon && iter < 100; iter++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  const newSigma = Math.exp(A / 2);

  // Steps 6 and 7: new RD and rating.
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * deltaSum;

  // Step 8: back to the Glicko scale.
  return {
    rating: SCALE * newMu + 1500,
    rd: Math.min(SCALE * newPhi, o.maxRd),
    vol: newSigma,
  };
}

export interface PeriodGame {
  readonly a: string;
  readonly b: string;
  /** Score for `a`: 1, 0.5 or 0. */
  readonly scoreA: number;
}

/**
 * Rate a whole period at once. Every player is updated against their opponents'
 * PRE-period ratings, as Glicko-2 requires (order of games inside a period does
 * not matter). Players in `ratings` who did not play get only the RD increase.
 */
export function ratePeriod(
  ratings: ReadonlyMap<string, Rating>,
  games: readonly PeriodGame[],
  options: Partial<Glicko2Options> = {},
): Map<string, Rating> {
  const get = (id: string) => ratings.get(id) ?? DEFAULT_RATING;
  const outcomes = new Map<string, Outcome[]>();
  for (const id of ratings.keys()) outcomes.set(id, []);
  for (const { a, b, scoreA } of games) {
    if (!outcomes.has(a)) outcomes.set(a, []);
    if (!outcomes.has(b)) outcomes.set(b, []);
    outcomes.get(a)!.push({ opponent: get(b), score: scoreA });
    outcomes.get(b)!.push({ opponent: get(a), score: 1 - scoreA });
  }
  const out = new Map<string, Rating>();
  for (const [id, list] of outcomes) out.set(id, updateRating(get(id), list, options));
  return out;
}
