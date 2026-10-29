import { cpus, platform, release, totalmem } from 'node:os';
import { parseBotSpec } from '@hasik/bots';

/** Friendly name for tables: "minimax:nodes=50000" -> "Minimax (50k nodes)". */
export function displayName(spec: string): string {
  const { kind, params } = parseBotSpec(spec);
  const name = kind === 'mcts' ? 'MCTS' : kind[0]!.toUpperCase() + kind.slice(1);
  const k = (n: number) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000}k` : String(n));
  const bits: string[] = [];
  if (params.nodes !== undefined) bits.push(`${k(params.nodes)} nodes`);
  if (params.playouts !== undefined) bits.push(`${k(params.playouts)} playouts`);
  if (params.depth !== undefined) bits.push(`depth ${params.depth}`);
  if (params.ms !== undefined) bits.push(`${params.ms} ms`);
  for (const [key, v] of Object.entries(params)) {
    if (!['nodes', 'playouts', 'depth', 'ms'].includes(key)) bits.push(`${key}=${v}`);
  }
  return bits.length ? `${name} (${bits.join(', ')})` : name;
}

export function hardware() {
  const c = cpus();
  return {
    cpu: c[0]?.model.trim() ?? 'unknown',
    cores: c.length,
    ramGb: Math.round(totalmem() / 2 ** 30),
    os: `${platform()} ${release()}`,
    node: process.version,
  };
}
