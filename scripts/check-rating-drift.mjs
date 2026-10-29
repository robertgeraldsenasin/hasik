#!/usr/bin/env node
// Compares two round-robin result files; flags any bot whose rating fell by more than 2 RD.
// Usage: node scripts/check-rating-drift.mjs <baseline.json> <new.json>
import { readFileSync } from 'node:fs';

const [basePath, newPath] = process.argv.slice(2);
const base = JSON.parse(readFileSync(basePath, 'utf8'));
const next = JSON.parse(readFileSync(newPath, 'utf8'));
const rows = [];
let regression = false;
for (const b of next.bots) {
  const old = base.bots.find((x) => x.spec === b.spec);
  if (!old) {
    rows.push(`| ${b.name} | new | ${b.rating} ± ${2 * b.rd} | – |`);
    continue;
  }
  const drop = old.rating - b.rating;
  const flag = drop > 2 * old.rd;
  regression ||= flag;
  rows.push(
    `| ${b.name} | ${old.rating} ± ${2 * old.rd} | ${b.rating} ± ${2 * b.rd} | ${flag ? '**REGRESSION**' : 'ok'} |`,
  );
}
console.log(
  `### Nightly rating drift\n\n| Bot | Committed | Tonight | Status |\n|---|---|---|---|\n${rows.join('\n')}\n`,
);
console.log(
  regression
    ? 'At least one bot dropped by more than 2 RD: REGRESSION.'
    : 'No regression detected.',
);
