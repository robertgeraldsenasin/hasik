/**
 * Static evaluation (algorithm A5). Scores a non-terminal position from the
 * side-to-move's point of view, in "shells x 100" units.
 *
 * The two tactical terms (extra-turn moves and best capture) use a cheap
 * direct-landing approximation instead of simulating every move: a house with
 * exactly enough shells to reach the store is an extra turn, and a sow that ends
 * on an empty own house before reaching the store is a capture. Relay chains are
 * ignored here; the search sees them. That keeps evaluate() allocation-free.
 */
import {
  DEFAULT_RULES,
  type GameState,
  type Player,
  type RuleConfig,
  finalScore,
} from '@hasik/engine';

export interface EvalWeights {
  readonly store: number;
  readonly side: number;
  readonly mobility: number;
  readonly extra: number;
  readonly capture: number;
}

export const DEFAULT_WEIGHTS: EvalWeights = Object.freeze({
  store: 100,
  side: 10,
  mobility: 5,
  extra: 30,
  capture: 20,
});

/** Terminal scores dwarf any heuristic so a won ending always beats a "good" position. */
export const WIN_SCORE = 100_000;

export function terminalScore(s: GameState, rules: RuleConfig = DEFAULT_RULES): number {
  const { a, b } = finalScore(s, rules);
  const diff = s.toMove === 0 ? a - b : b - a;
  if (diff > 0) return WIN_SCORE + diff;
  if (diff < 0) return -WIN_SCORE + diff;
  return 0;
}

interface SideFeatures {
  store: number;
  side: number;
  mobility: number;
  extra: number;
  capture: number;
}

function features(sl: Uint8Array, p: Player, rules: RuleConfig): SideFeatures {
  const base = p === 0 ? 0 : 8;
  const storeIdx = base + 7;
  const f: SideFeatures = {
    store: sl[storeIdx] as number,
    side: 0,
    mobility: 0,
    extra: 0,
    capture: 0,
  };
  for (let k = 0; k < 7; k++) {
    const c = sl[base + k] as number;
    if (c === 0) continue;
    f.side += c;
    f.mobility++;
    const dist = 7 - k; // drops needed to reach own store
    if (c === dist) {
      if (rules.extraTurnOnStore) f.extra++;
    } else if (c < dist) {
      const land = base + k + c;
      if (sl[land] === 0) {
        const across = sl[14 - land] as number;
        if (across > 0 || !rules.captureRequiresNonEmptyOpposite) {
          const gain = across + (rules.captureIncludesLandingShell ? 1 : 0);
          if (gain > f.capture) f.capture = gain;
        }
      }
    }
  }
  return f;
}

export function evaluate(
  s: GameState,
  w: EvalWeights = DEFAULT_WEIGHTS,
  rules: RuleConfig = DEFAULT_RULES,
): number {
  const me = features(s.slots, s.toMove, rules);
  const op = features(s.slots, s.toMove === 0 ? 1 : 0, rules);
  return (
    w.store * (me.store - op.store) +
    w.side * (me.side - op.side) +
    w.mobility * (me.mobility - op.mobility) +
    w.extra * (me.extra - op.extra) +
    w.capture * (me.capture - op.capture)
  );
}
