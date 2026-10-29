/**
 * Ablation matches -> results/ablation.json. At an EQUAL node budget, the full
 * search plays a version with one technique switched off. The Elo difference is
 * what that technique is worth in playing strength (not just in node counts).
 * Usage: pnpm ablation [--pairs 40]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  type PairTask,
  defaultWorkers,
  hardware,
  loadOpenings,
  runPairs,
  summarize,
} from '@hasik/arena';

const { values } = parseArgs({
  options: { pairs: { type: 'string', default: '40' }, workers: { type: 'string' } },
});
const root = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const openings = loadOpenings(root('tools/openings/openings.json'));
const NODES = 10_000;
const full = `minimax:nodes=${NODES}`;
const variants: Array<[string, string]> = [
  ['Transposition table', `minimax:nodes=${NODES},tt=0`],
  ['Move ordering', `minimax:nodes=${NODES},order=0`],
  ['Extra-turn extension', `minimax:nodes=${NODES},ext=0`],
  ['Alpha-beta pruning', `minimax:nodes=${NODES},ab=0,order=0,tt=0`],
];
const pairs = Number(values.pairs);
const rows = [];
for (const [technique, without] of variants) {
  const tasks: PairTask[] = Array.from({ length: pairs }, (_, i) => ({
    pair: i,
    x: { spec: full, label: full, source: 'local' as const },
    y: { spec: without, label: without, source: 'local' as const },
    opening: openings[i % openings.length]!,
    seed: 1,
    maxPlies: 1000,
  }));
  const res = await runPairs(tasks, {
    workers: values.workers ? Number(values.workers) : defaultWorkers(),
  });
  const s = summarize(full, without, res);
  console.log(
    `${technique.padEnd(22)} full vs without: +${s.wins} =${s.draws} -${s.losses}, Elo ${s.eloPairs.elo.toFixed(0)} [${s.eloPairs.lo.toFixed(0)}, ${s.eloPairs.hi.toFixed(0)}]`,
  );
  rows.push({
    technique,
    without,
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
    score: s.score,
    elo: s.eloPairs,
  });
}
mkdirSync(root('results'), { recursive: true });
writeFileSync(
  root('results/ablation.json'),
  JSON.stringify(
    {
      kind: 'ablation',
      generatedAt: new Date().toISOString(),
      hardware: hardware(),
      nodes: NODES,
      pairs,
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log('wrote results/ablation.json');
