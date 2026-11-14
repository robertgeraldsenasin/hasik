/**
 * Search correctness. The key invariant (07_CONSTRAINTS C3): alpha-beta must
 * return the same value as plain minimax. The reference here is a classic
 * max/min minimax from Player A's fixed point of view, with no negation at all,
 * so a negamax sign bug around extra turns cannot hide in both implementations.
 */
import { describe, expect, it } from 'vitest';
import {
  type GameState,
  applyMove,
  createRng,
  fromSlots,
  initialState,
  legalMoves,
} from '@hasik/engine';
import { MinimaxSearch, evaluate, terminalScore } from '../src/index';

function randomPosition(seed: number, plies: number): GameState {
  const rng = createRng(seed);
  let s = initialState();
  for (let i = 0; i < plies && !s.over; i++) s = applyMove(s, rng.pick(legalMoves(s))).state;
  return s;
}

/** Value from A's point of view: A maximises, B minimises. No extensions. */
function classicMinimax(s: GameState, depth: number): number {
  const fromA = (v: number, st: GameState) => (st.toMove === 0 ? v : -v);
  if (s.over) return fromA(terminalScore(s), s);
  if (depth === 0) return fromA(evaluate(s), s);
  const vals = legalMoves(s).map((m) => classicMinimax(applyMove(s, m).state, depth - 1));
  return s.toMove === 0 ? Math.max(...vals) : Math.min(...vals);
}

const positions = Array.from({ length: 40 }, (_, i) =>
  randomPosition(1000 + i, 4 + (i % 25)),
).filter((s) => !s.over && legalMoves(s).length > 1);

describe('alpha-beta equals minimax', () => {
  it('matches a classic max/min minimax at depths 1-4 on random positions (no extensions, no TT)', () => {
    for (const s of positions) {
      for (const depth of [1, 2, 3, 4]) {
        const expected = classicMinimax(s, depth);
        const ab = new MinimaxSearch({ tt: false, extraTurnExtension: false }).search(s, { depth });
        const got = s.toMove === 0 ? ab.score : -ab.score;
        expect(got).toBe(expected);
      }
    }
  });

  it('pruning, ordering and the TT do not change the root value (extensions on)', () => {
    // Plain minimax with extra-turn extensions grows exponentially, so this compares at
    // depth 3 with at most 2 extensions in a row: still exercises the extension logic, and
    // runs in about a second instead of ~30 s under coverage on a CI runner.
    const ext = { maxExtensions: 2 };
    for (const s of positions.slice(0, 15)) {
      const plain = new MinimaxSearch({
        ...ext,
        alphaBeta: false,
        ordering: false,
        tt: false,
      }).search(s, { depth: 3 });
      for (const cfg of [
        { ordering: false, tt: false },
        { ordering: true, tt: false },
        { ordering: true, tt: true },
      ]) {
        const r = new MinimaxSearch({ ...ext, ...cfg }).search(s, { depth: 3 });
        expect(r.score).toBe(plain.score);
      }
    }
  });

  it('alpha-beta searches far fewer nodes than plain minimax', () => {
    const s = positions[0]!;
    const plain = new MinimaxSearch({
      alphaBeta: false,
      ordering: false,
      tt: false,
      extraTurnExtension: false,
    }).search(s, { depth: 4 });
    const full = new MinimaxSearch({ extraTurnExtension: false }).search(s, { depth: 4 });
    expect(full.nodes).toBeLessThan(plain.nodes / 3);
  });
});

describe('search behaviour', () => {
  it('is deterministic: same position and limits give the same answer', () => {
    const s = positions[3]!;
    const a = new MinimaxSearch().search(s, { nodes: 30_000 });
    const b = new MinimaxSearch().search(s, { nodes: 30_000 });
    expect(b).toEqual(a);
    // ...even when the same instance searches twice (TT generations reset per move).
    const engine = new MinimaxSearch();
    engine.search(positions[4]!, { nodes: 30_000 });
    expect(engine.search(s, { nodes: 30_000 })).toEqual(a);
  });

  it('respects node limits and always returns a legal move', () => {
    for (const s of positions.slice(0, 10)) {
      const r = new MinimaxSearch().search(s, { nodes: 2_000 });
      expect(legalMoves(s)).toContain(r.move);
      expect(r.nodes).toBeLessThanOrEqual(2_000 + 7); // depth 1 is always allowed to finish
      expect(r.pv[0]).toBe(r.move);
    }
  });

  it('respects an injected clock', () => {
    let t = 0;
    const now = () => (t += 0.01); // every call advances 10 µs of fake time
    const r = new MinimaxSearch().search(initialState(), { timeMs: 5, now });
    expect(r.depth).toBeGreaterThanOrEqual(1);
    expect(legalMoves(initialState())).toContain(r.move);
  });

  it('returns a forced move immediately', () => {
    const s = fromSlots([0, 0, 0, 0, 0, 0, 3, 40, 1, 1, 1, 1, 1, 1, 1, 48], 0);
    const r = new MinimaxSearch().search(s, { depth: 6 });
    expect(r).toMatchObject({ move: 6, nodes: 0, depth: 0 });
  });

  it('chains extra turns before cashing a capture (never assumes turns alternate)', () => {
    // A1 (1 shell) can capture B4's 20 at once, but A5 (2 shells) ends in the store first
    // for an extra turn, then A6 does the same, and only then A1 captures. Best line: 5, 6, 1.
    const s = fromSlots([0, 1, 0, 0, 0, 2, 0, 30, 1, 0, 0, 0, 20, 0, 0, 44], 0);
    const r = new MinimaxSearch().search(s, { depth: 4 });
    expect(r.move).toBe(5);
    expect(r.pv.slice(0, 3)).toEqual([5, 6, 1]);
  });

  it('stops early on a fully resolved win', () => {
    const s = fromSlots([0, 0, 0, 0, 0, 1, 1, 59, 1, 0, 0, 0, 0, 0, 0, 36], 0);
    const r = new MinimaxSearch().search(s, { depth: 30 });
    expect(Math.abs(r.score)).toBeGreaterThan(90_000);
    expect(r.depth).toBeLessThan(30);
  });

  it('throws when asked to move in a finished game', () => {
    const over = fromSlots([0, 0, 0, 0, 0, 0, 0, 49, 0, 0, 0, 0, 0, 0, 0, 49], 0);
    expect(() => new MinimaxSearch().search(over, { depth: 2 })).toThrow();
  });
});

describe('evaluation', () => {
  const mirror = (s: GameState): GameState => {
    const a = Array.from(s.slots);
    return fromSlots([...a.slice(8, 16), ...a.slice(0, 8)], s.toMove === 0 ? 1 : 0);
  };

  it('is colour-symmetric: a mirrored position scores the same for the mover', () => {
    for (const s of positions) expect(evaluate(mirror(s))).toBe(evaluate(s));
  });

  it('terminal scores dominate and carry the final margin', () => {
    const win = fromSlots([0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 38], 0);
    expect(terminalScore(win)).toBe(100_022);
    const loss = fromSlots([0, 0, 0, 0, 0, 0, 0, 38, 0, 0, 0, 0, 0, 0, 0, 60], 0);
    expect(terminalScore(loss)).toBe(-100_022);
  });
});
