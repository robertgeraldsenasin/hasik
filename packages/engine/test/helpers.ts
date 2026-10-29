import { fromSlots, type GameState, type Player } from '../src/index';

/**
 * Build a position from the two rows. `a` is A0..A6, `b` is B0..B6 (slots 8..14).
 * Any shells needed to reach 98 go into `remainderTo` (default: storeA) so tests can
 * describe only the houses that matter.
 */
export function pos(
  a: number[],
  b: number[],
  toMove: Player,
  stores: { a?: number; b?: number } = {},
  remainderTo: 'a' | 'b' = 'a',
): GameState {
  if (a.length !== 7 || b.length !== 7) throw new Error('rows need 7 houses');
  const slots = [...a, stores.a ?? 0, ...b, stores.b ?? 0];
  const used = slots.reduce((x, y) => x + y, 0);
  const rest = 98 - used;
  if (rest < 0) throw new Error(`too many shells: ${used}`);
  slots[remainderTo === 'a' ? 7 : 15] += rest;
  return fromSlots(slots, toMove);
}

export const row = (s: GameState, p: Player): number[] =>
  Array.from(s.slots.slice(p === 0 ? 0 : 8, p === 0 ? 7 : 15));
