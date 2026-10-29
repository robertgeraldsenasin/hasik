/**
 * Regenerates tools/openings/openings.json. Deterministic: the same parameters
 * always produce the same file, so it only needs re-running if the rules change.
 * Usage: pnpm openings
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateOpenings, type OpeningFile } from '@hasik/arena';

const params = { count: 200, seed: 2026, maxAbsEval: 500, depth: 4, minPlies: 2, maxPlies: 6 };
const t0 = performance.now();
const openings = generateOpenings({
  ...params,
  onProgress: (kept, tried) =>
    process.stderr.write(`\rkept ${kept}/${params.count} (tried ${tried})`),
});
const file: OpeningFile = { generator: 'tools/openings/generate.ts', params, openings };
const out = fileURLToPath(new URL('./openings.json', import.meta.url));
writeFileSync(out, JSON.stringify(file, null, 1) + '\n');
console.error(
  `\nwrote ${openings.length} openings to ${out} in ${((performance.now() - t0) / 1000).toFixed(0)} s`,
);
