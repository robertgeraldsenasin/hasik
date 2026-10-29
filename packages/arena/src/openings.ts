/**
 * Opening sampler (A12). Matches start from a fixed, committed set of varied and
 * roughly balanced positions instead of the standard start, so that two
 * deterministic engines don't replay one identical game over and over, and so
 * results can be regenerated exactly.
 */
import { readFileSync } from 'node:fs';
import { MinimaxSearch } from '@hasik/bots';
import { applyMove, createRng, encodePosition, initialState, legalMoves } from '@hasik/engine';
import type { Opening } from './game';

export interface OpeningOptions {
  readonly count: number;
  readonly seed: number;
  /** Keep a position only if a depth-`depth` search scores it within +-maxAbsEval (shells x 100). */
  readonly maxAbsEval: number;
  readonly depth: number;
  readonly minPlies: number;
  readonly maxPlies: number;
  readonly onProgress?: (kept: number, tried: number) => void;
}

export interface OpeningFile {
  readonly generator: string;
  readonly params: Omit<OpeningOptions, 'onProgress'>;
  readonly openings: readonly Opening[];
}

export function generateOpenings(o: OpeningOptions): Opening[] {
  const rng = createRng(o.seed);
  const search = new MinimaxSearch();
  const seen = new Set<string>();
  const out: Opening[] = [];
  let tried = 0;
  while (out.length < o.count) {
    let s = initialState();
    const moves: number[] = [];
    const k = o.minPlies + rng.int(o.maxPlies - o.minPlies + 1);
    for (let i = 0; i < k && !s.over; i++) {
      const m = rng.pick(legalMoves(s));
      moves.push(m);
      s = applyMove(s, m).state;
    }
    const key = encodePosition(s);
    if (s.over || seen.has(key) || legalMoves(s).length < 2) continue;
    seen.add(key);
    tried++;
    const { score } = search.search(s, { depth: o.depth });
    if (Math.abs(score) <= o.maxAbsEval) out.push({ id: out.length, position: key, moves });
    if (tried % 100 === 0) o.onProgress?.(out.length, tried);
  }
  return out;
}

export function loadOpenings(path: string): Opening[] {
  const file = JSON.parse(readFileSync(path, 'utf8')) as OpeningFile;
  if (!Array.isArray(file.openings) || file.openings.length === 0)
    throw new Error(`${path}: no openings`);
  return [...file.openings];
}
