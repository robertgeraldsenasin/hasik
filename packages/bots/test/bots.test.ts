import { describe, expect, it } from 'vitest';
import {
  type GameState,
  applyMove,
  deriveSeed,
  fromSlots,
  gameResult,
  initialState,
  legalMoves,
} from '@hasik/engine';
import {
  Bound,
  LEVELS,
  TranspositionTable,
  createBot,
  mctsSearch,
  parseBotSpec,
} from '../src/index';

function match(specA: string, specB: string, games: number, seed = 7): number {
  let points = 0;
  for (let g = 0; g < games; g++) {
    const aFirst = g % 2 === 0; // colours swapped every game
    const first = createBot(aFirst ? specA : specB);
    const second = createBot(aFirst ? specB : specA);
    let s: GameState = initialState();
    let ply = 0;
    while (!s.over && ply < 1000) {
      const side = s.toMove === 0 ? first : second;
      const r = side.bot.think(s, { ...side.limits, seed: deriveSeed(seed, g, ply) });
      s = applyMove(s, r.move).state;
      ply++;
    }
    const res = gameResult(s);
    const aSide = aFirst ? 'A' : 'B';
    points += res === 'draw' ? 0.5 : res === aSide ? 1 : 0;
  }
  return points / games;
}

describe('bots play legal moves', () => {
  for (const spec of ['random', 'greedy', 'minimax:depth=2', 'mcts:playouts=200']) {
    it(`${spec} returns a legal move in many positions and is seed-deterministic`, () => {
      const { bot, limits } = createBot(spec);
      let s = initialState();
      for (let ply = 0; ply < 30 && !s.over; ply++) {
        const r1 = bot.think(s, { ...limits, seed: ply });
        const r2 = bot.think(s, { ...limits, seed: ply });
        expect(legalMoves(s)).toContain(r1.move);
        expect(r2.move).toBe(r1.move);
        s = applyMove(s, r1.move).state;
      }
    });
  }

  it('async chooseMove matches think', async () => {
    const { bot } = createBot('minimax:depth=3');
    const s = initialState();
    expect((await bot.chooseMove(s, { seed: 1, depth: 3 })).move).toBe(
      bot.think(s, { seed: 1, depth: 3 }).move,
    );
  });

  it('every bot refuses to move in a finished game', () => {
    const over = fromSlots([0, 0, 0, 0, 0, 0, 0, 49, 0, 0, 0, 0, 0, 0, 0, 49], 0);
    for (const spec of ['random', 'greedy', 'minimax:depth=2', 'mcts:playouts=10']) {
      expect(() => createBot(spec).bot.think(over, { seed: 1 })).toThrow();
    }
  });
});

describe('strength sanity (small, fast matches)', () => {
  it('minimax beats greedy', () => {
    expect(match('minimax:nodes=5000', 'greedy', 10)).toBeGreaterThanOrEqual(0.8);
  });
  it('greedy beats random', () => {
    expect(match('greedy', 'random', 20)).toBeGreaterThanOrEqual(0.7);
  });
  it('mcts beats random', () => {
    expect(match('mcts:playouts=300', 'random', 10)).toBeGreaterThanOrEqual(0.8);
  });
});

describe('mcts', () => {
  it('returns the forced move without searching', () => {
    const s = fromSlots([0, 0, 0, 0, 0, 0, 3, 40, 1, 1, 1, 1, 1, 1, 1, 48], 0);
    expect(mctsSearch(s, { seed: 1, nodes: 100 })).toMatchObject({ move: 6, nodes: 0 });
  });
  it('uses the playout budget and reports a principal variation', () => {
    const r = mctsSearch(initialState(), { seed: 3, nodes: 500 });
    expect(r.nodes).toBe(500);
    expect(r.pv?.[0]).toBe(r.move);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
  it('honours an injected clock', () => {
    let t = 0;
    const r = mctsSearch(initialState(), { seed: 3, timeMs: 1, now: () => (t += 0.01) });
    expect(r.nodes).toBeGreaterThan(0);
  });
});

describe('transposition table', () => {
  it('stores and probes by full key', () => {
    const tt = new TranspositionTable(4);
    tt.store(1, 2, 5, 123, Bound.Exact, 3);
    const e = tt.probe(1, 2);
    expect(e).toBeGreaterThanOrEqual(0);
    expect([tt.entryScore(e), tt.entryDepth(e), tt.entryFlag(e), tt.entryMove(e)]).toEqual([
      123,
      5,
      Bound.Exact,
      3,
    ]);
    expect(tt.probe(9, 2)).toBe(-1); // same bucket, different key
  });

  it('keeps the deeper entry in slot 0 and puts shallower ones in slot 1', () => {
    const tt = new TranspositionTable(4);
    tt.store(1, 16, 8, 10, Bound.Exact, 1); // bucket 0
    tt.store(2, 32, 2, 20, Bound.Exact, 2); // same bucket, shallower -> slot 1
    expect(tt.probe(1, 16)).toBeGreaterThanOrEqual(0);
    expect(tt.probe(2, 32)).toBeGreaterThanOrEqual(0);
    tt.store(3, 48, 1, 30, Bound.Exact, 3); // replaces slot 1 (always-replace)
    expect(tt.probe(1, 16)).toBeGreaterThanOrEqual(0);
    expect(tt.probe(2, 32)).toBe(-1);
  });

  it('newSearch() makes old entries invisible, including across generation wrap-around', () => {
    const tt = new TranspositionTable(4);
    tt.store(1, 2, 5, 1, Bound.Lower, -1);
    tt.newSearch();
    expect(tt.probe(1, 2)).toBe(-1);
    for (let i = 0; i < 300; i++) tt.newSearch();
    expect(tt.probe(1, 2)).toBe(-1);
    expect(tt.bytes).toBeGreaterThan(0);
  });

  it('rejects silly sizes', () => {
    expect(() => new TranspositionTable(2)).toThrow(RangeError);
  });
});

describe('registry', () => {
  it('parses specs', () => {
    expect(parseBotSpec('minimax:nodes=20000,tt=0')).toMatchObject({
      kind: 'minimax',
      params: { nodes: 20000, tt: 0 },
    });
    expect(parseBotSpec('mcts:policy=random').params.policy).toBe(0);
    expect(() => parseBotSpec('stockfish')).toThrow(/unknown bot/);
    expect(() => parseBotSpec('minimax:depth')).toThrow(/bad bot parameter/);
    expect(() => parseBotSpec('minimax:depth=abc')).toThrow(/must be a number/);
  });

  it('builds every level and the documented option spellings', () => {
    for (const l of LEVELS) expect(createBot(l.spec).bot.id).toBeTruthy();
    expect(createBot('minimax:ab=0,order=0,tt=0,ext=0,ttlog2=10,k=2').bot.id).toBe('minimax');
    expect(createBot('mcts:c=1,policy=egreedy,eps=0.2,ms=50').limits.timeMs).toBe(50);
  });
});
