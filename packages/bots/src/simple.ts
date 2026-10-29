/**
 * Baseline bots. They exist to give the search bots something to be measured
 * against: "beats Random 100%" and "beats Greedy X%" are the first rows of the
 * README results table.
 */
import {
  DEFAULT_RULES,
  type RuleConfig,
  applyMove,
  createRng,
  legalMoves,
  storeOf,
} from '@hasik/engine';
import { type Bot, withAsync } from './types';

function noMoves(): never {
  throw new Error('bot asked to move in a finished game');
}

/** Level 1: uniformly random legal move (seeded). */
export function createRandomBot(): Bot {
  return withAsync({
    id: 'random',
    version: '1.0.0',
    think(s, limits) {
      const moves = legalMoves(s);
      if (moves.length === 0) noMoves();
      return { move: createRng(limits.seed).pick(moves), nodes: 0, depth: 0 };
    },
  });
}

/**
 * Level 2: best immediate store gain. Ties prefer an extra turn, then a seeded
 * random choice so Greedy does not play the same game every time.
 */
export function createGreedyBot(rules: RuleConfig = DEFAULT_RULES): Bot {
  return withAsync({
    id: 'greedy',
    version: '1.0.0',
    think(s, limits) {
      const moves = legalMoves(s);
      if (moves.length === 0) noMoves();
      const rng = createRng(limits.seed);
      const store = storeOf(s.toMove);
      let best: number[] = [];
      let bestGain = -Infinity;
      for (const m of moves) {
        const r = applyMove(s, m, rules);
        const gain =
          (r.state.slots[store] as number) - (s.slots[store] as number) + (r.extraTurn ? 0.5 : 0);
        if (gain > bestGain) {
          bestGain = gain;
          best = [m];
        } else if (gain === bestGain) best.push(m);
      }
      return {
        move: rng.pick(best),
        score: Math.round(bestGain * 100),
        nodes: moves.length,
        depth: 1,
      };
    },
  });
}
