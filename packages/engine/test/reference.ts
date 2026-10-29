/**
 * A deliberately naive, independent implementation of the rules, written in a
 * different style from src/core/move.ts (plain arrays, explicit modular walking,
 * no lookup tables). Differential tests play thousands of random games through
 * both and require identical results. Two implementations agreeing is much
 * stronger evidence than one implementation agreeing with itself.
 */
import type { RuleConfig } from '../src/index';

export interface RefResult {
  slots: number[];
  toMove: 0 | 1;
  extraTurn: boolean;
  over: boolean;
}

export function refApply(
  slots: number[],
  toMove: 0 | 1,
  house: number,
  rules: RuleConfig,
): RefResult {
  const b = [...slots];
  const myStore = toMove === 0 ? 7 : 15;
  const theirStore = toMove === 0 ? 15 : 7;
  const mine = (i: number) => (toMove === 0 ? i <= 6 : i >= 8 && i <= 14);
  let pos = house;
  let inHand = b[house]!;
  b[house] = 0;
  let extra = false;
  let drops = 0;
  while (true) {
    while (inHand > 0) {
      pos = (pos + 1) % 16;
      if (pos === theirStore) continue;
      b[pos]! += 1;
      inHand -= 1;
      drops += 1;
      if (drops > rules.maxSowSteps * 2) throw new Error('reference: runaway sow');
    }
    if (pos === myStore) {
      extra = rules.extraTurnOnStore;
      break;
    }
    if (b[pos]! > 1 && rules.relaySowing) {
      inHand = b[pos]!;
      b[pos] = 0;
      continue;
    }
    if (b[pos] === 1 && mine(pos)) {
      const opp = 14 - pos;
      if (b[opp]! > 0 || !rules.captureRequiresNonEmptyOpposite) {
        const take = b[opp]! + (rules.captureIncludesLandingShell ? 1 : 0);
        if (take > 0) {
          b[myStore]! += take;
          b[opp] = 0;
          if (rules.captureIncludesLandingShell) b[pos] = 0;
        }
      }
    }
    break;
  }
  const next: 0 | 1 = extra ? toMove : toMove === 0 ? 1 : 0;
  const range = next === 0 ? [0, 1, 2, 3, 4, 5, 6] : [8, 9, 10, 11, 12, 13, 14];
  const over = range.every((i) => b[i] === 0);
  return { slots: b, toMove: next, extraTurn: extra, over };
}
