import { describe, expect, it } from 'vitest';
import { createBot } from '@hasik/bots';
import { encodePosition, initialState } from '@hasik/engine';
import { type Opening, type PairTask, playGame, playPair, runPairs, summarize } from '../src/index';

const start: Opening = { id: 0, position: encodePosition(initialState()), moves: [] };
const player = (spec: string) => ({ label: spec, ...createBot(spec) });

describe('playGame / playPair', () => {
  it('plays a full legal game and records it', () => {
    const g = playGame(player('greedy'), player('random'), initialState(), {
      pair: 0,
      game: 0,
      opening: 0,
      seed: 5,
    });
    expect(g.plies).toBe(g.moves.length);
    expect(g.scoreA + g.scoreB).toBe(98);
    expect(g.adjudicated).toBe(false);
  });

  it('adjudicates at the ply cap', () => {
    const g = playGame(
      player('random'),
      player('random'),
      initialState(),
      { pair: 0, game: 0, opening: 0, seed: 5 },
      undefined,
      3,
    );
    expect(g.plies).toBe(3);
    expect(g.adjudicated).toBe(true);
  });

  it('forfeits a bot that returns an illegal move', () => {
    const cheat = {
      label: 'cheat',
      bot: { ...createBot('random').bot, think: () => ({ move: 7 }) },
      limits: {},
    };
    const g = playGame(cheat, player('random'), initialState(), {
      pair: 0,
      game: 0,
      opening: 0,
      seed: 1,
    });
    expect(g.result).toBe('B');
    expect(g.adjudicated).toBe(true);
  });

  it('a deterministic engine against itself scores exactly 1 point per pair', () => {
    const p = playPair(player('minimax:depth=2'), player('minimax:depth=2'), start, 0, 9);
    expect(p.pointsX).toBe(1);
    expect(p.games[0].moves).toEqual(p.games[1].moves);
  });
});

describe('runPairs', () => {
  const tasks: PairTask[] = Array.from({ length: 4 }, (_, i) => ({
    pair: i,
    x: { spec: 'greedy', label: 'greedy', source: 'local' as const },
    y: { spec: 'random', label: 'random', source: 'local' as const },
    opening: start,
    seed: 3,
    maxPlies: 1000,
  }));

  it('in-thread and worker-thread runs give identical, ordered results', async () => {
    const a = await runPairs(tasks, { workers: 1 });
    const b = await runPairs(tasks, { workers: 2 });
    expect(b).toEqual(a);
    expect(a.map((r) => r.pair)).toEqual([0, 1, 2, 3]);
  });

  it('stops early when onResult returns false', async () => {
    const r = await runPairs(tasks, { workers: 1, onResult: (_r, n) => n < 2 });
    expect(r).toHaveLength(2);
  });

  it('summarizes W/D/L and pentanomial counts from x’s side', async () => {
    const r = await runPairs(tasks, { workers: 1 });
    const s = summarize('greedy', 'random', r);
    expect(s.games).toBe(8);
    expect(s.wins + s.draws + s.losses).toBe(8);
    expect(s.pentanomial.reduce((x, y) => x + y, 0)).toBe(4);
    expect(s.score).toBeGreaterThan(0.5);
  });
});
