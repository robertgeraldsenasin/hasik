import { describe, expect, it } from 'vitest';
import { applyMove, initialState } from '@hasik/engine';
import { computeLayout, hitTest, shellOffsets } from '../src/board/layout';
import { describeMove, formatScore, houseNumber } from '../src/game/notation';
import { renderLeaderboard } from '../src/views/leaderboard';

describe('board layout', () => {
  it('puts the human row at the bottom and opposite houses in the same column', () => {
    for (const flip of [false, true]) {
      const L = computeLayout(900, flip);
      const bottom = flip ? 8 : 0;
      expect(L.slots[bottom]!.y).toBeGreaterThan(L.height / 2);
      for (let i = 0; i < 7; i++) expect(L.slots[i]!.x).toBeCloseTo(L.slots[14 - i]!.x, 6);
      const myStore = flip ? 15 : 7;
      expect(L.slots[myStore]!.x).toBeGreaterThan(L.width / 2); // sow left to right into the right-hand store
    }
  });

  it('hit-tests every slot at its centre and misses the gaps', () => {
    const L = computeLayout(900, false);
    for (let i = 0; i < 16; i++) expect(hitTest(L, L.slots[i]!.x, L.slots[i]!.y)).toBe(i);
    expect(hitTest(L, 1, 1)).toBeNull();
  });

  it('places shells deterministically inside the pit', () => {
    expect(shellOffsets(3, 7, 10)).toEqual(shellOffsets(3, 7, 10));
    for (const o of shellOffsets(3, 20, 10))
      expect(Math.hypot(o.dx, o.dy)).toBeLessThanOrEqual(10.0001);
  });

  it('keeps every shell in its spot when another one lands (fixed capacity)', () => {
    const before = shellOffsets(5, 9, 10, 14);
    const after = shellOffsets(5, 10, 10, 14);
    expect(after.slice(0, 9)).toEqual(before);
    for (const o of shellOffsets(5, 40, 10, 14))
      expect(Math.hypot(o.dx, o.dy)).toBeLessThanOrEqual(10.0001);
  });
});

describe('portrait board layout', () => {
  it('turns the board a quarter turn: your houses down the left, your store at the bottom', () => {
    for (const flip of [false, true]) {
      const L = computeLayout(390, flip, { orientation: 'portrait', maxHeight: 600 });
      expect(L.orientation).toBe('portrait');
      expect(L.height).toBeLessThanOrEqual(600);
      const near = flip ? 8 : 0;
      const far = flip ? 0 : 8;
      for (let k = 0; k < 7; k++) {
        expect(L.slots[near + k]!.x).toBeLessThan(L.width / 2);
        expect(L.slots[far + k]!.x).toBeGreaterThan(L.width / 2);
        if (k > 0) expect(L.slots[near + k]!.y).toBeGreaterThan(L.slots[near + k - 1]!.y);
      }
      for (let i = 0; i < 7; i++) expect(L.slots[i]!.y).toBeCloseTo(L.slots[14 - i]!.y, 6);
      const myStore = flip ? 15 : 7;
      const theirStore = flip ? 7 : 15;
      expect(L.slots[myStore]!.y).toBeGreaterThan(L.height / 2);
      expect(L.slots[theirStore]!.y).toBeLessThan(L.height / 2);
    }
  });

  it('hit-tests every slot and keeps houses big enough to tap', () => {
    const L = computeLayout(390, false, { orientation: 'portrait', maxHeight: 520 });
    for (let i = 0; i < 16; i++) expect(hitTest(L, L.slots[i]!.x, L.slots[i]!.y)).toBe(i);
    // The tap targets are max(44, 2r + 10) px; the pits themselves stay at least 36 px wide.
    expect(L.slots[0]!.r * 2).toBeGreaterThanOrEqual(36);
  });

  it('never lets two houses overlap, in either orientation', () => {
    for (const L of [
      computeLayout(320, false, { orientation: 'portrait', maxHeight: 420 }),
      computeLayout(1000, false),
      computeLayout(600, true),
    ]) {
      for (let i = 0; i < 16; i++)
        for (let j = i + 1; j < 16; j++) {
          const a = L.slots[i]!;
          const b = L.slots[j]!;
          if (a.kind === 'store' || b.kind === 'store') continue;
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
        }
    }
  });
});

describe('notation', () => {
  it('numbers houses 1-7 from each owner’s left', () => {
    expect([houseNumber(0), houseNumber(6), houseNumber(8), houseNumber(14)]).toEqual([1, 7, 1, 7]);
  });
  it('describes captures and extra turns', () => {
    const s = initialState();
    expect(describeMove(1, 0, 'You', 0, applyMove(s, 0)).text).toBe('A1 · extra turn');
    expect(describeMove(1, 0, 'You', 1, applyMove(s, 1)).text).toBe('A2 · captures 9 · 15 drops');
  });
  it('formats scores for both kinds of search', () => {
    expect(formatScore(250, 'minimax')).toBe('+2.5 shells');
    expect(formatScore(-100_012, 'minimax')).toBe('losing by 12');
    expect(formatScore(64, 'mcts')).toBe('64% expected');
    expect(formatScore(undefined, 'other')).toBe('–');
  });
});

describe('leaderboard rendering', () => {
  it('renders rows and escapes text', () => {
    const html = renderLeaderboard({
      generatedAt: '2026-10-29T00:00:00Z',
      hardware: { cpu: '<cpu>', cores: 2, ramGb: 8, os: 'linux', node: 'v22' },
      params: { pairsPerPairing: 10, openings: 200, seconds: 5 },
      bots: [
        {
          spec: 'greedy',
          name: 'Greedy',
          rating: 1500,
          rd: 50,
          games: 20,
          score: 0.5,
          vsGreedy: null,
        },
      ],
      pairings: [],
    });
    expect(html).toContain('Greedy');
    expect(html).toContain('± 100');
    expect(html).toContain('&lt;cpu&gt;');
    expect(html).not.toContain('<cpu>');
  });
});
