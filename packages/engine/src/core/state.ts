import {
  type Player,
  SLOT_COUNT,
  SHELLS_PER_HOUSE,
  STORE_A,
  STORE_B,
  TOTAL_SHELLS,
} from './constants';
import { computeHash, toBigIntKey } from './zobrist';

/**
 * An immutable game position. Engine functions never mutate a GameState; they
 * return a new one. That keeps search, undo and the UI simple and bug-resistant.
 */
export interface GameState {
  /** 16 slots: 0..6 A houses, 7 A store, 8..14 B houses, 15 B store. */
  readonly slots: Uint8Array;
  readonly toMove: Player;
  /** Moves played so far (an extra turn still counts as a ply). */
  readonly ply: number;
  /** Zobrist key, high 32 bits. */
  readonly hashHi: number;
  /** Zobrist key, low 32 bits. */
  readonly hashLo: number;
  /** True when the player to move has no shells in their houses. */
  readonly over: boolean;
}

export function sideHasShells(slots: Uint8Array, p: Player): boolean {
  const start = p === 0 ? 0 : 8;
  for (let i = start; i < start + 7; i++) if ((slots[i] as number) > 0) return true;
  return false;
}

/** The standard opening position: 7 shells in every house, empty stores, A to move. */
export function initialState(): GameState {
  const slots = new Uint8Array(SLOT_COUNT);
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (i !== STORE_A && i !== STORE_B) slots[i] = SHELLS_PER_HOUSE;
  }
  return fromSlots(slots, 0, 0);
}

/**
 * Build a state from raw slot counts (for tests, openings and the tablebase).
 * Validates the shape and shell total so a malformed position fails loudly.
 */
export function fromSlots(slots: ArrayLike<number>, toMove: Player, ply = 0): GameState {
  if (slots.length !== SLOT_COUNT)
    throw new RangeError(`need ${SLOT_COUNT} slots, got ${slots.length}`);
  const s = Uint8Array.from(slots);
  let total = 0;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const v = slots[i] as number;
    if (!Number.isInteger(v) || v < 0 || v > TOTAL_SHELLS)
      throw new RangeError(`bad count ${v} at slot ${i}`);
    total += v;
  }
  if (total !== TOTAL_SHELLS)
    throw new RangeError(`shell total must be ${TOTAL_SHELLS}, got ${total}`);
  const { hi, lo } = computeHash(s, toMove);
  return { slots: s, toMove, ply, hashHi: hi, hashLo: lo, over: !sideHasShells(s, toMove) };
}

/** Compact text form, e.g. "7,7,7,7,7,7,7,0,7,7,7,7,7,7,7,0:A". Used in tests and the openings file. */
export function encodePosition(s: GameState): string {
  return `${Array.from(s.slots).join(',')}:${s.toMove === 0 ? 'A' : 'B'}`;
}

export function decodePosition(text: string, ply = 0): GameState {
  const [body, side] = text.trim().split(':');
  if (body === undefined || (side !== 'A' && side !== 'B'))
    throw new SyntaxError(`bad position "${text}"`);
  const nums = body.split(',').map((x) => Number(x));
  return fromSlots(nums, side === 'A' ? 0 : 1, ply);
}

/** The Zobrist key as a single BigInt (matches the spec's `hash: bigint`). */
export const hashKey = (s: GameState): bigint => toBigIntKey(s.hashHi, s.hashLo);
