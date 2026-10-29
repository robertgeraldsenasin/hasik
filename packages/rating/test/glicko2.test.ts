import { describe, expect, it } from 'vitest';
import { DEFAULT_RATING, ratePeriod, updateRating } from '../src/index';

describe('Glicko-2', () => {
  it('reproduces the worked example in Glickman (2013) to the stated precision', () => {
    const player = { rating: 1500, rd: 200, vol: 0.06 };
    const r = updateRating(
      player,
      [
        { opponent: { rating: 1400, rd: 30, vol: 0.06 }, score: 1 },
        { opponent: { rating: 1550, rd: 100, vol: 0.06 }, score: 0 },
        { opponent: { rating: 1700, rd: 300, vol: 0.06 }, score: 0 },
      ],
      { tau: 0.5 },
    );
    // The paper prints 1464.06 because it rounds intermediate values; exact arithmetic
    // gives 1464.0507, the figure other open-source implementations report too.
    expect(Math.abs(r.rating - 1464.06)).toBeLessThan(0.01);
    expect(r.rating).toBeCloseTo(1464.0507, 3);
    expect(r.rd).toBeCloseTo(151.52, 2);
    expect(r.vol).toBeCloseTo(0.059996, 6); // paper prints 0.05999 (truncated)
  });

  it('only grows RD for a player who did not compete, capped at maxRd', () => {
    const r = updateRating({ rating: 1600, rd: 100, vol: 0.06 }, []);
    expect(r.rating).toBe(1600);
    expect(r.rd).toBeGreaterThan(100);
    expect(updateRating(DEFAULT_RATING, []).rd).toBe(350);
  });

  it('a win raises the rating, a loss lowers it, and both shrink RD', () => {
    const opp = { rating: 1500, rd: 50, vol: 0.06 };
    const win = updateRating(DEFAULT_RATING, [{ opponent: opp, score: 1 }]);
    const loss = updateRating(DEFAULT_RATING, [{ opponent: opp, score: 0 }]);
    expect(win.rating).toBeGreaterThan(1500);
    expect(loss.rating).toBeLessThan(1500);
    expect(win.rd).toBeLessThan(350);
    expect(win.rating - 1500).toBeCloseTo(1500 - loss.rating, 6); // symmetric
  });

  it('handles the large-surprise branch of the volatility iteration', () => {
    const r = updateRating({ rating: 1500, rd: 30, vol: 0.06 }, [
      { opponent: { rating: 2400, rd: 30, vol: 0.06 }, score: 1 },
      { opponent: { rating: 2400, rd: 30, vol: 0.06 }, score: 1 },
    ]);
    expect(r.vol).toBeGreaterThan(0.06);
    expect(Number.isFinite(r.rating)).toBe(true);
  });

  it('rates a whole period against pre-period ratings, order-independent', () => {
    const start = new Map([
      ['a', DEFAULT_RATING],
      ['b', DEFAULT_RATING],
      ['idle', { rating: 1700, rd: 80, vol: 0.06 }],
    ]);
    const games = [
      { a: 'a', b: 'b', scoreA: 1 },
      { a: 'a', b: 'b', scoreA: 0.5 },
      { a: 'c', b: 'a', scoreA: 0 },
    ];
    const r1 = ratePeriod(start, games);
    const r2 = ratePeriod(start, [...games].reverse());
    expect(r1.get('a')).toEqual(r2.get('a'));
    expect(r1.get('a')!.rating).toBeGreaterThan(r1.get('b')!.rating);
    expect(r1.get('idle')!.rd).toBeGreaterThan(80);
    expect(r1.has('c')).toBe(true); // newcomers start at the default rating
  });
});
