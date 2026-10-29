/**
 * Perft golden values: a fingerprint of the move generator. If any of these
 * change, the rules changed. Update them only together with an ADR.
 *
 * The values were cross-checked against the independent reference
 * implementation in test/reference.ts (see the "reference perft" test below).
 */
import { describe, expect, it } from 'vitest';
import {
  type GameState,
  applyMove,
  decodePosition,
  initialState,
  legalMoves,
  makeRules,
  perft,
  perftDivide,
  DEFAULT_RULES,
} from '../src/index';
import { refApply } from './reference';

const START_GOLDEN = [1, 7, 36, 230, 1406, 8293, 48263];

/** A mid-game position reached by a fixed move sequence, so it is reproducible. */
function midgame(): GameState {
  let s = initialState();
  for (const m of [0, 3, 10, 5, 12]) {
    const legal = legalMoves(s);
    s = applyMove(s, legal.includes(m) ? m : legal[0]!).state;
  }
  return s;
}

function refPerft(slots: number[], toMove: 0 | 1, over: boolean, depth: number): number {
  if (depth === 0 || over) return 1;
  const start = toMove === 0 ? 0 : 8;
  let n = 0;
  for (let i = start; i < start + 7; i++) {
    if (slots[i] === 0) continue;
    const r = refApply(slots, toMove, i, DEFAULT_RULES);
    n += refPerft(r.slots, r.toMove, r.over, depth - 1);
  }
  return n;
}

describe('perft', () => {
  it('matches golden values from the start position (depths 0-6)', () => {
    const s = initialState();
    START_GOLDEN.forEach((expected, depth) => expect(perft(s, depth)).toBe(expected));
  });

  it('matches the reference implementation at depth 5 from start and a midgame position', () => {
    for (const s of [initialState(), midgame()]) {
      expect(perft(s, 5)).toBe(refPerft(Array.from(s.slots), s.toMove, s.over, 5));
    }
  });

  it('divide sums to the total', () => {
    const s = midgame();
    const div = perftDivide(s, 4);
    const sum = [...div.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(perft(s, 4));
    expect(perftDivide(s, 0).size).toBe(0);
  });

  it('counts a terminal position as one leaf', () => {
    const over = decodePosition('0,0,0,0,0,0,0,49,0,0,0,0,0,0,0,49:A');
    expect(perft(over, 3)).toBe(1);
  });

  it('changes under a different rule variant (the fingerprint is rule-sensitive)', () => {
    expect(perft(initialState(), 4, makeRules({ relaySowing: false }))).not.toBe(START_GOLDEN[4]);
  });
});
