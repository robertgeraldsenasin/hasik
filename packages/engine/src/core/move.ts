/**
 * Move generation and application: the heart of the rules engine.
 * Algorithm A1 in docs/spec/04_ALGORITHMS.md.
 */
import { NEXT, type Player, SLOT_COUNT, STORE_A, STORE_B, isOwnHouse, storeOf } from './constants';
import { DEFAULT_RULES, type RuleConfig } from './rules';
import { type GameState, sideHasShells } from './state';
import { Z_HI, Z_LO, Z_SIDE_HI, Z_SIDE_LO, zIndex } from './zobrist';

export interface MoveResult {
  readonly state: GameState;
  /** The same player moves again. */
  readonly extraTurn: boolean;
  /** Shells moved into the store by a capture (0 if none). */
  readonly captured: number;
  /** Single-shell drops made during the move, relays included. */
  readonly sowSteps: number;
  /** Set when the maxSowSteps guard ended the move early. Should never happen in real play. */
  readonly error?: 'MAX_SOW_STEPS';
}

/** Events recorded by applyMoveTraced, so the UI can animate every shell. */
export type SowEvent =
  | {
      readonly kind: 'pickup';
      readonly slot: number;
      readonly count: number;
      readonly relay: boolean;
    }
  | { readonly kind: 'drop'; readonly slot: number }
  | {
      readonly kind: 'capture';
      readonly landing: number;
      readonly opposite: number;
      readonly store: number;
      readonly count: number;
    }
  | { readonly kind: 'extra-turn'; readonly player: Player }
  | { readonly kind: 'end-turn'; readonly next: Player }
  | { readonly kind: 'game-over' };

export class IllegalMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalMoveError';
  }
}

export class SowLimitError extends Error {
  constructor(steps: number) {
    super(`maxSowSteps exceeded after ${steps} drops`);
    this.name = 'SowLimitError';
  }
}

/** Legal moves = the mover's non-empty houses, in index order. Empty when the game is over. */
export function legalMoves(s: GameState): number[] {
  if (s.over) return [];
  const out: number[] = [];
  const start = s.toMove === 0 ? 0 : 8;
  for (let i = start; i < start + 7; i++) if ((s.slots[i] as number) > 0) out.push(i);
  return out;
}

export function isLegalMove(s: GameState, house: number): boolean {
  return !s.over && isOwnHouse(s.toMove, house) && (s.slots[house] as number) > 0;
}

export function isTerminal(s: GameState): boolean {
  return s.over;
}

/** Apply a move. Pure: the input state is not modified. Throws IllegalMoveError on an illegal move. */
export function applyMove(
  s: GameState,
  house: number,
  rules: RuleConfig = DEFAULT_RULES,
): MoveResult {
  return sow(s, house, rules, undefined);
}

/** Same as applyMove, but also returns a step-by-step event list for animation and debugging. */
export function applyMoveTraced(
  s: GameState,
  house: number,
  rules: RuleConfig = DEFAULT_RULES,
): MoveResult & { readonly events: readonly SowEvent[] } {
  const events: SowEvent[] = [];
  const result = sow(s, house, rules, events);
  return { ...result, events };
}

function sow(
  s: GameState,
  house: number,
  rules: RuleConfig,
  events: SowEvent[] | undefined,
): MoveResult {
  if (!isLegalMove(s, house)) {
    throw new IllegalMoveError(
      s.over
        ? 'the game is over'
        : `house ${house} is not a non-empty house of player ${s.toMove === 0 ? 'A' : 'B'}`,
    );
  }
  const p = s.toMove;
  const before = s.slots;
  const slots = before.slice();
  const store = storeOf(p);
  const next = NEXT[p];

  let hand = slots[house] as number;
  slots[house] = 0;
  events?.push({ kind: 'pickup', slot: house, count: hand, relay: false });

  let i = house;
  let steps = 0;
  let captured = 0;
  let extraTurn = false;
  let overflow = false;

  for (;;) {
    while (hand > 0) {
      i = next[i] as number;
      slots[i] = (slots[i] as number) + 1;
      hand--;
      steps++;
      events?.push({ kind: 'drop', slot: i });
      if (steps >= rules.maxSowSteps && hand > 0) {
        if (rules.throwOnSowLimit) throw new SowLimitError(steps);
        // Production fallback: keep every shell on the board (conservation), end the turn.
        slots[i] = (slots[i] as number) + hand;
        hand = 0;
        overflow = true;
      }
    }
    if (overflow) break;

    // 1. Last shell in own store: extra turn. (The opponent's store is never visited.)
    if (i === store) {
      extraTurn = rules.extraTurnOnStore;
      break;
    }
    const landed = slots[i] as number;
    // 2. Last shell in a house that was non-empty: relay sowing.
    if (landed > 1 && rules.relaySowing) {
      hand = landed;
      slots[i] = 0;
      events?.push({ kind: 'pickup', slot: i, count: hand, relay: true });
      continue;
    }
    // 3. Last shell in an empty house on your own side: capture.
    if (landed === 1 && isOwnHouse(p, i)) {
      const o = 14 - i;
      const across = slots[o] as number;
      if (across > 0 || !rules.captureRequiresNonEmptyOpposite) {
        const gain = across + (rules.captureIncludesLandingShell ? 1 : 0);
        if (gain > 0) {
          slots[store] = (slots[store] as number) + gain;
          slots[o] = 0;
          if (rules.captureIncludesLandingShell) slots[i] = 0;
          captured = gain;
          events?.push({ kind: 'capture', landing: i, opposite: o, store, count: gain });
        }
      }
    }
    // 4. Anything else (empty opponent house, or non-empty with relay off): turn ends.
    break;
  }

  const toMove: Player = extraTurn ? p : p === 0 ? 1 : 0;
  const over = !sideHasShells(slots, toMove);

  // Incremental Zobrist update: XOR out the old count and XOR in the new one for
  // every slot that changed, then flip the side key if the mover changed.
  let hi = s.hashHi;
  let lo = s.hashLo;
  for (let j = 0; j < SLOT_COUNT; j++) {
    const a = before[j] as number;
    const b = slots[j] as number;
    if (a !== b) {
      const za = zIndex(j, a);
      const zb = zIndex(j, b);
      hi ^= (Z_HI[za] as number) ^ (Z_HI[zb] as number);
      lo ^= (Z_LO[za] as number) ^ (Z_LO[zb] as number);
    }
  }
  if (toMove !== p) {
    hi ^= Z_SIDE_HI;
    lo ^= Z_SIDE_LO;
  }

  if (events) {
    if (extraTurn && !over) events.push({ kind: 'extra-turn', player: p });
    else if (!over) events.push({ kind: 'end-turn', next: toMove });
    if (over) events.push({ kind: 'game-over' });
  }

  const state: GameState = {
    slots,
    toMove,
    ply: s.ply + 1,
    hashHi: hi >>> 0,
    hashLo: lo >>> 0,
    over,
  };
  return overflow
    ? { state, extraTurn, captured, sowSteps: steps, error: 'MAX_SOW_STEPS' }
    : { state, extraTurn, captured, sowSteps: steps };
}

export interface FinalScore {
  readonly a: number;
  readonly b: number;
}

/**
 * Final store totals including shells left in houses, per rules.remainingShellsGoTo.
 * Can be called on any state; for a non-terminal state it reports "if the game stopped now".
 */
export function finalScore(s: GameState, rules: RuleConfig = DEFAULT_RULES): FinalScore {
  const sl = s.slots;
  let houseA = 0;
  let houseB = 0;
  for (let i = 0; i < 7; i++) houseA += sl[i] as number;
  for (let i = 8; i < 15; i++) houseB += sl[i] as number;
  const a = sl[STORE_A] as number;
  const b = sl[STORE_B] as number;
  if (rules.remainingShellsGoTo === 'capturer') {
    // The side that still has shells takes everything left. When only one side
    // has shells (always true at game end) this equals 'owner'. See ADR-0001.
    if (houseA > 0 && houseB === 0) return { a: a + houseA, b };
    if (houseB > 0 && houseA === 0) return { a, b: b + houseB };
  }
  return { a: a + houseA, b: b + houseB };
}

export type GameResult = 'A' | 'B' | 'draw';

export function gameResult(s: GameState, rules: RuleConfig = DEFAULT_RULES): GameResult {
  const { a, b } = finalScore(s, rules);
  return a > b ? 'A' : b > a ? 'B' : 'draw';
}

/** Sum of all slots. Always 98; property tests assert it after every move. */
export function totalShells(s: GameState): number {
  let t = 0;
  for (let i = 0; i < SLOT_COUNT; i++) t += s.slots[i] as number;
  return t;
}

export { STORE_A, STORE_B };
