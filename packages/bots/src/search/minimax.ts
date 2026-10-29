/**
 * The main AI (algorithm A4): negamax with alpha-beta pruning, iterative
 * deepening, a transposition table, move ordering (A6) and an extra-turn
 * extension.
 *
 * THE Sungka-specific trap: after a move the same player may move again. In
 * negamax you normally negate the child's score and flip the window because the
 * opponent moves next. When the mover keeps the turn, the child's score is
 * already from our point of view: do NOT negate it and keep the same window.
 * A test compares this search against plain minimax on random positions to
 * catch exactly that sign bug.
 *
 * Every technique can be switched off so tools/bench can measure what each one
 * buys (the ablation table in the README).
 */
import {
  DEFAULT_RULES,
  type GameState,
  type MoveResult,
  type RuleConfig,
  applyMove,
  legalMoves,
} from '@hasik/engine';
import { type Bot, type BotMove, type SearchLimits, withAsync } from '../types';
import { DEFAULT_WEIGHTS, type EvalWeights, WIN_SCORE, evaluate, terminalScore } from './eval';
import { Bound, TranspositionTable } from './tt';

export interface MinimaxOptions {
  readonly rules: RuleConfig;
  readonly weights: EvalWeights;
  /** Alpha-beta pruning. Off = plain minimax (ablation baseline). */
  readonly alphaBeta: boolean;
  /** Move ordering: TT move, extra turns, captures, killers, history. */
  readonly ordering: boolean;
  /** Transposition table. */
  readonly tt: boolean;
  /** log2 of TT buckets (2 entries each). 16 = 131,072 entries, about 2 MB. */
  readonly ttSizeLog2: number;
  /** Don't reduce depth on an extra-turn move (capped by maxExtensions in a row). */
  readonly extraTurnExtension: boolean;
  /** K in the spec: max consecutive non-decrementing extensions on one line. */
  readonly maxExtensions: number;
  /** Safety cap for iterative deepening when no other limit is given. */
  readonly maxDepth: number;
}

export const DEFAULT_MINIMAX: MinimaxOptions = Object.freeze({
  rules: DEFAULT_RULES,
  weights: DEFAULT_WEIGHTS,
  alphaBeta: true,
  ordering: true,
  tt: true,
  ttSizeLog2: 16,
  extraTurnExtension: true,
  maxExtensions: 4,
  maxDepth: 64,
});

const INF = 1_000_000_000;
const IDENTITY: readonly number[][] = Array.from({ length: 8 }, (_, n) =>
  Array.from({ length: n }, (_, i) => i),
);
const MAX_PLY = 256;

/** Outcome of one search, with the statistics the bench and hint mode report. */
export interface SearchReport extends BotMove {
  readonly move: number;
  readonly score: number;
  readonly depth: number;
  readonly nodes: number;
  readonly pv: readonly number[];
  /** Nodes needed to finish each completed depth (index = depth). */
  readonly nodesPerDepth: readonly number[];
}

class Aborted extends Error {}

export class MinimaxSearch {
  readonly opts: MinimaxOptions;
  private readonly table: TranspositionTable | null;
  private nodes = 0;
  private nodeLimit = Infinity;
  private deadline = Infinity;
  private now: (() => number) | null = null;
  private canAbort = false;
  private readonly killers = new Int8Array(MAX_PLY * 2).fill(-1);
  private readonly history = new Int32Array(16);
  private rootBest = -1;

  constructor(options: Partial<MinimaxOptions> = {}) {
    this.opts = { ...DEFAULT_MINIMAX, ...options };
    this.table = this.opts.tt ? new TranspositionTable(this.opts.ttSizeLog2) : null;
  }

  search(s: GameState, limits: Partial<SearchLimits> = {}): SearchReport {
    const moves = legalMoves(s);
    if (moves.length === 0) throw new Error('minimax asked to move in a finished game');

    this.nodes = 0;
    this.nodeLimit = limits.nodes ?? Infinity;
    this.now = limits.now ?? null;
    this.deadline = limits.timeMs !== undefined && this.now ? this.now() + limits.timeMs : Infinity;
    const start = this.now ? this.now() : 0;
    const maxDepth = Math.min(limits.depth ?? this.opts.maxDepth, this.opts.maxDepth);
    const unlimited =
      limits.depth === undefined && limits.nodes === undefined && this.deadline === Infinity;
    const depthCap = unlimited ? 6 : maxDepth; // never search forever by accident

    this.table?.newSearch();
    this.killers.fill(-1);
    this.history.fill(0);

    let best: number = moves[0] as number;
    let bestScore = 0;
    let completed = 0;
    let pv: number[] = [best];
    const nodesPerDepth: number[] = [0];

    if (moves.length === 1) {
      // Forced move: no need to search, but report a score for the hint panel.
      return {
        move: best,
        score: evaluate(s, this.opts.weights, this.opts.rules),
        depth: 0,
        nodes: 0,
        pv,
        nodesPerDepth,
      };
    }

    for (let depth = 1; depth <= depthCap; depth++) {
      this.canAbort = depth > 1; // depth 1 always completes, so there is always a move
      const before = this.nodes;
      let score: number;
      try {
        score = this.negamax(s, depth, -INF, INF, 0, this.opts.maxExtensions, true);
      } catch (e) {
        if (e instanceof Aborted) break;
        throw e;
      }
      best = this.rootBest;
      bestScore = score;
      completed = depth;
      nodesPerDepth.push(this.nodes - before);
      pv = this.principalVariation(s, best, depth);
      // A proven result cannot change with more depth (scores include the final margin).
      if (Math.abs(score) >= WIN_SCORE && this.allLinesResolved(s, depth)) break;
      // Soft limits: the next iteration costs more than all previous ones together,
      // so don't start it with less than half the budget left.
      if (this.nodes * 2 >= this.nodeLimit) break;
      if (
        this.now &&
        this.deadline !== Infinity &&
        this.now() - start >= (this.deadline - start) / 2
      )
        break;
    }

    return { move: best, score: bestScore, depth: completed, nodes: this.nodes, pv, nodesPerDepth };
  }

  /** Statistic for the bench: nodes searched so far. */
  get nodeCount(): number {
    return this.nodes;
  }

  private tick(): void {
    this.nodes++;
    if (!this.canAbort) return;
    if (this.nodes >= this.nodeLimit) throw new Aborted();
    if (this.now && (this.nodes & 1023) === 0 && this.now() >= this.deadline) throw new Aborted();
  }

  private negamax(
    s: GameState,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    extLeft: number,
    isRoot: boolean,
  ): number {
    this.tick();
    const { rules, weights } = this.opts;
    if (s.over) return terminalScore(s, rules);

    const alphaOrig = alpha;
    let ttMove = -1;
    const tt = this.table;
    if (tt && !isRoot) {
      const e = tt.probe(s.hashHi, s.hashLo);
      if (e >= 0) {
        ttMove = tt.entryMove(e);
        if (tt.entryDepth(e) >= depth) {
          const sc = tt.entryScore(e);
          const fl = tt.entryFlag(e);
          if (fl === Bound.Exact) return sc;
          if (fl === Bound.Lower && sc > alpha) alpha = sc;
          else if (fl === Bound.Upper && sc < beta) beta = sc;
          if (alpha >= beta) return sc;
        }
      }
    } else if (tt && isRoot) {
      const e = tt.probe(s.hashHi, s.hashLo);
      if (e >= 0) ttMove = tt.entryMove(e);
    }

    if (depth <= 0 || ply >= MAX_PLY - 1) return evaluate(s, weights, rules);

    const moves = legalMoves(s);
    const children: MoveResult[] = new Array(moves.length);
    for (let i = 0; i < moves.length; i++) children[i] = applyMove(s, moves[i] as number, rules);
    const order = this.opts.ordering
      ? this.orderMoves(moves, children, ttMove, ply)
      : IDENTITY[moves.length]!;

    let best = -INF;
    let bestMove = -1;
    for (const idx of order) {
      const m = moves[idx] as number;
      const child = children[idx] as MoveResult;
      // Negate exactly when the side to move changed. This also covers a terminal
      // child: terminalScore is computed from child.state.toMove's point of view.
      const sameSide = child.state.toMove === s.toMove;
      let d = depth - 1;
      let nextExt = this.opts.maxExtensions;
      if (sameSide) {
        if (this.opts.extraTurnExtension && extLeft > 0) {
          d = depth;
          nextExt = extLeft - 1;
        } else nextExt = extLeft;
      }
      // Same mover keeps the turn: same perspective, same window, no negation.
      const score = sameSide
        ? this.negamax(child.state, d, alpha, beta, ply + 1, nextExt, false)
        : -this.negamax(child.state, d, -beta, -alpha, ply + 1, nextExt, false);
      if (score > best) {
        best = score;
        bestMove = m;
        if (isRoot) this.rootBest = m;
      }
      if (this.opts.alphaBeta) {
        if (best > alpha) alpha = best;
        if (alpha >= beta) {
          if (this.opts.ordering) this.recordCutoff(m, depth, ply);
          break;
        }
      }
    }

    if (tt) {
      const flag = best <= alphaOrig ? Bound.Upper : best >= beta ? Bound.Lower : Bound.Exact;
      tt.store(s.hashHi, s.hashLo, depth, best, this.opts.alphaBeta ? flag : Bound.Exact, bestMove);
    }
    return best;
  }

  /**
   * Order: TT best move, then extra-turn moves, then captures (bigger first),
   * then killer moves at this ply, then history score. Returns indices.
   */
  private orderMoves(
    moves: number[],
    children: MoveResult[],
    ttMove: number,
    ply: number,
  ): number[] {
    const k0 = this.killers[ply * 2];
    const k1 = this.killers[ply * 2 + 1];
    const n = moves.length;
    const order: number[] = new Array(n);
    const keys: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const m = moves[i] as number;
      const c = children[i] as MoveResult;
      let key = this.history[m] as number;
      if (m === ttMove) key += 1 << 30;
      else if (c.extraTurn) key += 1 << 28;
      else if (c.captured > 0) key += (1 << 26) + c.captured * 1024;
      else if (m === k0 || m === k1) key += 1 << 24;
      // Insertion sort, descending by key (stable): at most 7 moves, so this beats Array.sort.
      let j = i;
      while (j > 0 && (keys[j - 1] as number) < key) {
        keys[j] = keys[j - 1] as number;
        order[j] = order[j - 1] as number;
        j--;
      }
      keys[j] = key;
      order[j] = i;
    }
    return order;
  }

  private recordCutoff(m: number, depth: number, ply: number): void {
    const i = ply * 2;
    if (this.killers[i] !== m) {
      this.killers[i + 1] = this.killers[i] as number;
      this.killers[i] = m;
    }
    this.history[m] = Math.min((this.history[m] as number) + depth * depth, 1 << 22);
  }

  /** Follow TT best moves from the root to recover the expected line. */
  private principalVariation(s: GameState, first: number, maxLen: number): number[] {
    const line = [first];
    let cur = applyMove(s, first, this.opts.rules).state;
    const seen = new Set<string>();
    while (this.table && line.length < maxLen + this.opts.maxExtensions && !cur.over) {
      const key = `${cur.hashHi}:${cur.hashLo}`;
      if (seen.has(key)) break;
      seen.add(key);
      const e = this.table.probe(cur.hashHi, cur.hashLo);
      if (e < 0) break;
      const m = this.table.entryMove(e);
      if (m < 0 || !legalMoves(cur).includes(m)) break;
      line.push(m);
      cur = applyMove(cur, m, this.opts.rules).state;
    }
    return line;
  }

  /** True when every line from the root ends in a terminal position within `depth` plies (cheap check). */
  private allLinesResolved(s: GameState, depth: number): boolean {
    const walk = (st: GameState, d: number, budget: { n: number }): boolean => {
      if (st.over) return true;
      if (d === 0 || --budget.n < 0) return false;
      for (const m of legalMoves(st))
        if (!walk(applyMove(st, m, this.opts.rules).state, d - 1, budget)) return false;
      return true;
    };
    return walk(s, depth, { n: 20_000 });
  }
}

/** Minimax as a Bot. One search object (and TT) per bot instance. */
export function createMinimaxBot(
  options: Partial<MinimaxOptions> = {},
  defaults: Partial<SearchLimits> = {},
): Bot {
  const engine = new MinimaxSearch(options);
  return withAsync({
    id: 'minimax',
    version: '1.0.0',
    think(s, limits) {
      return engine.search(s, { ...defaults, ...limits });
    },
  });
}
