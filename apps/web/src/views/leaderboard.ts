/**
 * Leaderboard: reads the static JSON written by `pnpm roundrobin`
 * (milestone 1). Milestone 2 replaces this file fetch with a live API.
 */
interface Elo {
  elo: number | null;
  lo: number | null;
  hi: number | null;
}
interface BotRow {
  spec: string;
  name: string;
  rating: number;
  rd: number;
  games: number;
  score: number;
  vsGreedy: { score: number; elo: Elo } | null;
}
interface Pairing {
  x: string;
  y: string;
  pairs: number;
  wins: number;
  draws: number;
  losses: number;
  score: number;
  eloPairs: Elo;
}
export interface Leaderboard {
  generatedAt: string;
  hardware: { cpu: string; cores: number; ramGb: number; os: string; node: string };
  params: { pairsPerPairing: number; openings: number; seconds: number };
  bots: BotRow[];
  pairings: Pairing[];
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
// JSON has no Infinity: infinite Elo values arrive as null, so the score decides the sign.
const fmt = (v: number | null, ifNull: string) =>
  v === null || !Number.isFinite(v) ? ifNull : `${v > 0 ? '+' : ''}${Math.round(v)}`;
export const fmtElo = (e: Elo, score: number) =>
  e.elo === null || !Number.isFinite(e.elo)
    ? score >= 0.5
      ? 'won every game'
      : 'lost every game'
    : `${fmt(e.elo, '')} (${fmt(e.lo, '−∞')} to ${fmt(e.hi, '+∞')})`;

export function renderLeaderboard(data: Leaderboard): string {
  const name = (spec: string) => data.bots.find((b) => b.spec === spec)?.name ?? spec;
  const rows = data.bots
    .map(
      (b, i) => `<tr>
        <td>${i + 1}</td><td>${esc(b.name)}</td>
        <td class="num">${b.rating} <span class="muted">± ${2 * b.rd}</span></td>
        <td class="num">${b.games}</td>
        <td class="num">${(b.score * 100).toFixed(1)}%</td>
        <td class="num">${b.vsGreedy ? `${(b.vsGreedy.score * 100).toFixed(1)}%` : '–'}</td>
      </tr>`,
    )
    .join('');
  const pairs = data.pairings
    .map(
      (p) => `<tr><td>${esc(name(p.x))}</td><td>${esc(name(p.y))}</td>
        <td class="num">+${p.wins} =${p.draws} −${p.losses}</td>
        <td class="num">${(p.score * 100).toFixed(1)}%</td>
        <td class="num">${fmtElo(p.eloPairs, p.score)}</td></tr>`,
    )
    .join('');
  const hw = data.hardware;
  return `
    <section class="prose">
      <h1>Leaderboard</h1>
      <p>Every bot played every other bot in a round robin: ${data.params.pairsPerPairing} game pairs per pairing
      (each opening played twice with colours swapped) from ${data.params.openings} balanced openings.
      Ratings are Glicko-2 with ± 2 RD, a 95% band.</p>
      <div class="table-wrap"><table data-testid="leaderboard">
        <thead><tr><th>#</th><th>Bot</th><th>Glicko-2</th><th>Games</th><th>Score</th><th>vs Greedy</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <h2>Head to head</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Bot</th><th>Opponent</th><th>W/D/L</th><th>Score</th><th>Elo (95% CI)</th></tr></thead>
        <tbody>${pairs}</tbody>
      </table></div>
      <p class="muted">Generated ${esc(new Date(data.generatedAt).toUTCString())} on ${esc(hw.cpu)} (${hw.cores} cores,
      ${hw.ramGb} GB, ${esc(hw.os)}, Node ${esc(hw.node)}) in ${data.params.seconds} s. Bots use fixed node or playout
      budgets, so these results reproduce exactly on any machine with <code>pnpm roundrobin</code>.</p>
    </section>`;
}

export async function mountLeaderboard(root: HTMLElement): Promise<void> {
  root.innerHTML = '<section class="prose"><h1>Leaderboard</h1><p>Loading…</p></section>';
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/leaderboard.json`, {
      cache: 'no-cache',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    root.innerHTML = renderLeaderboard((await res.json()) as Leaderboard);
  } catch (e) {
    root.innerHTML = `<section class="prose"><h1>Leaderboard</h1>
      <p>No leaderboard data yet (${esc((e as Error).message)}). Run <code>pnpm roundrobin</code> to generate it.</p></section>`;
  }
}
