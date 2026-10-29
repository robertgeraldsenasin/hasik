/**
 * Monte Carlo Tree Search with UCT (algorithm A8): a second AI built on a
 * completely different principle from minimax. Instead of an evaluation
 * function, it estimates move values from many fast simulated games.
 *
 * Extra turns: every node records which player made the move INTO it, and
 * backpropagation credits the result to that player. Selection at a node then
 * picks the child that is best for the player to move there, which is the
 * child's mover. This stays correct when the same player moves twice in a row.
 */
import {
  DEFAULT_RULES,
  type GameState,
  type Player,
  type RuleConfig,
  type Rng,
  applyMove,
  createRng,
  finalScore,
  legalMoves,
  storeOf,
} from '@hasik/engine';
import { type Bot, type BotMove, type SearchLimits, withAsync } from '../types';

export interface MctsOptions {
  readonly rules: RuleConfig;
  /** Exploration constant C in UCT. sqrt(2) is the textbook value for rewards in [0, 1]. */
  readonly exploration: number;
  /** 'random' playouts, or 'egreedy': greedy move with probability 1 - epsilon. */
  readonly playoutPolicy: 'random' | 'egreedy';
  readonly epsilon: number;
  /** Playouts per move when no other limit is given. */
  readonly defaultPlayouts: number;
  /** Plies after which a playout is scored as if the game ended there. */
  readonly maxPlayoutPlies: number;
}

export const DEFAULT_MCTS: MctsOptions = Object.freeze({
  rules: DEFAULT_RULES,
  exploration: Math.SQRT2,
  playoutPolicy: 'egreedy',
  epsilon: 0.1,
  defaultPlayouts: 2000,
  maxPlayoutPlies: 400,
});

class Node {
  readonly children: Node[] = [];
  readonly untried: number[];
  visits = 0;
  /** Total reward for `mover` (the player who made the move into this node). */
  reward = 0;
  constructor(
    readonly state: GameState,
    readonly parent: Node | null,
    readonly move: number,
    readonly mover: Player,
  ) {
    this.untried = legalMoves(state);
  }
}

/** Reward in [0, 1] for player p: win 1, draw 0.5, loss 0. */
function rewardFor(p: Player, a: number, b: number): number {
  const mine = p === 0 ? a : b;
  const theirs = p === 0 ? b : a;
  return mine > theirs ? 1 : mine < theirs ? 0 : 0.5;
}

export function mctsSearch(
  s: GameState,
  limits: Partial<SearchLimits>,
  opts: MctsOptions = DEFAULT_MCTS,
): BotMove {
  const moves = legalMoves(s);
  if (moves.length === 0) throw new Error('mcts asked to move in a finished game');
  if (moves.length === 1)
    return { move: moves[0] as number, nodes: 0, depth: 0, pv: [moves[0] as number] };

  const rng = createRng(limits.seed ?? 1);
  const now = limits.now;
  const deadline = limits.timeMs !== undefined && now ? now() + limits.timeMs : Infinity;
  const budget =
    limits.nodes ?? (deadline === Infinity ? opts.defaultPlayouts : Number.MAX_SAFE_INTEGER);

  const root = new Node(s, null, -1, s.toMove === 0 ? 1 : 0);
  let maxDepth = 0;
  let iterations = 0;

  while (iterations < budget) {
    if (now && (iterations & 63) === 0 && iterations > 0 && now() >= deadline) break;
    iterations++;

    // 1. Selection: descend through fully expanded nodes by UCT.
    let node = root;
    let depth = 0;
    while (node.untried.length === 0 && node.children.length > 0) {
      const logN = Math.log(node.visits);
      let bestChild = node.children[0] as Node;
      let bestUct = -Infinity;
      for (const c of node.children) {
        const uct = c.reward / c.visits + opts.exploration * Math.sqrt(logN / c.visits);
        if (uct > bestUct) {
          bestUct = uct;
          bestChild = c;
        }
      }
      node = bestChild;
      depth++;
    }

    // 2. Expansion: add one untried move (chosen at random so ties don't bias low indices).
    if (node.untried.length > 0) {
      const i = rng.int(node.untried.length);
      const m = node.untried[i] as number;
      node.untried[i] = node.untried[node.untried.length - 1] as number;
      node.untried.pop();
      const child = new Node(
        applyMove(node.state, m, opts.rules).state,
        node,
        m,
        node.state.toMove,
      );
      node.children.push(child);
      node = child;
      depth++;
    }
    if (depth > maxDepth) maxDepth = depth;

    // 3. Simulation.
    const { a, b } = playout(node.state, rng, opts);

    // 4. Backpropagation: credit each node's mover.
    for (let n: Node | null = node; n; n = n.parent) {
      n.visits++;
      n.reward += rewardFor(n.mover, a, b);
    }
  }

  // Most-visited child is the robust choice (less noisy than best average).
  const ranked = [...root.children].sort((x, y) => y.visits - x.visits || x.move - y.move);
  const best = ranked[0] as Node;
  const pv: number[] = [];
  for (let n: Node | undefined = best; n;) {
    pv.push(n.move);
    n = [...n.children].sort((x, y) => y.visits - x.visits)[0];
    if (pv.length > 16) break;
  }
  return {
    move: best.move,
    score: Math.round((best.reward / Math.max(1, best.visits)) * 100),
    depth: maxDepth,
    nodes: iterations,
    pv,
  };
}

function playout(start: GameState, rng: Rng, opts: MctsOptions): { a: number; b: number } {
  let s = start;
  for (let ply = 0; !s.over && ply < opts.maxPlayoutPlies; ply++) {
    const moves = legalMoves(s);
    let m: number;
    if (opts.playoutPolicy === 'egreedy' && rng.next() >= opts.epsilon) {
      m = greedyPick(s, moves, rng, opts.rules);
    } else {
      m = moves[rng.int(moves.length)] as number;
    }
    s = applyMove(s, m, opts.rules).state;
  }
  return finalScore(s, opts.rules);
}

function greedyPick(s: GameState, moves: number[], rng: Rng, rules: RuleConfig): number {
  const store = storeOf(s.toMove);
  let best = -1;
  let bestGain = -1;
  let ties = 0;
  for (const m of moves) {
    const r = applyMove(s, m, rules);
    const gain = (r.state.slots[store] as number) * 2 + (r.extraTurn ? 1 : 0);
    if (gain > bestGain) {
      bestGain = gain;
      best = m;
      ties = 1;
    } else if (gain === bestGain && rng.int(++ties) === 0) {
      best = m; // reservoir sampling for a uniform tie-break
    }
  }
  return best;
}

export function createMctsBot(
  options: Partial<MctsOptions> = {},
  defaults: Partial<SearchLimits> = {},
): Bot {
  const opts: MctsOptions = { ...DEFAULT_MCTS, ...options };
  return withAsync({
    id: 'mcts',
    version: '1.0.0',
    think(s, limits) {
      return mctsSearch(s, { ...defaults, ...limits }, opts);
    },
  });
}
