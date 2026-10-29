/**
 * Property-based tests (fast-check): invariants that must hold over thousands of
 * random games under every rule variant. These are invariants C3 in 07_CONSTRAINTS.md.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type GameState,
  type RuleConfig,
  applyMove,
  computeHash,
  createRng,
  initialState,
  legalMoves,
  makeRules,
  totalShells,
} from '../src/index';
import { refApply } from './reference';

const MAX_PLIES = 3000;

const arbRules = fc.record({
  extraTurnOnStore: fc.boolean(),
  relaySowing: fc.boolean(),
  captureRequiresNonEmptyOpposite: fc.boolean(),
  captureIncludesLandingShell: fc.boolean(),
  remainingShellsGoTo: fc.constantFrom('owner' as const, 'capturer' as const),
});

/** Play a seeded random game, calling `check` before every move. Returns the plies played. */
function playRandom(
  seed: number,
  rules: RuleConfig,
  check: (s: GameState, m: number) => void,
): number {
  const rng = createRng(seed);
  let s = initialState();
  let plies = 0;
  while (!s.over && plies < MAX_PLIES) {
    const m = rng.pick(legalMoves(s));
    check(s, m);
    s = applyMove(s, m, rules).state;
    plies++;
  }
  return plies;
}

describe('engine invariants over random games', () => {
  it('conserves 98 shells, never mutates input, and keeps the incremental hash exact', () => {
    fc.assert(
      fc.property(fc.integer(), arbRules, (seed, flags) => {
        const rules = makeRules({ ...flags, throwOnSowLimit: true });
        playRandom(seed, rules, (s, m) => {
          const before = s.slots.slice();
          const r = applyMove(s, m, rules);
          expect(s.slots).toEqual(before);
          expect(totalShells(r.state)).toBe(98);
          const full = computeHash(r.state.slots, r.state.toMove);
          expect([r.state.hashHi, r.state.hashLo]).toEqual([full.hi, full.lo]);
          expect(r.error).toBeUndefined();
        });
      }),
      { numRuns: 150 },
    );
  });

  it('legal moves are exactly the mover’s non-empty houses', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        playRandom(seed, makeRules(), (s) => {
          const start = s.toMove === 0 ? 0 : 8;
          const expected: number[] = [];
          for (let i = start; i < start + 7; i++) if (s.slots[i]! > 0) expected.push(i);
          expect(legalMoves(s)).toEqual(expected);
        });
      }),
      { numRuns: 150 },
    );
  });

  it('games terminate (default rules) well within the ply cap', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const plies = playRandom(seed, makeRules({ throwOnSowLimit: true }), () => {});
        expect(plies).toBeLessThan(MAX_PLIES);
      }),
      { numRuns: 300 },
    );
  });

  it('matches the independent reference implementation move for move (differential test)', () => {
    fc.assert(
      fc.property(fc.integer(), arbRules, (seed, flags) => {
        const rules = makeRules(flags);
        playRandom(seed, rules, (s, m) => {
          const ref = refApply(Array.from(s.slots), s.toMove, m, rules);
          const got = applyMove(s, m, rules);
          expect(Array.from(got.state.slots)).toEqual(ref.slots);
          expect(got.state.toMove).toBe(ref.toMove);
          expect(got.extraTurn).toBe(ref.extraTurn);
          expect(got.state.over).toBe(ref.over);
        });
      }),
      { numRuns: 200 },
    );
  });
});
