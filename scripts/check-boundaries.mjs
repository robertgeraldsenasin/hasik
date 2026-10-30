#!/usr/bin/env node
/**
 * Enforces the module boundaries in docs/guide/03-architecture-tour.md:
 *
 *   engine    imports nothing from the repo and has no runtime dependencies
 *   bots      -> engine
 *   rating    (nothing)          sprt -> (nothing)
 *   protocol  (nothing in the repo; zod only)
 *   arena     -> engine, bots, rating, sprt
 *   web       -> engine, bots, protocol
 *
 * Checks both package.json dependencies and the actual import statements, so a
 * forbidden import fails CI even if someone forgets to declare it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: on Windows the pathname is "/C:/...", which breaks path.resolve.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = {
  'packages/engine': { repo: [], external: [] },
  'packages/bots': { repo: ['engine'], external: [] },
  'packages/rating': { repo: [], external: [] },
  'packages/sprt': { repo: [], external: [] },
  'packages/protocol': { repo: [], external: ['zod'] },
  'packages/arena': { repo: ['engine', 'bots', 'rating', 'sprt'], external: ['tsx'] },
  'apps/web': { repo: ['engine', 'bots', 'protocol'], external: [] },
};

const errors = [];
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|mjs|js)$/.test(f) ? [p] : [];
  });

for (const [pkgDir, rule] of Object.entries(ALLOWED)) {
  const abs = join(ROOT, pkgDir);
  const pkg = JSON.parse(readFileSync(join(abs, 'package.json'), 'utf8'));
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (dep.startsWith('@hasik/')) {
      if (!rule.repo.includes(dep.slice(7)))
        errors.push(`${pkgDir}/package.json depends on ${dep}`);
    } else if (!rule.external.includes(dep)) {
      errors.push(`${pkgDir}/package.json has a runtime dependency "${dep}" that is not allowed`);
    }
  }
  for (const file of walk(join(abs, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(
      /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g,
    )) {
      const spec = m[1] ?? m[2];
      const rel = relative(ROOT, file);
      if (spec.startsWith('@hasik/') && !rule.repo.includes(spec.slice(7).split('/')[0])) {
        errors.push(`${rel} imports ${spec}`);
      }
      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec);
        if (!target.startsWith(abs))
          errors.push(`${rel} reaches outside its package with "${spec}"`);
      }
    }
  }
}

if (errors.length) {
  console.error(
    `Dependency boundary violations (${errors.length}):\n` +
      errors.map((e) => `  - ${e}`).join('\n'),
  );
  process.exit(1);
}
console.log(`Dependency boundaries OK (${Object.keys(ALLOWED).length} packages checked).`);
