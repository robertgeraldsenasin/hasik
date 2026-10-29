/**
 * Perft ("performance test"): count leaf nodes of the full move tree to a fixed depth.
 * Algorithm A2. If a perft count changes, the rules changed, so golden values
 * locked in a test act as a fingerprint for move generation.
 *
 * Depth counts moves (plies), not turns: an extra-turn move still costs one depth.
 * A terminal position counts as one leaf.
 */
import { applyMove, legalMoves } from './move';
import { DEFAULT_RULES, type RuleConfig } from './rules';
import type { GameState } from './state';

export function perft(s: GameState, depth: number, rules: RuleConfig = DEFAULT_RULES): number {
  if (depth === 0 || s.over) return 1;
  let total = 0;
  for (const m of legalMoves(s)) total += perft(applyMove(s, m, rules).state, depth - 1, rules);
  return total;
}

/** Perft split by root move, the standard tool for finding which branch a bug is in. */
export function perftDivide(
  s: GameState,
  depth: number,
  rules: RuleConfig = DEFAULT_RULES,
): Map<number, number> {
  const out = new Map<number, number>();
  if (depth < 1) return out;
  for (const m of legalMoves(s)) out.set(m, perft(applyMove(s, m, rules).state, depth - 1, rules));
  return out;
}
