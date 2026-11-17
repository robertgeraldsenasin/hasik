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
  readonly captured: number;
  readonly extraTurn: boolean;
  readonly drops: number;
}

export function describeMove(
  ply: number,
  mover: Player,
  who: string,
  house: number,
  r: MoveResult,
): LogEntry {
  const extraTurn = r.extraTurn && !r.state.over;
  const bits = [`${sideLetter(mover)}${houseNumber(house)}`];
  if (r.captured > 0) bits.push(`captures ${r.captured}`);
  if (extraTurn) bits.push('extra turn');
  if (r.sowSteps > 14) bits.push(`${r.sowSteps} drops`);
  return {
    ply,
    mover,
    who,
    house,
    text: bits.join(' · '),
    captured: r.captured,
    extraTurn,
    drops: r.sowSteps,
  };
}

const WIN = 100_000;

/** Human-friendly score text, e.g. "+12.3 shells" (minimax) or "64% win" (MCTS). */
export function formatScore(score: number | undefined, kind: 'minimax' | 'mcts' | 'other'): string {
  if (score === undefined) return '–';
  if (kind === 'mcts') return `${score}% expected`;
  if (Math.abs(score) >= WIN) {
    const margin = Math.abs(score) - WIN;
    return score > 0 ? `winning by ${margin}` : `losing by ${margin}`;
  }
  const shells = score / 100;
  return `${shells >= 0 ? '+' : ''}${shells.toFixed(1)} shells`;
}

/** Compact label for a hint chip on the board: "+2.4", "win +6", "lose −3". */
export function shortScore(score: number): string {
  if (Math.abs(score) >= WIN) {
    const margin = Math.abs(score) - WIN;
    return score > 0 ? `win +${margin}` : `lose −${margin}`;
  }
  const shells = score / 100;
  if (Math.abs(shells) < 0.05) return '±0';
  return `${shells > 0 ? '+' : '−'}${Math.abs(shells).toFixed(1)}`;
}

export interface PlayerStats {
  readonly moves: number;
  readonly captured: number;
  readonly extraTurns: number;
  /** Most drops in a single move, relays included. */
  readonly longestMove: number;
}

export function statsFor(log: readonly LogEntry[], p: Player): PlayerStats {
  let moves = 0;
  let captured = 0;
  let extraTurns = 0;
  let longestMove = 0;
  for (const e of log) {
    if (e.mover !== p) continue;
    moves++;
    captured += e.captured;
    if (e.extraTurn) extraTurns++;
    longestMove = Math.max(longestMove, e.drops);
  }
  return { moves, captured, extraTurns, longestMove };
}

/** Text for the "Copy result" button. */
export function shareText(
  verdict: 'win' | 'draw' | 'loss',
  you: number,
  them: number,
  botLabel: string,
  url: string,
): string {
  const line =
    verdict === 'win'
      ? `I beat ${botLabel} at Sungka, ${you}–${them}.`
      : verdict === 'draw'
        ? `I drew ${botLabel} at Sungka, ${you}–${them}.`
        : `${botLabel} beat me at Sungka, ${them}–${you}. Rematch soon.`;
  return `${line} Play Hasik: ${url}`;
}
