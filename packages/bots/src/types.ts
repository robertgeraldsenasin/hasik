import type { GameState } from '@hasik/engine';

/**
 * Limits for one move. Any combination may be set; the search stops at the first
 * limit it hits. `nodes` and `depth` are deterministic (same result on any machine),
 * which is why CI and the SPRT gate use them. `timeMs` is for real play only.
 */
export interface SearchLimits {
  /** Seed for any randomness (tie-breaks, MCTS playouts). Recorded with every game. */
  readonly seed: number;
  readonly depth?: number;
  readonly nodes?: number;
  readonly timeMs?: number;
  /**
   * Clock injected from outside (e.g. performance.now). Engine and bot code never
   * read the clock themselves (constraint C2), so a search without `now` ignores timeMs.
   */
  readonly now?: () => number;
}

export interface BotMove {
  readonly move: number;
  /** Search score from the mover's view. Minimax: shells x 100. MCTS: expected score x 100. */
  readonly score?: number;
  /** Deepest completed iteration (minimax) or deepest tree path (MCTS). */
  readonly depth?: number;
  /** Nodes searched (minimax) or playouts (MCTS). */
  readonly nodes?: number;
  /** Principal variation: the line the bot expects. */
  readonly pv?: readonly number[];
}

export interface Bot {
  /** Stable identifier, e.g. "minimax". */
  readonly id: string;
  /** Bumped whenever playing behaviour changes. */
  readonly version: string;
  /** Synchronous search: used by the arena and the Web Worker. */
  think(s: GameState, limits: SearchLimits): BotMove;
  /** Async wrapper matching the spec's Bot interface. */
  chooseMove(s: GameState, limits: SearchLimits): Promise<BotMove>;
}

/** Helper so each bot only implements think(). */
export function withAsync(bot: Omit<Bot, 'chooseMove'>): Bot {
  return {
    ...bot,
    think: bot.think.bind(bot),
    chooseMove: (s, limits) => Promise.resolve(bot.think(s, limits)),
  };
}
