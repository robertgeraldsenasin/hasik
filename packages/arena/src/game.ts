/**
 * Playing games and game pairs (algorithm A13).
 *
 * Every match is a list of PAIRS: the same opening is played twice with colours
 * swapped. Sungka has a large first-player advantage, so a single game mostly
 * measures who moved first; a pair cancels that out and measures who played better.
 */
import type { Bot, SearchLimits } from '@hasik/bots';
import {
  DEFAULT_RULES,
  type GameResult,
  type GameState,
  type RuleConfig,
  applyMove,
  decodePosition,
  deriveSeed,
  finalScore,
  gameResult,
  isLegalMove,
} from '@hasik/engine';

export interface Opening {
  readonly id: number;
  /** encodePosition() text. */
  readonly position: string;
  /** Moves from the standard start that reach it (for documentation). */
  readonly moves: readonly number[];
}

export interface Player {
  readonly label: string;
  readonly bot: Bot;
  readonly limits: Partial<SearchLimits>;
}

export interface GameRecord {
  readonly pair: number;
  /** 0 = first game of the pair, 1 = colours swapped. */
  readonly game: 0 | 1;
  readonly opening: number;
  /** Label of the bot playing Player A (moves first in the opening position's side to move). */
  readonly a: string;
  readonly b: string;
  readonly seed: number;
  readonly result: GameResult;
  readonly scoreA: number;
  readonly scoreB: number;
  readonly plies: number;
  /** True if the ply cap ended the game (scored as if it ended there). */
  readonly adjudicated: boolean;
  readonly moves: readonly number[];
}

export interface PairRecord {
  readonly pair: number;
  readonly opening: number;
  /** The two labels; `x` played A in game 0 and B in game 1. */
  readonly x: string;
  readonly y: string;
  readonly games: readonly [GameRecord, GameRecord];
  /** Points for x over both games: 0, 0.5, 1, 1.5 or 2. */
  readonly pointsX: number;
}

export const DEFAULT_MAX_PLIES = 1000;

export function playGame(
  a: Player,
  b: Player,
  start: GameState,
  meta: { pair: number; game: 0 | 1; opening: number; seed: number },
  rules: RuleConfig = DEFAULT_RULES,
  maxPlies = DEFAULT_MAX_PLIES,
): GameRecord {
  let s = start;
  const moves: number[] = [];
  while (!s.over && moves.length < maxPlies) {
    const side = s.toMove === 0 ? a : b;
    const { move } = side.bot.think(s, {
      ...side.limits,
      seed: deriveSeed(meta.seed, moves.length),
    });
    if (!isLegalMove(s, move)) {
      // A bot that returns an illegal move loses on the spot: the referee never trusts bots.
      const loserIsA = s.toMove === 0;
      return {
        ...meta,
        a: a.label,
        b: b.label,
        result: loserIsA ? 'B' : 'A',
        scoreA: loserIsA ? 0 : 98,
        scoreB: loserIsA ? 98 : 0,
        plies: moves.length,
        adjudicated: true,
        moves,
      };
    }
    moves.push(move);
    s = applyMove(s, move, rules).state;
  }
  const { a: scoreA, b: scoreB } = finalScore(s, rules);
  return {
    ...meta,
    a: a.label,
    b: b.label,
    result: gameResult(s, rules),
    scoreA,
    scoreB,
    plies: moves.length,
    adjudicated: !s.over,
    moves,
  };
}

const pointsFor = (g: GameRecord, asA: boolean): number => {
  if (g.result === 'draw') return 0.5;
  return (g.result === 'A') === asA ? 1 : 0;
};

/** Play one opening twice with colours swapped. */
export function playPair(
  x: Player,
  y: Player,
  opening: Opening,
  pair: number,
  seed: number,
  rules: RuleConfig = DEFAULT_RULES,
  maxPlies = DEFAULT_MAX_PLIES,
): PairRecord {
  const start = decodePosition(opening.position);
  const pairSeed = deriveSeed(seed, pair);
  // Both games share a seed so that, for a deterministic engine, only the colours differ.
  const g0 = playGame(
    x,
    y,
    start,
    { pair, game: 0, opening: opening.id, seed: pairSeed },
    rules,
    maxPlies,
  );
  const g1 = playGame(
    y,
    x,
    start,
    { pair, game: 1, opening: opening.id, seed: pairSeed },
    rules,
    maxPlies,
  );
  return {
    pair,
    opening: opening.id,
    x: x.label,
    y: y.label,
    games: [g0, g1],
    pointsX: pointsFor(g0, true) + pointsFor(g1, false),
  };
}
