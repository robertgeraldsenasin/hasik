import { type EloEstimate, type Pentanomial, eloFromPentanomial, eloFromWdl } from '@hasik/sprt';
import type { PairRecord } from './game';

export interface MatchStats {
  readonly x: string;
  readonly y: string;
  readonly pairs: number;
  readonly games: number;
  /** From x's point of view. */
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly score: number;
  /** Pair outcome counts, index = x's points in the pair x 2. */
  readonly pentanomial: Pentanomial;
  readonly eloGames: EloEstimate;
  readonly eloPairs: EloEstimate;
  readonly avgPlies: number;
  readonly adjudicated: number;
}

export function summarize(x: string, y: string, pairs: readonly PairRecord[]): MatchStats {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let plies = 0;
  let adjudicated = 0;
  const penta = [0, 0, 0, 0, 0];
  for (const p of pairs) {
    penta[Math.round(p.pointsX * 2)]!++;
    p.games.forEach((g, i) => {
      const xIsA = i === 0;
      if (g.result === 'draw') draws++;
      else if ((g.result === 'A') === xIsA) wins++;
      else losses++;
      plies += g.plies;
      if (g.adjudicated) adjudicated++;
    });
  }
  const games = wins + draws + losses;
  const pentanomial = penta as unknown as Pentanomial;
  return {
    x,
    y,
    pairs: pairs.length,
    games,
    wins,
    draws,
    losses,
    score: games ? (wins + draws / 2) / games : 0.5,
    pentanomial,
    eloGames: eloFromWdl(wins, draws, losses),
    eloPairs: eloFromPentanomial(pentanomial),
    avgPlies: games ? plies / games : 0,
    adjudicated,
  };
}

export const fmtElo = (e: EloEstimate): string => {
  const f = (v: number) =>
    Number.isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(0) : v > 0 ? '+inf' : '-inf';
  return `${f(e.elo)} [${f(e.lo)}, ${f(e.hi)}]`;
};
