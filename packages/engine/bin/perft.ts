/**
 * Perft CLI: prints leaf counts and speed from the start position.
 * Usage: pnpm --filter @hasik/engine perft [maxDepth]
 */
import { initialState, perft } from '../src/index';

const maxDepth = Number(process.argv[2] ?? 6);
const start = initialState();
console.log('depth  leaves          ms     leaves/s');
for (let d = 1; d <= maxDepth; d++) {
  const t0 = performance.now();
  const n = perft(start, d);
  const ms = performance.now() - t0;
  const rate = ms > 0 ? Math.round((n / ms) * 1000) : 0;
  console.log(
    `${String(d).padEnd(6)} ${String(n).padEnd(15)} ${ms.toFixed(1).padStart(8)} ${String(rate).padStart(12)}`,
  );
}
