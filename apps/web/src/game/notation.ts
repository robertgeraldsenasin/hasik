/**
 * Move notation for the move log: houses are numbered 1-7 from each player's own
 * left (the order they sow in), which is how a player would name them.
 */
import type { MoveResult, Player } from '@hasik/engine';

export const houseNumber = (house: number): number => (house < 7 ? house + 1 : house - 7);

export function sideLetter(p: Player): 'A' | 'B' {
  return p === 0 ? 'A' : 'B';
}

export interface LogEntry {
  readonly ply: number;
  readonly mover: Player;
  readonly who: string;
  readonly house: number;
  readonly text: string;
}

export function describeMove(
  ply: number,
  mover: Player,
  who: string,
  house: number,
  r: MoveResult,
): LogEntry {
  const bits = [`${sideLetter(mover)}${houseNumber(house)}`];
  if (r.captured > 0) bits.push(`captures ${r.captured}`);
  if (r.extraTurn && !r.state.over) bits.push('extra turn');
  if (r.sowSteps > 14) bits.push(`${r.sowSteps} drops`);
  return { ply, mover, who, house, text: bits.join(' · ') };
}

/** Human-friendly score text, e.g. "+12.3 shells" (minimax) or "64% win" (MCTS). */
export function formatScore(score: number | undefined, kind: 'minimax' | 'mcts' | 'other'): string {
  if (score === undefined) return '–';
  if (kind === 'mcts') return `${score}% expected`;
  if (Math.abs(score) >= 100_000) {
    const margin = Math.abs(score) - 100_000;
    return score > 0 ? `winning by ${margin}` : `losing by ${margin}`;
  }
  const shells = score / 100;
  return `${shells >= 0 ? '+' : ''}${shells.toFixed(1)} shells`;
}
