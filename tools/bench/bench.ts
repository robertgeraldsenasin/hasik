/**
 * Engine benchmarks -> results/bench.json (methodology: docs/guide/06-testing-and-ci.md).
 *  1. Perft speed at depth 6 from the start position (median of 5 runs).
 *  2. Search speed (nodes/s) and depth reached at 200 ms and 1,000 ms.
 *  3. Ablation: nodes needed to finish a fixed depth as each technique is added.
 * Usage: pnpm bench
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MinimaxSearch, type MinimaxOptions } from '@hasik/bots';
import { decodePosition, initialState, perft } from '@hasik/engine';
import { hardware, loadOpenings } from '@hasik/arena';

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const root = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const positions = loadOpenings(root('tools/openings/openings.json'))
  .slice(0, 10)
  .map((o) => decodePosition(o.position));

// 1. Perft.
const perftRuns: number[] = [];
let leaves = 0;
for (let i = 0; i < 5; i++) {
  const t = performance.now();
  leaves = perft(initialState(), 6);
  perftRuns.push(performance.now() - t);
}
const perftMs = median(perftRuns);
console.log(
  `perft(6) = ${leaves} leaves, median ${perftMs.toFixed(0)} ms, ${Math.round((leaves / perftMs) * 1000).toLocaleString()} leaves/s`,
);

// 2. Search speed and depth under time limits.
const now = () => performance.now();
const timed = (ms: number) => {
  const depths: number[] = [];
  const nps: number[] = [];
  for (const s of positions.slice(0, 5)) {
    const t = now();
    const r = new MinimaxSearch().search(s, { timeMs: ms, now });
    const el = now() - t;
    depths.push(r.depth);
    nps.push((r.nodes / el) * 1000);
  }
  return {
    ms,
    avgDepth: depths.reduce((a, b) => a + b, 0) / depths.length,
    nodesPerSecond: Math.round(median(nps)),
  };
};
const at200 = timed(200);
const at1000 = timed(1000);
console.log(
  `search @200 ms: depth ${at200.avgDepth.toFixed(1)}, ${at200.nodesPerSecond.toLocaleString()} nodes/s`,
);
console.log(
  `search @1000 ms: depth ${at1000.avgDepth.toFixed(1)}, ${at1000.nodesPerSecond.toLocaleString()} nodes/s`,
);

// 3. Ablation: nodes to finish depth D over the same positions.
const D = 6;
const configs: Array<[string, Partial<MinimaxOptions>]> = [
  ['Plain minimax', { alphaBeta: false, ordering: false, tt: false, extraTurnExtension: false }],
  [
    '+ alpha-beta pruning',
    { alphaBeta: true, ordering: false, tt: false, extraTurnExtension: false },
  ],
  ['+ move ordering', { alphaBeta: true, ordering: true, tt: false, extraTurnExtension: false }],
  [
    '+ transposition table',
    { alphaBeta: true, ordering: true, tt: true, extraTurnExtension: false },
  ],
];
const ablation = configs.map(([name, opts]) => {
  let nodes = 0;
  const t = now();
  for (const s of positions) nodes += new MinimaxSearch(opts).search(s, { depth: D }).nodes;
  const ms = now() - t;
  console.log(
    `${name.padEnd(24)} ${nodes.toLocaleString().padStart(12)} nodes  ${ms.toFixed(0)} ms`,
  );
  return { name, nodes, ms: Math.round(ms) };
});

const out = {
  kind: 'bench',
  generatedAt: new Date().toISOString(),
  hardware: hardware(),
  perft: {
    depth: 6,
    leaves,
    medianMs: Math.round(perftMs),
    leavesPerSecond: Math.round((leaves / perftMs) * 1000),
  },
  search: [at200, at1000],
  ablation: { depth: D, positions: positions.length, rows: ablation },
};
mkdirSync(root('results'), { recursive: true });
writeFileSync(root('results/bench.json'), JSON.stringify(out, null, 2) + '\n');
console.log('wrote results/bench.json');
