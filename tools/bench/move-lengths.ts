/**
 * How long Sungka moves are -> results/move-lengths.json. The web app's animation
 * budget (apps/web/src/board/pacing.ts) is tuned to these numbers, and
 * docs/design/ui-research.md explains why.
 *
 * Self-play with two cheap policies (random, and greedy on immediate store gain),
 * 400 games each, seeded, so the output reproduces exactly.
 * Usage: pnpm move-lengths
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  type GameState,
  type Rng,
  applyMove,
  applyMoveTraced,
  createRng,
  initialState,
  legalMoves,
  storeOf,
} from '@hasik/engine';

const GAMES = 400;
const SEED = 2026_11_26;

type Policy = (s: GameState, rng: Rng) => number;
const policies: Record<string, Policy> = {
  random: (s, rng) => rng.pick(legalMoves(s)),
  greedy: (s, rng) => {
    const store = storeOf(s.toMove);
    let best = -Infinity;
    let choice = legalMoves(s)[0]!;
    for (const m of legalMoves(s)) {
      const r = applyMove(s, m);
      const gain =
        (r.state.slots[store] as number) -
        (s.slots[store] as number) +
        (r.extraTurn ? 0.5 : 0) +
        rng.next() * 0.01;
      if (gain > best) {
        best = gain;
        choice = m;
      }
    }
    return choice;
  },
};

const quantile = (xs: number[], q: number) =>
  [...xs].sort((a, b) => a - b)[Math.floor(q * (xs.length - 1))]!;

const out: Record<string, Record<string, number>> = {};
for (const [name, policy] of Object.entries(policies)) {
  const rng = createRng(SEED);
  const plies: number[] = [];
  const drops: number[] = [];
  let relayMoves = 0;
  let captures = 0;
  let extraTurns = 0;
  for (let g = 0; g < GAMES; g++) {
    let s = initialState();
    let n = 0;
    while (!s.over && n < 2000) {
      const r = applyMoveTraced(s, policy(s, rng));
      drops.push(r.sowSteps);
      if (r.events.some((e) => e.kind === 'pickup' && e.relay)) relayMoves++;
      if (r.captured > 0) captures++;
      if (r.extraTurn) extraTurns++;
      s = r.state;
      n++;
    }
    plies.push(n);
  }
  const pct = (k: number) => Math.round((100 * k) / drops.length);
  out[name] = {
    games: GAMES,
    pliesMedian: quantile(plies, 0.5),
    dropsMedian: quantile(drops, 0.5),
    dropsP90: quantile(drops, 0.9),
    dropsMax: Math.max(...drops),
    relayMovePct: pct(relayMoves),
    capturePct: pct(captures),
    extraTurnPct: pct(extraTurns),
  };
}

console.table(out);
const file = fileURLToPath(new URL('../../results/move-lengths.json', import.meta.url));
mkdirSync(fileURLToPath(new URL('../../results/', import.meta.url)), { recursive: true });
writeFileSync(file, `${JSON.stringify({ seed: SEED, ...out }, null, 2)}\n`);
console.log(`wrote ${file}`);
