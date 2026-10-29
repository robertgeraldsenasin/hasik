/**
 * Hasik arena CLI.
 *
 *   pnpm arena      --a minimax:nodes=20000 --b greedy --pairs 100
 *   pnpm roundrobin --pairs 30
 *   pnpm sprt       --base base.mjs --head head.mjs --mode nonreg
 *
 * Every command is deterministic for a given --seed and opening file, and
 * writes machine-readable results so README tables are generated, never typed.
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseBotSpec } from '@hasik/bots';
import { displayName, hardware } from './cli-shared';
import { DEFAULT_RATING, ratePeriod } from '@hasik/rating';
import { type Pentanomial, type SprtConfig, sprtStatus } from '@hasik/sprt';
import { DEFAULT_MAX_PLIES, type Opening, type PairRecord } from './game';
import { loadOpenings } from './openings';
import { type BotSource, type PairTask, defaultWorkers, runPairs } from './pool';
import { type MatchStats, fmtElo, summarize } from './stats';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_OPENINGS = resolve(ROOT, 'tools/openings/openings.json');

export const DEFAULT_ROSTER = [
  'random',
  'greedy',
  'minimax:nodes=5000',
  'minimax:nodes=50000',
  'mcts:playouts=1000',
  'mcts:playouts=5000',
];

function ensureDir(file: string) {
  mkdirSync(dirname(file), { recursive: true });
}

function tasksFor(
  x: { spec: string; label: string; source: BotSource },
  y: { spec: string; label: string; source: BotSource },
  openings: readonly Opening[],
  pairs: number,
  seed: number,
  maxPlies: number,
  firstPair = 0,
): PairTask[] {
  return Array.from({ length: pairs }, (_, i) => ({
    pair: firstPair + i,
    x,
    y,
    opening: openings[(firstPair + i) % openings.length]!,
    seed,
    maxPlies,
  }));
}

function printStats(s: MatchStats) {
  console.log(
    `${displayName(s.x)} vs ${displayName(s.y)}: +${s.wins} =${s.draws} -${s.losses} ` +
      `(${(s.score * 100).toFixed(1)}%), Elo per pair ${fmtElo(s.eloPairs)}, ` +
      `pentanomial [${s.pentanomial.join(', ')}], avg ${s.avgPlies.toFixed(0)} plies`,
  );
}

// ---------------------------------------------------------------- arena
async function cmdArena(argv: string[]) {
  const { values: v } = parseArgs({
    args: argv,
    options: {
      a: { type: 'string' },
      b: { type: 'string' },
      pairs: { type: 'string', default: '50' },
      seed: { type: 'string', default: '1' },
      workers: { type: 'string' },
      openings: { type: 'string', default: DEFAULT_OPENINGS },
      'max-plies': { type: 'string', default: String(DEFAULT_MAX_PLIES) },
      out: { type: 'string' },
    },
  });
  if (!v.a || !v.b)
    throw new Error('usage: arena --a <spec> --b <spec> [--pairs N] [--out file.jsonl]');
  const openings = loadOpenings(v.openings!);
  const tasks = tasksFor(
    { spec: v.a, label: v.a, source: 'local' },
    { spec: v.b, label: v.b, source: 'local' },
    openings,
    Number(v.pairs),
    Number(v.seed),
    Number(v['max-plies']),
  );
  const t0 = performance.now();
  const results = await runPairs(tasks, {
    workers: v.workers ? Number(v.workers) : defaultWorkers(),
    onResult: (_r, done) => void process.stderr.write(`\r${done}/${tasks.length} pairs`),
  });
  process.stderr.write('\n');
  const stats = summarize(v.a, v.b, results);
  printStats(stats);
  console.log(`${((performance.now() - t0) / 1000).toFixed(1)} s`);
  if (v.out) {
    ensureDir(v.out);
    writeFileSync(v.out, results.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
}

// ---------------------------------------------------------------- round robin
async function cmdRoundRobin(argv: string[]) {
  const { values: v } = parseArgs({
    args: argv,
    options: {
      bots: { type: 'string' },
      pairs: { type: 'string', default: '30' },
      seed: { type: 'string', default: '1' },
      workers: { type: 'string' },
      openings: { type: 'string', default: DEFAULT_OPENINGS },
      out: { type: 'string', default: resolve(ROOT, 'results/roundrobin.json') },
      games: { type: 'string', default: resolve(ROOT, 'results/roundrobin-pairs.jsonl') },
      leaderboard: {
        type: 'string',
        default: resolve(ROOT, 'apps/web/public/data/leaderboard.json'),
      },
    },
  });
  const roster = v.bots
    ? v.bots
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_ROSTER;
  roster.forEach((s) => parseBotSpec(s)); // fail fast on a typo
  const openings = loadOpenings(v.openings!);
  const pairs = Number(v.pairs);
  const seed = Number(v.seed);

  const tasks: PairTask[] = [];
  const pairings: Array<[string, string]> = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const x = roster[i]!;
      const y = roster[j]!;
      pairings.push([x, y]);
      tasks.push(
        ...tasksFor(
          { spec: x, label: x, source: 'local' },
          { spec: y, label: y, source: 'local' },
          openings,
          pairs,
          seed,
          DEFAULT_MAX_PLIES,
          tasks.length,
        ),
      );
    }
  }
  const t0 = performance.now();
  const results = await runPairs(tasks, {
    workers: v.workers ? Number(v.workers) : defaultWorkers(),
    onResult: (_r, done) => void process.stderr.write(`\r${done}/${tasks.length} pairs`),
  });
  process.stderr.write('\n');
  const seconds = (performance.now() - t0) / 1000;

  const stats = pairings.map(([x, y]) =>
    summarize(
      x,
      y,
      results.filter((r) => r.x === x && r.y === y),
    ),
  );
  stats.forEach(printStats);

  // Glicko-2: the whole tournament is one rating period, everyone starting at 1500 +- 350.
  const games = results.flatMap((r) =>
    r.games.map((g) => ({
      a: g.a,
      b: g.b,
      scoreA: g.result === 'A' ? 1 : g.result === 'draw' ? 0.5 : 0,
    })),
  );
  const ratings = ratePeriod(new Map(roster.map((s) => [s, DEFAULT_RATING])), games);

  const bots = roster
    .map((spec) => {
      const mine = stats.filter((s) => s.x === spec || s.y === spec);
      let pts = 0;
      let n = 0;
      for (const s of mine) {
        const asX = s.x === spec;
        pts += asX ? s.wins + s.draws / 2 : s.losses + s.draws / 2;
        n += s.games;
      }
      const vsGreedy = stats.find(
        (s) => (s.x === spec && s.y === 'greedy') || (s.y === spec && s.x === 'greedy'),
      );
      const r = ratings.get(spec)!;
      return {
        spec,
        name: displayName(spec),
        rating: Math.round(r.rating),
        rd: Math.round(r.rd),
        vol: Number(r.vol.toFixed(5)),
        games: n,
        score: n ? Number((pts / n).toFixed(4)) : 0,
        vsGreedy: vsGreedy
          ? {
              score: Number((vsGreedy.x === spec ? vsGreedy.score : 1 - vsGreedy.score).toFixed(4)),
              elo:
                vsGreedy.x === spec
                  ? vsGreedy.eloPairs
                  : {
                      ...vsGreedy.eloPairs,
                      elo: -vsGreedy.eloPairs.elo,
                      lo: -vsGreedy.eloPairs.hi,
                      hi: -vsGreedy.eloPairs.lo,
                    },
            }
          : null,
      };
    })
    .sort((a, b) => b.rating - a.rating);

  const report = {
    kind: 'roundrobin',
    generatedAt: new Date().toISOString(),
    hardware: hardware(),
    params: {
      pairsPerPairing: pairs,
      seed,
      openings: openings.length,
      maxPlies: DEFAULT_MAX_PLIES,
      seconds: Math.round(seconds),
    },
    bots,
    pairings: stats,
  };
  for (const f of [v.out!, v.leaderboard!]) {
    ensureDir(f);
    writeFileSync(f, JSON.stringify(report, null, 2) + '\n');
  }
  ensureDir(v.games!);
  writeFileSync(v.games!, results.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`\nwrote ${v.out} and ${v.leaderboard} (${seconds.toFixed(0)} s)`);
}

// ---------------------------------------------------------------- SPRT
async function cmdSprt(argv: string[]) {
  const { values: v } = parseArgs({
    args: argv,
    options: {
      base: { type: 'string' },
      head: { type: 'string' },
      spec: { type: 'string', default: 'minimax:nodes=10000' },
      mode: { type: 'string', default: 'nonreg' },
      bounds: { type: 'string' },
      alpha: { type: 'string', default: '0.05' },
      beta: { type: 'string', default: '0.05' },
      'max-pairs': { type: 'string', default: '1000' },
      'min-pairs': { type: 'string', default: '30' },
      'max-minutes': { type: 'string', default: '20' },
      batch: { type: 'string', default: '16' },
      seed: { type: 'string', default: '1' },
      workers: { type: 'string' },
      openings: { type: 'string', default: DEFAULT_OPENINGS },
      out: { type: 'string', default: resolve(ROOT, 'results/sprt.jsonl') },
      final: { type: 'string', default: resolve(ROOT, 'results/sprt-final.json') },
      summary: { type: 'string', default: resolve(ROOT, 'sprt-summary.md') },
    },
  });
  if (!v.base || !v.head)
    throw new Error('usage: sprt --base <bundle.mjs> --head <bundle.mjs> [--mode nonreg|gainer]');
  const [elo0, elo1] = (v.bounds ?? (v.mode === 'gainer' ? '0,5' : '-10,0'))
    .split(',')
    .map(Number) as [number, number];
  const cfg: SprtConfig = {
    elo0,
    elo1,
    alpha: Number(v.alpha),
    beta: Number(v.beta),
    minPairs: Number(v['min-pairs']),
  };
  const openings = loadOpenings(v.openings!);
  const maxPairs = Number(v['max-pairs']);
  const deadline = performance.now() + Number(v['max-minutes']) * 60_000;
  const batch = Number(v.batch);
  const head = { spec: v.spec!, label: 'head', source: { bundle: resolve(v.head) } } as const;
  const base = { spec: v.spec!, label: 'base', source: { bundle: resolve(v.base) } } as const;

  ensureDir(v.out!);
  writeFileSync(v.out!, '');
  const penta = [0, 0, 0, 0, 0];
  const all: PairRecord[] = [];
  let status = sprtStatus(penta as unknown as Pentanomial, cfg);
  let reason = 'max-pairs';
  const t0 = performance.now();

  // Batches keep every core busy while still checking the stopping rule often.
  outer: while (all.length < maxPairs) {
    const n = Math.min(batch, maxPairs - all.length);
    const tasks = tasksFor(head, base, openings, n, Number(v.seed), DEFAULT_MAX_PLIES, all.length);
    let stop = false;
    await runPairs(tasks, {
      workers: v.workers ? Number(v.workers) : defaultWorkers(),
      onResult: (r) => {
        all.push(r);
        penta[Math.round(r.pointsX * 2)]!++;
        appendFileSync(v.out!, JSON.stringify(r) + '\n');
        status = sprtStatus(penta as unknown as Pentanomial, cfg);
        process.stderr.write(
          `\rpairs ${all.length}  LLR ${status.llr.toFixed(2)} [${status.bounds.lower.toFixed(2)}, ${status.bounds.upper.toFixed(2)}]  `,
        );
        if (status.decision !== 'continue') {
          reason = 'decision';
          stop = true;
          return false;
        }
        return true;
      },
    });
    if (stop) break outer;
    if (performance.now() > deadline) {
      reason = 'time';
      break;
    }
  }
  process.stderr.write('\n');

  const stats = summarize('head', 'base', all);
  const result = status.decision === 'continue' ? 'inconclusive' : status.decision;
  const final = {
    kind: 'sprt',
    result,
    stoppedBy: reason,
    mode: v.mode,
    spec: v.spec,
    ...cfg,
    llr: Number(status.llr.toFixed(4)),
    lower: Number(status.bounds.lower.toFixed(4)),
    upper: Number(status.bounds.upper.toFixed(4)),
    pairs: stats.pairs,
    wins: stats.wins,
    draws: stats.draws,
    losses: stats.losses,
    pentanomial: stats.pentanomial,
    elo: stats.eloPairs,
    seconds: Math.round((performance.now() - t0) / 1000),
    hardware: hardware(),
  };
  ensureDir(v.final!);
  writeFileSync(v.final!, JSON.stringify(final, null, 2) + '\n');

  const verdict =
    result === 'H1'
      ? cfg.elo1 <= 0
        ? 'PASS: not weaker than main (H1 accepted)'
        : 'PASS: proven stronger than main (H1 accepted)'
      : result === 'H0'
        ? cfg.elo1 <= 0
          ? 'FAIL: weaker than main (H0 accepted)'
          : 'FAIL: no proven gain (H0 accepted)'
        : 'INCONCLUSIVE: budget ran out before a decision; needs the strength:override label';
  const md = [
    `### Strength gate (SPRT): ${verdict}`,
    '',
    `| | |`,
    `|---|---|`,
    `| Mode | \`${v.mode}\`, H0: elo <= ${cfg.elo0}, H1: elo >= ${cfg.elo1}, alpha = beta = ${cfg.alpha} |`,
    `| Engine config | \`${v.spec}\` (fixed node budget, deterministic) |`,
    `| Game pairs | ${stats.pairs} (${stats.games} games, colours swapped per opening) |`,
    `| Head vs base W/D/L | +${stats.wins} =${stats.draws} -${stats.losses} |`,
    `| Pair outcomes (0-2 points) | ${stats.pentanomial.join(' / ')} |`,
    `| LLR | ${status.llr.toFixed(2)} (bounds ${status.bounds.lower.toFixed(2)}, ${status.bounds.upper.toFixed(2)}) |`,
    `| Elo (head - base), 95% CI | ${fmtElo(stats.eloPairs)} |`,
    `| Time | ${final.seconds} s on ${final.hardware.cores} cores |`,
    '',
    'Raw pair results are attached to this workflow run as the `sprt-results` artifact.',
  ].join('\n');
  writeFileSync(v.summary!, md + '\n');
  console.log(md);
}

const [cmd, ...rest] = process.argv.slice(2);
const commands: Record<string, (a: string[]) => Promise<void>> = {
  arena: cmdArena,
  roundrobin: cmdRoundRobin,
  sprt: cmdSprt,
};
const run = cmd ? commands[cmd] : undefined;
if (!run) {
  console.error(`usage: cli.ts <${Object.keys(commands).join('|')}> [options]`);
  process.exit(2);
}
run(rest).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
