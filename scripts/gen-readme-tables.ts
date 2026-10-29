/**
 * Regenerates the results tables in README.md from the committed files in
 * results/. Numbers in the README are never typed by hand.
 *
 *   pnpm readme:tables           rewrite README.md
 *   pnpm readme:tables --check   fail if README.md is out of date (used in CI)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const read = <T>(p: string): T | null =>
  existsSync(root(p)) ? (JSON.parse(readFileSync(root(p), 'utf8')) as T) : null;

interface Elo {
  elo: number | null;
  lo: number | null;
  hi: number | null;
}
interface Hw {
  cpu: string;
  cores: number;
  ramGb: number;
  os: string;
  node: string;
}
interface RoundRobin {
  hardware: Hw;
  params: { pairsPerPairing: number; openings: number; seconds: number };
  bots: Array<{
    name: string;
    spec: string;
    rating: number;
    rd: number;
    games: number;
    score: number;
    vsGreedy: { score: number; elo: Elo } | null;
  }>;
}
interface Bench {
  hardware: Hw;
  perft: { depth: number; leaves: number; leavesPerSecond: number };
  search: Array<{ ms: number; avgDepth: number; nodesPerSecond: number }>;
  ablation: { depth: number; positions: number; rows: Array<{ name: string; nodes: number }> };
}
interface Ablation {
  nodes: number;
  pairs: number;
  rows: Array<{
    technique: string;
    wins: number;
    draws: number;
    losses: number;
    score: number;
    elo: Elo;
  }>;
}

// JSON has no Infinity: an Elo bound that is infinite is stored as null.
const sign = (v: number | null, ifNull: '+∞' | '−∞') =>
  v === null || !Number.isFinite(v)
    ? ifNull
    : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}`;
const elo = (e: Elo, score: number) =>
  e.elo === null || !Number.isFinite(e.elo)
    ? score >= 0.5
      ? '+∞ (won every game)'
      : '−∞ (lost every game)'
    : `${sign(e.elo, '+∞')} (${sign(e.lo, '−∞')} to ${sign(e.hi, '+∞')})`;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const n = (x: number) => x.toLocaleString('en-US');
const hw = (h: Hw) => `${h.cpu}, ${h.cores} cores, ${h.ramGb} GB RAM, ${h.os}, Node ${h.node}`;

function roundRobinTable(rr: RoundRobin): string {
  const rows = rr.bots.map(
    (b) =>
      `| ${b.name} | ${b.rating} ± ${2 * b.rd} | ${pct(b.score)} | ${b.vsGreedy ? pct(b.vsGreedy.score) : '—'} | ${b.vsGreedy ? elo(b.vsGreedy.elo, b.vsGreedy.score) : '—'} |`,
  );
  return [
    `Round robin: ${rr.params.pairsPerPairing} game pairs per pairing (${rr.params.pairsPerPairing * 2} games), ` +
      `${rr.params.openings} balanced openings, colours swapped within each pair. Hardware: ${hw(rr.hardware)}.`,
    '',
    '| Bot | Glicko-2 (± 2 RD) | Score vs field | Score vs Greedy | Elo vs Greedy (95% CI) |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function searchTables(b: Bench | null, a: Ablation | null): string {
  const out: string[] = [];
  if (b) {
    const base = b.ablation.rows[0]!.nodes;
    out.push(
      `Nodes needed to finish a depth-${b.ablation.depth} search, summed over ${b.ablation.positions} opening positions:`,
      '',
      '| Search | Nodes | vs plain minimax |',
      '| --- | --- | --- |',
      ...b.ablation.rows.map((r) =>
        `| ${r.name} | ${n(r.nodes)} | ${(base / r.nodes).toFixed(1)}× fewer |`.replace(
          '| 1.0× fewer |',
          '| — |',
        ),
      ),
      '',
    );
  }
  if (a) {
    out.push(
      `What each technique is worth in play: the full search vs the same search with one technique off, both at ${n(a.nodes)} nodes per move, ${a.pairs} game pairs each:`,
      '',
      '| Technique switched off | Full search W/D/L | Elo gained by the technique (95% CI) |',
      '| --- | --- | --- |',
      ...a.rows.map(
        (r) => `| ${r.technique} | +${r.wins} =${r.draws} −${r.losses} | ${elo(r.elo, r.score)} |`,
      ),
      '',
    );
  }
  if (b) {
    const [s200, s1000] = b.search;
    out.push(
      `Engine speed: perft ${n(b.perft.leavesPerSecond)} leaves/s (depth ${b.perft.depth}, ${n(b.perft.leaves)} leaves); ` +
        `search ${n(s1000!.nodesPerSecond)} nodes/s, average depth ${s200!.avgDepth.toFixed(1)} at 200 ms and ${s1000!.avgDepth.toFixed(1)} at 1 s. ` +
        `Hardware: ${hw(b.hardware)}.`,
    );
  }
  return out.join('\n').trim();
}

function replaceBlock(text: string, name: string, body: string): string {
  const start = `<!-- results:${name}:start -->`;
  const end = `<!-- results:${name}:end -->`;
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i < 0 || j < 0) throw new Error(`README.md is missing the ${start} / ${end} markers`);
  return `${text.slice(0, i + start.length)}\n${body}\n${text.slice(j)}`;
}

const readmePath = root('README.md');
const before = readFileSync(readmePath, 'utf8');
const rr = read<RoundRobin>('results/roundrobin.json');
const bench = read<Bench>('results/bench.json');
const abl = read<Ablation>('results/ablation.json');
let after = before;
after = replaceBlock(
  after,
  'roundrobin',
  rr ? roundRobinTable(rr) : '_Run `pnpm roundrobin` to generate this table._',
);
after = replaceBlock(
  after,
  'search',
  bench || abl ? searchTables(bench, abl) : '_Run `pnpm bench` and `pnpm ablation`._',
);

if (process.argv.includes('--check')) {
  if (after !== before) {
    console.error(
      'README.md results tables are out of date. Run `pnpm readme:tables` and commit the result.',
    );
    process.exit(1);
  }
  console.log('README.md results tables are up to date.');
} else {
  writeFileSync(readmePath, after);
  console.log('README.md tables regenerated from results/.');
}
