// Bundles @hasik/bots (with @hasik/engine inlined) into one self-contained ES module.
// Why: the SPRT strength gate loads two versions of the bots side by side (main vs
// the pull request). A single-file bundle per version avoids any module-resolution
// mix-ups between the two copies.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/hasik-bots.mjs',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  sourcemap: true,
  logLevel: 'info',
});
