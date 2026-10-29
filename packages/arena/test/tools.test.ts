import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { decodePosition, encodePosition, initialState, legalMoves } from '@hasik/engine';
import { displayName, generateOpenings, hardware, loadOpenings, runPairTask } from '../src/index';

const BOOK = fileURLToPath(new URL('../../../tools/openings/openings.json', import.meta.url));

describe('opening book', () => {
  it('generates reproducible, playable, balanced positions', () => {
    const opts = { count: 3, seed: 5, maxAbsEval: 100_000, depth: 1, minPlies: 2, maxPlies: 3 };
    const a = generateOpenings(opts);
    expect(generateOpenings(opts)).toEqual(a);
    for (const o of a) {
      const s = decodePosition(o.position);
      expect(s.over).toBe(false);
      expect(legalMoves(s).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('reports progress while searching', () => {
    let calls = 0;
    generateOpenings({
      count: 2,
      seed: 1,
      maxAbsEval: 0,
      depth: 1,
      minPlies: 2,
      maxPlies: 6,
      onProgress: () => calls++,
    });
    expect(calls).toBeGreaterThan(0);
  });

  it('loads the committed book and rejects an empty one', () => {
    const book = loadOpenings(BOOK);
    expect(book.length).toBe(200);
    const dir = mkdtempSync(join(tmpdir(), 'hasik-'));
    writeFileSync(join(dir, 'empty.json'), JSON.stringify({ openings: [] }));
    expect(() => loadOpenings(join(dir, 'empty.json'))).toThrow(/no openings/);
  });
});

describe('CLI helpers', () => {
  it('names bots for tables', () => {
    expect(displayName('greedy')).toBe('Greedy');
    expect(displayName('minimax:nodes=50000')).toBe('Minimax (50k nodes)');
    expect(displayName('mcts:playouts=1500')).toBe('MCTS (1500 playouts)');
    expect(displayName('minimax:depth=3,tt=0')).toBe('Minimax (depth 3, tt=0)');
    expect(displayName('minimax:ms=200')).toBe('Minimax (200 ms)');
  });

  it('describes the hardware a result was produced on', () => {
    const h = hardware();
    expect(h.cores).toBeGreaterThan(0);
    expect(h.node).toMatch(/^v\d+/);
  });
});

describe('bundle-loaded bots (the SPRT gate path)', () => {
  it('plays a pair with bots loaded from an esbuild bundle', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hasik-bundle-'));
    const bundle = join(dir, 'bots.mjs');
    await build({
      entryPoints: [fileURLToPath(new URL('../../bots/src/index.ts', import.meta.url))],
      outfile: bundle,
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      logLevel: 'silent',
    });
    const opening = { id: 0, position: encodePosition(initialState()), moves: [] };
    const r = await runPairTask({
      pair: 0,
      x: { spec: 'minimax:depth=2', label: 'head', source: { bundle } },
      y: { spec: 'minimax:depth=2', label: 'base', source: { bundle } },
      opening,
      seed: 1,
      maxPlies: 1000,
    });
    expect(r.pointsX).toBe(1); // identical engines: one point each
  });

  it('rejects a bundle without createBot', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hasik-bad-'));
    const bad = join(dir, 'bad.mjs');
    writeFileSync(bad, 'export const nothing = 1;\n');
    const opening = { id: 0, position: encodePosition(initialState()), moves: [] };
    await expect(
      runPairTask({
        pair: 0,
        x: { spec: 'random', label: 'x', source: { bundle: bad } },
        y: { spec: 'random', label: 'y', source: 'local' },
        opening,
        seed: 1,
        maxPlies: 10,
      }),
    ).rejects.toThrow(/does not export createBot/);
  });
});
