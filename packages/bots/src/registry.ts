/**
 * Bot registry: build any bot from a short text spec, so the arena CLI, the
 * SPRT gate, the nightly tournament and the web app all name bots the same way.
 *
 *   "random"
 *   "greedy"
 *   "minimax:depth=3"
 *   "minimax:nodes=20000,tt=0"        (options and limits mixed freely)
 *   "mcts:playouts=2000,policy=random"
 */
import { DEFAULT_RULES, type RuleConfig } from '@hasik/engine';
import { createMctsBot } from './search/mcts';
import { createMinimaxBot } from './search/minimax';
import { createGreedyBot, createRandomBot } from './simple';
import type { Bot, SearchLimits } from './types';

export type BotKind = 'random' | 'greedy' | 'minimax' | 'mcts';
export const BOT_KINDS: readonly BotKind[] = ['random', 'greedy', 'minimax', 'mcts'];

export interface ParsedBotSpec {
  readonly kind: BotKind;
  readonly params: Readonly<Record<string, number>>;
  /** Canonical label, e.g. "minimax:nodes=20000". */
  readonly label: string;
}

export function parseBotSpec(spec: string): ParsedBotSpec {
  const [kindRaw, rest = ''] = spec.trim().split(':', 2);
  const kind = kindRaw as BotKind;
  if (!BOT_KINDS.includes(kind))
    throw new Error(`unknown bot "${kindRaw}" (expected ${BOT_KINDS.join(', ')})`);
  const params: Record<string, number> = {};
  for (const part of rest.split(',').filter(Boolean)) {
    const [k, v] = part.split('=');
    if (!k || v === undefined) throw new Error(`bad bot parameter "${part}" in "${spec}"`);
    const value = v === 'random' ? 0 : v === 'egreedy' ? 1 : Number(v);
    if (!Number.isFinite(value)) throw new Error(`parameter ${k} must be a number in "${spec}"`);
    params[k] = value;
  }
  return { kind, params, label: spec.trim() };
}

const bool = (v: number | undefined, dflt: boolean) => (v === undefined ? dflt : v !== 0);

/** Build a bot plus its default limits from a spec string. */
export function createBot(
  spec: string,
  rules: RuleConfig = DEFAULT_RULES,
): { bot: Bot; limits: Partial<SearchLimits> } {
  const { kind, params: p } = parseBotSpec(spec);
  const limits: { depth?: number; nodes?: number; timeMs?: number } = {};
  if (p.depth !== undefined) limits.depth = p.depth;
  if (p.nodes !== undefined) limits.nodes = p.nodes;
  if (p.playouts !== undefined) limits.nodes = p.playouts;
  if (p.ms !== undefined) limits.timeMs = p.ms;
  switch (kind) {
    case 'random':
      return { bot: createRandomBot(), limits };
    case 'greedy':
      return { bot: createGreedyBot(rules), limits };
    case 'minimax':
      return {
        bot: createMinimaxBot({
          rules,
          alphaBeta: bool(p.ab, true),
          ordering: bool(p.order, true),
          tt: bool(p.tt, true),
          extraTurnExtension: bool(p.ext, true),
          ...(p.ttlog2 !== undefined ? { ttSizeLog2: p.ttlog2 } : {}),
          ...(p.k !== undefined ? { maxExtensions: p.k } : {}),
        }),
        limits,
      };
    case 'mcts':
      return {
        bot: createMctsBot({
          rules,
          ...(p.c !== undefined ? { exploration: p.c } : {}),
          ...(p.policy !== undefined
            ? { playoutPolicy: p.policy === 0 ? 'random' : 'egreedy' }
            : {}),
          ...(p.eps !== undefined ? { epsilon: p.eps } : {}),
        }),
        limits,
      };
  }
}

/** Difficulty levels shown in the web app (table in docs/spec/04_ALGORITHMS.md, A4). */
export interface Level {
  readonly level: 1 | 2 | 3 | 4 | 5;
  readonly name: string;
  readonly spec: string;
  readonly blurb: string;
}

export const LEVELS: readonly Level[] = [
  { level: 1, name: 'Baguhan', spec: 'random', blurb: 'Plays random legal moves.' },
  { level: 2, name: 'Sakim', spec: 'greedy', blurb: 'Grabs the most shells it can right now.' },
  {
    level: 3,
    name: 'Matalino',
    spec: 'minimax:depth=3',
    blurb: 'Alpha-beta search, 3 moves deep.',
  },
  {
    level: 4,
    name: 'Dalubhasa',
    spec: 'minimax:ms=200',
    blurb: 'Alpha-beta with a transposition table, 0.2 s per move.',
  },
  { level: 5, name: 'Hari', spec: 'minimax:ms=1000', blurb: 'Full search, 1 s per move.' },
];

/** Extra opponent offered in the UI: Monte Carlo Tree Search. */
export const MCTS_OPPONENT = {
  name: 'Monte Carlo',
  spec: 'mcts:ms=1000',
  blurb: 'Learns moves from thousands of simulated games.',
};
