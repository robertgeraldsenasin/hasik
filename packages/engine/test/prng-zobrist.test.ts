import { describe, expect, it } from 'vitest';
import {
  applyMove,
  computeHash,
  createRng,
  deriveSeed,
  hashKey,
  initialState,
  splitmix32,
  toBigIntKey,
} from '../src/index';

describe('seeded PRNG', () => {
  it('is reproducible: same seed, same sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('different seeds diverge', () => {
    const a = createRng(1);
    const b = createRng(2);
    const sa = Array.from({ length: 8 }, () => a.nextU32());
    const sb = Array.from({ length: 8 }, () => b.nextU32());
    expect(sa).not.toEqual(sb);
  });

  it('produces floats in [0, 1) and roughly uniform integers', () => {
    const r = createRng(7);
    const counts = new Array(7).fill(0);
    for (let i = 0; i < 70_000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      counts[r.int(7)]++;
    }
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(500); // ~5 sigma
  });

  it('validates arguments', () => {
    const r = createRng(1);
    expect(() => r.int(0)).toThrow(RangeError);
    expect(() => r.int(1.5)).toThrow(RangeError);
    expect(() => r.pick([])).toThrow(RangeError);
    expect(r.pick(['only'])).toBe('only');
    expect(r.snapshot()).toHaveLength(4);
  });

  it('pins the first outputs so a silent algorithm change is caught', () => {
    const r = createRng(0);
    const first = [r.nextU32(), r.nextU32(), r.nextU32()];
    expect(first).toMatchInlineSnapshot(`
      [
        1789933344,
        44971166,
        2521387044,
      ]
    `);
    expect(splitmix32(0)()).toBe(splitmix32(0)());
  });

  it('derives distinct reproducible child seeds', () => {
    expect(deriveSeed(1, 2, 3)).toBe(deriveSeed(1, 2, 3));
    expect(deriveSeed(1, 2, 3)).not.toBe(deriveSeed(1, 3, 2));
  });
});

describe('Zobrist hashing', () => {
  it('the start position hash equals a full recompute and is stable', () => {
    const s = initialState();
    const full = computeHash(s.slots, 0);
    expect([s.hashHi, s.hashLo]).toEqual([full.hi, full.lo]);
    expect(hashKey(s)).toBe(toBigIntKey(full.hi, full.lo));
  });

  it('side to move changes the key', () => {
    const s = initialState();
    expect(computeHash(s.slots, 0)).not.toEqual(computeHash(s.slots, 1));
  });

  it('an extra turn does not flip the side key; a normal move does', () => {
    const s = initialState();
    const extra = applyMove(s, 0).state; // lands in store
    expect(extra.toMove).toBe(0);
    expect(computeHash(extra.slots, 0)).toEqual({ hi: extra.hashHi, lo: extra.hashLo });
    const normal = applyMove(s, 1).state;
    expect(normal.toMove).toBe(1);
    expect(computeHash(normal.slots, 1)).toEqual({ hi: normal.hashHi, lo: normal.hashLo });
  });
});
