/**
 * Hint mode, kept free of worker plumbing so it can be unit-tested: score every
 * legal move by searching the position it leads to.
 *
 * Sungka's extra turns matter here too: if the mover keeps the turn after a move,
 * the child's score is already from the mover's view; otherwise it is negated.
 */
import { createBot, terminalScore } from '@hasik/bots';
import { type GameState, applyMove, legalMoves } from '@hasik/engine';
import type { MoveScore } from '@hasik/protocol';

export interface Analysis {
  readonly moves: readonly MoveScore[];
  readonly nodes: number;
}

export function analyzePosition(
  state: GameState,
  spec: string,
  seed: number,
  now?: () => number,
): Analysis {
  const { bot, limits } = createBot(spec);
  const mover = state.toMove;
  let nodes = 0;
  const moves: MoveScore[] = [];
  for (const move of legalMoves(state)) {
    const child = applyMove(state, move).state;
    let score: number;
    if (child.over) {
      const t = terminalScore(child);
      score = child.toMove === mover ? t : -t;
    } else {
      const r = bot.think(child, { ...limits, seed, ...(now ? { now } : {}) });
      nodes += r.nodes ?? 0;
      const s = r.score ?? 0;
      score = child.toMove === mover ? s : -s;
    }
    moves.push({ move, score });
  }
  moves.sort((x, y) => y.score - x.score || x.move - y.move);
  return { moves, nodes };
}
