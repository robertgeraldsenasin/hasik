/**
 * One or more tests per item in the rules checklist (docs/spec/02_GAME_RULES.md).
 */
import { describe, expect, it } from 'vitest';
import {
  IllegalMoveError,
  NEXT,
  STORE_A,
  STORE_B,
  SowLimitError,
  applyMove,
  applyMoveTraced,
  decodePosition,
  encodePosition,
  finalScore,
  firstHouseOf,
  fromSlots,
  gameResult,
  initialState,
  isHouse,
  isLegalMove,
  isStore,
  isTerminal,
  legalMoves,
  makeRules,
  opposite,
  other,
  ownerOf,
  slotName,
  storeOf,
  totalShells,
} from '../src/index';
import { pos, row } from './helpers';

describe('board geometry', () => {
  it('opposite houses line up across the board', () => {
    expect(opposite(0)).toBe(14); // A0 faces B6
    expect(opposite(6)).toBe(8); // A6 faces B0
    expect(opposite(3)).toBe(11);
  });

  it('NEXT skips the opponent store for each player', () => {
    expect(NEXT[0][14]).toBe(0); // A skips storeB
    expect(NEXT[0][6]).toBe(STORE_A);
    expect(NEXT[1][6]).toBe(8); // B skips storeA
    expect(NEXT[1][14]).toBe(STORE_B);
  });

  it('classifies slots and players', () => {
    expect([isStore(7), isStore(15), isStore(3)]).toEqual([true, true, false]);
    expect([isHouse(0), isHouse(7), isHouse(14), isHouse(15), isHouse(16), isHouse(-1)]).toEqual([
      true,
      false,
      true,
      false,
      false,
      false,
    ]);
    expect([ownerOf(3), ownerOf(7), ownerOf(9), ownerOf(15)]).toEqual([0, 0, 1, 1]);
    expect([firstHouseOf(0), firstHouseOf(1), storeOf(0), storeOf(1)]).toEqual([0, 8, 7, 15]);
    expect([other(0), other(1)]).toEqual([1, 0]);
    expect(isTerminal(initialState())).toBe(false);
  });

  it('names slots for logs', () => {
    expect([slotName(0), slotName(7), slotName(8), slotName(15)]).toEqual([
      'A0',
      'storeA',
      'B0',
      'storeB',
    ]);
  });
});

describe('initial position', () => {
  it('has 7 shells in each of 14 houses, empty stores, 98 total, A to move', () => {
    const s = initialState();
    expect(row(s, 0)).toEqual([7, 7, 7, 7, 7, 7, 7]);
    expect(row(s, 1)).toEqual([7, 7, 7, 7, 7, 7, 7]);
    expect(s.slots[STORE_A]).toBe(0);
    expect(s.slots[STORE_B]).toBe(0);
    expect(totalShells(s)).toBe(98);
    expect(s.toMove).toBe(0);
    expect(s.over).toBe(false);
  });
});

describe('legal moves', () => {
  it('are exactly the mover’s non-empty houses', () => {
    const s = pos([0, 3, 0, 1, 0, 0, 2], [5, 0, 0, 0, 0, 0, 1], 0);
    expect(legalMoves(s)).toEqual([1, 3, 6]);
    const t = pos([0, 3, 0, 1, 0, 0, 2], [5, 0, 0, 0, 0, 0, 1], 1);
    expect(legalMoves(t)).toEqual([8, 14]);
  });

  it('rejects empty houses, opponent houses, stores and out-of-range indices', () => {
    const s = initialState();
    for (const bad of [7, 8, 14, 15, -1, 16, 2.5]) {
      expect(isLegalMove(s, bad)).toBe(false);
      expect(() => applyMove(s, bad)).toThrow(IllegalMoveError);
    }
    const t = pos([0, 3, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0], 0);
    expect(() => applyMove(t, 0)).toThrow(IllegalMoveError);
  });

  it('is empty once the game is over, and moving then throws', () => {
    const s = pos([0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0], 0);
    expect(s.over).toBe(true);
    expect(legalMoves(s)).toEqual([]);
    expect(() => applyMove(s, 0)).toThrow(/game is over/);
  });
});

describe('sowing direction and stores', () => {
  it('A sows into its own store and skips storeB', () => {
    // A6 holds 10: drops 7(storeA), 8..14, skip 15, 0, 1. Relay off so we see raw drops.
    const s = pos([0, 0, 0, 0, 0, 0, 10], [0, 0, 0, 0, 0, 0, 0], 0, { b: 5 });
    const r = applyMoveTraced(s, 6, makeRules({ relaySowing: false }));
    const drops = r.events
      .filter((e) => e.kind === 'drop')
      .map((e) => (e as { slot: number }).slot);
    expect(drops).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 0, 1]);
    expect(r.state.slots[STORE_B]).toBe(5);
  });

  it('B sows into its own store and skips storeA', () => {
    const s = pos([0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 10], 1, { a: 5 }, 'b');
    const r = applyMoveTraced(s, 14, makeRules({ relaySowing: false }));
    const drops = r.events
      .filter((e) => e.kind === 'drop')
      .map((e) => (e as { slot: number }).slot);
    expect(drops).toEqual([15, 0, 1, 2, 3, 4, 5, 6, 8, 9]);
    expect(r.state.slots[STORE_A]).toBe(5);
  });
});

describe('extra turn', () => {
  it('last shell in own store gives the same player another move', () => {
    // From the start, A0's 7 shells land in slots 1..7, the last in storeA.
    const r = applyMove(initialState(), 0);
    expect(r.extraTurn).toBe(true);
    expect(r.state.toMove).toBe(0);
    expect(r.state.slots[STORE_A]).toBe(1);
  });

  it('does not happen when extraTurnOnStore is off', () => {
    const r = applyMove(initialState(), 0, makeRules({ extraTurnOnStore: false }));
    expect(r.extraTurn).toBe(false);
    expect(r.state.toMove).toBe(1);
  });
});

describe('relay sowing', () => {
  it('continues from the slot after the pickup house (hand-traced from the start: A1)', () => {
    // A1 (7): drops 2..7 and 8. B0 now holds 8 -> relay: 9..14, skip 15, 0, 1.
    // Slot 1 was emptied at the start, so the last shell lands alone on A's side:
    // capture 1 + B5 (8) = 9 into storeA (which already had 1).
    const r = applyMoveTraced(initialState(), 1);
    expect(r.state.slots[STORE_A]).toBe(10);
    expect(row(r.state, 0)).toEqual([8, 0, 8, 8, 8, 8, 8]);
    expect(row(r.state, 1)).toEqual([0, 8, 8, 8, 8, 0, 8]);
    expect(r.captured).toBe(9);
    expect(r.state.toMove).toBe(1);
    expect(r.sowSteps).toBe(15);
    const pickups = r.events.filter((e) => e.kind === 'pickup');
    expect(pickups).toEqual([
      { kind: 'pickup', slot: 1, count: 7, relay: false },
      { kind: 'pickup', slot: 8, count: 8, relay: true },
    ]);
  });

  it('stops at a non-empty house when relaySowing is off', () => {
    const s = pos([2, 0, 3, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1, 1], 0);
    const r = applyMove(s, 0, makeRules({ relaySowing: false }));
    expect(row(r.state, 0)).toEqual([0, 1, 4, 0, 0, 0, 0]);
    expect(r.state.toMove).toBe(1);
  });
});

describe('capture', () => {
  it('moves the landing shell plus the opposite house into the store', () => {
    // A0 has 2: drops 1, 2. Slot 2 was empty -> capture 1 + B4 (slot 12 = 14-2).
    const s = pos([2, 4, 0, 0, 0, 0, 0], [0, 0, 0, 0, 6, 0, 0], 0, { a: 10 });
    const r = applyMove(s, 0);
    expect(r.state.slots[2]).toBe(0);
    expect(r.state.slots[12]).toBe(0);
    expect(r.captured).toBe(7);
    expect(r.state.slots[STORE_A]).toBe(17 + (98 - 10 - 2 - 4 - 6));
    expect(r.state.toMove).toBe(1);
  });

  it('captures just the landing shell when the opposite house is empty (default rules)', () => {
    const s = pos([1, 0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0, 0], 0);
    const before = s.slots[STORE_A]!;
    const r = applyMove(s, 0);
    expect(r.captured).toBe(1);
    expect(r.state.slots[1]).toBe(0);
    expect(r.state.slots[STORE_A]).toBe(before + 1);
  });

  it('does not capture against an empty house when captureRequiresNonEmptyOpposite is on', () => {
    const s = pos([1, 0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0, 0], 0);
    const r = applyMove(s, 0, makeRules({ captureRequiresNonEmptyOpposite: true }));
    expect(r.captured).toBe(0);
    expect(r.state.slots[1]).toBe(1);
  });

  it('leaves the landing shell in place when captureIncludesLandingShell is off', () => {
    const s = pos([2, 4, 0, 0, 0, 0, 0], [0, 0, 0, 0, 6, 0, 0], 0);
    const r = applyMove(s, 0, makeRules({ captureIncludesLandingShell: false }));
    expect(r.captured).toBe(6);
    expect(r.state.slots[2]).toBe(1);
  });

  it('never captures on the opponent side: an empty opponent house just ends the turn', () => {
    // A6 has 2: drops storeA, then B0 (slot 8) which is empty.
    const s = pos([0, 0, 0, 0, 0, 0, 2], [0, 5, 0, 0, 0, 0, 0], 0);
    const r = applyMove(s, 6);
    expect(r.captured).toBe(0);
    expect(r.state.slots[8]).toBe(1);
    expect(r.state.toMove).toBe(1);
  });
});

describe('long sows', () => {
  it('a sow of 15+ shells laps the board and skips the opponent store every lap', () => {
    // A3 holds 31: two full laps of the 15 slots A can reach, plus one.
    const s = pos([0, 0, 0, 31, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], 0, { b: 20 });
    const r = applyMoveTraced(s, 3, makeRules({ relaySowing: false }));
    expect(r.state.slots[STORE_B]).toBe(20); // never touched
    expect(r.state.slots[STORE_A]).toBe(s.slots[STORE_A]! + 2); // passed twice
    expect(r.state.slots[3]).toBe(2); // the start house is refilled on each lap
    expect(r.sowSteps).toBe(31);
  });
});

describe('end of game', () => {
  it('ends exactly when the player to move has no shells in their houses', () => {
    // A's only shell goes to storeA (extra turn) but A then has nothing: game over.
    const s = pos([0, 0, 0, 0, 0, 0, 1], [3, 0, 0, 0, 0, 0, 0], 0);
    const r = applyMove(s, 6);
    expect(r.state.toMove).toBe(0);
    expect(r.state.over).toBe(true);
    expect(legalMoves(r.state)).toEqual([]);
  });

  it('is not over when only the waiting player is empty', () => {
    const s = pos([0, 0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0, 0], 1);
    expect(s.over).toBe(false);
  });

  it('gives remaining shells to their owner by default', () => {
    const s = fromSlots([0, 0, 0, 0, 0, 0, 0, 40, 5, 0, 0, 0, 0, 0, 3, 50], 0);
    expect(s.over).toBe(true);
    expect(finalScore(s)).toEqual({ a: 40, b: 58 });
    expect(gameResult(s)).toBe('B');
  });

  it('capturer rule gives remaining shells to the side that still has them', () => {
    const s = fromSlots([0, 0, 0, 0, 0, 0, 0, 40, 5, 0, 0, 0, 0, 0, 3, 50], 0);
    expect(finalScore(s, makeRules({ remainingShellsGoTo: 'capturer' }))).toEqual({ a: 40, b: 58 });
    // Mid-game (both sides have shells) it falls back to owner.
    const mid = fromSlots([1, 0, 0, 0, 0, 0, 0, 40, 4, 0, 0, 0, 0, 0, 3, 50], 0);
    expect(finalScore(mid, makeRules({ remainingShellsGoTo: 'capturer' }))).toEqual({
      a: 41,
      b: 57,
    });
  });

  it('is a draw at 49-49', () => {
    const s = fromSlots([0, 0, 0, 0, 0, 0, 0, 49, 0, 0, 0, 0, 0, 0, 0, 49], 0);
    expect(gameResult(s)).toBe('draw');
  });
});

describe('maxSowSteps guard', () => {
  it('throws in strict mode when the cap is hit', () => {
    const s = pos([0, 0, 0, 31, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], 0);
    expect(() => applyMove(s, 3, makeRules({ maxSowSteps: 10, throwOnSowLimit: true }))).toThrow(
      SowLimitError,
    );
  });

  it('ends the turn and conserves shells in production mode', () => {
    const s = pos([0, 0, 0, 31, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], 0);
    const r = applyMove(s, 3, makeRules({ maxSowSteps: 10 }));
    expect(r.error).toBe('MAX_SOW_STEPS');
    expect(totalShells(r.state)).toBe(98);
    expect(r.state.toMove).toBe(1);
  });
});

describe('position encoding', () => {
  it('round-trips and validates', () => {
    const s = applyMove(initialState(), 1).state;
    const text = encodePosition(s);
    expect(decodePosition(text).slots).toEqual(s.slots);
    expect(() => decodePosition('1,2,3:A')).toThrow();
    expect(() => decodePosition('7,7,7,7,7,7,7,0,7,7,7,7,7,7,7,0:C')).toThrow();
    expect(() => fromSlots(new Array(16).fill(1), 0)).toThrow(/total/);
    expect(() => fromSlots([99, ...new Array(15).fill(0)], 0)).toThrow(/bad count/);
  });

  it('does not mutate the input state', () => {
    const s = initialState();
    const copy = s.slots.slice();
    applyMove(s, 3);
    expect(s.slots).toEqual(copy);
  });
});
