/**
 * Hand-computed reference values (worked through in docs/guide/09-arena-ratings-sprt.md).
 */
import { describe, expect, it } from 'vitest';
import {
  decide,
  eloFromPentanomial,
  eloFromScore,
  eloFromWdl,
  llrPentanomial,
  llrTrinomial,
  regularize,
  scoreFromElo,
  sprtBounds,
  sprtStatus,
} from '../src/index';

describe('Elo <-> score', () => {
  it('maps 0 Elo to 50% and is a two-way inverse', () => {
    expect(scoreFromElo(0)).toBe(0.5);
    expect(scoreFromElo(400)).toBeCloseTo(10 / 11, 12);
    for (const e of [-300, -10, 5, 120]) expect(eloFromScore(scoreFromElo(e))).toBeCloseTo(e, 9);
    expect(eloFromScore(0)).toBe(-Infinity);
    expect(eloFromScore(1)).toBe(Infinity);
  });
});

describe('SPRT bounds', () => {
  it('are about +-2.944 for alpha = beta = 0.05', () => {
    const b = sprtBounds(0.05, 0.05);
    expect(b.upper).toBeCloseTo(Math.log(19), 12);
    expect(b.lower).toBeCloseTo(-Math.log(19), 12);
    expect(b.upper).toBeCloseTo(2.944, 3);
  });
  it('reject nonsense error rates', () => {
    expect(() => sprtBounds(0, 0.05)).toThrow(RangeError);
    expect(() => sprtBounds(0.05, 1)).toThrow(RangeError);
  });
  it('decide() compares against the bounds', () => {
    const b = sprtBounds(0.05, 0.05);
    expect(decide(3, b)).toBe('H1');
    expect(decide(-3, b)).toBe('H0');
    expect(decide(0.1, b)).toBe('continue');
  });
});

describe('trinomial LLR (spec formula)', () => {
  it('matches a hand computation: W=60 D=10 L=30, bounds [0, 5]', () => {
    // N = 100, mean = (60 + 5) / 100 = 0.65
    // var = (60*0.35^2 + 10*0.15^2 + 30*0.65^2) / 100 = (7.35 + 0.225 + 12.675) / 100 = 0.2025
    // s0 = 0.5, s1 = 1 / (1 + 10^(-5/400)) = 0.507195...
    // LLR = 100 * (s1 - s0) * (1.3 - s0 - s1) / (2 * 0.2025)
    //     = 100 * 0.0071953 * 0.2928047 / 0.405 = 0.52020
    const s1 = 1 / (1 + Math.pow(10, -5 / 400));
    const expected = (100 * (s1 - 0.5) * (1.3 - 0.5 - s1)) / (2 * 0.2025);
    expect(llrTrinomial(60, 10, 30, 0, 5)).toBeCloseTo(expected, 12);
    expect(expected).toBeCloseTo(0.5202, 4);
  });
  it('is zero with no games and negative for a clearly losing engine', () => {
    expect(llrTrinomial(0, 0, 0, 0, 5)).toBe(0);
    expect(llrTrinomial(10, 0, 90, -10, 0)).toBeLessThan(-2.94);
  });
});

describe('pentanomial LLR', () => {
  it('accepts H1 at once for identical engines in non-regression mode (only 1-1 pairs)', () => {
    const st = sprtStatus([0, 0, 50, 0, 0], { elo0: -10, elo1: 0, alpha: 0.05, beta: 0.05 });
    expect(st.decision).toBe('H1');
  });
  it('rejects a "gainer" claim for identical engines (no gain shown)', () => {
    const st = sprtStatus([0, 0, 50, 0, 0], { elo0: 0, elo1: 5, alpha: 0.05, beta: 0.05 });
    expect(st.decision).toBe('H0');
  });
  it('rejects a clearly weaker engine', () => {
    expect(llrPentanomial([20, 30, 40, 8, 2], -10, 0)).toBeLessThan(-2.94);
  });
  it('makes no decision before the minimum sample, however extreme the LLR', () => {
    const cfg = { elo0: -10, elo1: 0, alpha: 0.05, beta: 0.05 };
    const early = sprtStatus([1, 0, 0, 0, 0], cfg);
    expect(early.llr).toBeLessThan(-2.94);
    expect(early.decision).toBe('continue');
    expect(sprtStatus([1, 0, 0, 0, 0], { ...cfg, minPairs: 1 }).decision).toBe('H0');
    expect(sprtStatus([25, 5, 0, 0, 0], cfg).decision).toBe('H0');
  });
  it('regularizes empty buckets only', () => {
    expect(regularize([0, 1, 2, 0, 3])).toEqual([1e-3, 1, 2, 1e-3, 3]);
  });
});

describe('Elo estimates with 95% intervals', () => {
  it('per game: 75% score is about +191 Elo, CI contains it', () => {
    const e = eloFromWdl(70, 10, 20);
    expect(e.score).toBeCloseTo(0.75, 12);
    expect(e.elo).toBeCloseTo(190.85, 1);
    expect(e.lo).toBeLessThan(e.elo);
    expect(e.hi).toBeGreaterThan(e.elo);
  });
  it('per pair: even pairs give 0 Elo', () => {
    const e = eloFromPentanomial([5, 10, 70, 10, 5]);
    expect(e.elo).toBeCloseTo(0, 9);
    expect(e.samples).toBe(100);
  });
  it('handles no samples', () => {
    expect(eloFromWdl(0, 0, 0).elo).toBeCloseTo(0, 9);
  });
  it('reports unbounded intervals as infinite, not clamped', () => {
    const e = eloFromWdl(79, 0, 1);
    expect(e.hi).toBe(Infinity);
    expect(Number.isFinite(e.elo)).toBe(true);
    expect(eloFromWdl(80, 0, 0).elo).toBe(Infinity);
  });
});
