/**
 * Zobrist hashing: a near-unique 64-bit key per position, used by the
 * transposition table to recognise positions reached by different move orders.
 *
 * Key = XOR of Z[slot][count] over all 16 slots, XOR Z_SIDE when Player B is to move.
 *
 * Why two 32-bit halves instead of BigInt: BigInt XOR allocates and is roughly
 * 10-50x slower than 32-bit integer XOR in V8. The search hashes millions of
 * positions, so the key lives in two plain numbers (hi, lo). ADR-0002.
 *
 * Keys come from the seeded PRNG with a fixed seed so hashes are identical in the
 * browser, in Node and in CI.
 */
import { createRng } from '../prng';
import { SLOT_COUNT, TOTAL_SHELLS } from './constants';

export const ZOBRIST_SEED = 0x5ee_d5ee;
const COUNTS = TOTAL_SHELLS + 1; // a slot can hold 0..98 shells

/** Z_HI[slot * COUNTS + count], Z_LO likewise. */
export const Z_HI = new Uint32Array(SLOT_COUNT * COUNTS);
export const Z_LO = new Uint32Array(SLOT_COUNT * COUNTS);
export let Z_SIDE_HI = 0;
export let Z_SIDE_LO = 0;

(() => {
  const rng = createRng(ZOBRIST_SEED);
  for (let i = 0; i < Z_HI.length; i++) {
    Z_HI[i] = rng.nextU32();
    Z_LO[i] = rng.nextU32();
  }
  Z_SIDE_HI = rng.nextU32();
  Z_SIDE_LO = rng.nextU32();
})();

export const zIndex = (slot: number, count: number): number => slot * COUNTS + count;

/** Full recompute from scratch. The search uses the incremental version in move.ts; tests check they agree. */
export function computeHash(slots: Uint8Array, toMove: 0 | 1): { hi: number; lo: number } {
  let hi = 0;
  let lo = 0;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const z = zIndex(i, slots[i] as number);
    hi ^= Z_HI[z] as number;
    lo ^= Z_LO[z] as number;
  }
  if (toMove === 1) {
    hi ^= Z_SIDE_HI;
    lo ^= Z_SIDE_LO;
  }
  return { hi: hi >>> 0, lo: lo >>> 0 };
}

/** Combine the halves into one BigInt (for display, debugging and the spec-shaped API). */
export const toBigIntKey = (hi: number, lo: number): bigint => (BigInt(hi) << 32n) | BigInt(lo);
