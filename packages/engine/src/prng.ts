/**
 * Seeded pseudo-random number generator: xoshiro128** seeded through splitmix32.
 *
 * Why not Math.random: every game, opening file and SPRT run must be reproducible
 * from a recorded seed, in the browser, in Node and in CI. Math.random cannot be
 * seeded, so all randomness in Hasik flows through this module.
 *
 * Why xoshiro128**: 128 bits of state, a period of 2^128 - 1, passes BigCrush, and
 * runs entirely in 32-bit integer math (Math.imul), which is fast in JavaScript.
 * Reference: Blackman & Vigna, "Scrambled Linear Pseudorandom Number Generators" (2018).
 */

export interface Rng {
  /** Next unsigned 32-bit integer. */
  nextU32(): number;
  /** Next float in [0, 1). */
  next(): number;
  /** Unbiased integer in [0, n). Throws if n < 1. */
  int(n: number): number;
  /** Uniformly chosen element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Snapshot of the 4-word internal state (for debugging and tests). */
  snapshot(): [number, number, number, number];
}

/** splitmix32: a tiny generator used only to expand one 32-bit seed into 128 bits of state. */
export function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));

export function createRng(seed: number): Rng {
  const sm = splitmix32(seed);
  let s0 = sm();
  let s1 = sm();
  let s2 = sm();
  let s3 = sm();
  // xoshiro must never have an all-zero state.
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1;

  const nextU32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  };

  const int = (n: number): number => {
    if (!Number.isInteger(n) || n < 1)
      throw new RangeError(`int(n) needs a positive integer, got ${n}`);
    // Rejection sampling removes modulo bias.
    const limit = 0x100000000 - (0x100000000 % n);
    let x = nextU32();
    while (x >= limit) x = nextU32();
    return x % n;
  };

  return {
    nextU32,
    next: () => nextU32() / 0x100000000,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError('pick() on an empty array');
      return items[int(items.length)] as T;
    },
    snapshot: () => [s0 >>> 0, s1 >>> 0, s2 >>> 0, s3 >>> 0],
  };
}

/**
 * Derive a child seed from a parent seed and some integers (game index, pair index...).
 * Lets a match runner give every game its own reproducible seed from one match seed.
 */
export function deriveSeed(seed: number, ...parts: number[]): number {
  let h = seed >>> 0;
  for (const p of parts) {
    h = Math.imul(h ^ (p >>> 0), 0x9e3779b1) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return splitmix32(h)();
}
