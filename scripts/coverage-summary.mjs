#!/usr/bin/env node
// Prints a Markdown table of line coverage per package from coverage-summary.json files.
import { existsSync, readFileSync } from 'node:fs';

const pkgs = ['engine', 'bots', 'rating', 'sprt', 'arena', 'protocol'];
console.log('### Coverage\n\n| Package | Lines | Branches | Functions |\n|---|---|---|---|');
for (const p of pkgs) {
  const f = `packages/${p}/coverage/coverage-summary.json`;
  if (!existsSync(f)) continue;
  const t = JSON.parse(readFileSync(f, 'utf8')).total;
  console.log(`| ${p} | ${t.lines.pct}% | ${t.branches.pct}% | ${t.functions.pct}% |`);
}
