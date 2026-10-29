/**
 * Board geometry. See docs/spec/02_GAME_RULES.md for the diagram.
 *
 *         B6  B5  B4  B3  B2  B1  B0           top row: indices 14..8
 *   STORE_B(15)                  STORE_A(7)
 *         A0  A1  A2  A3  A4  A5  A6           bottom row: indices 0..6
 *
 * Sowing runs counter-clockwise from Player A's view: 0 -> 6 -> 7 (A store) -> 8 -> 14 -> 15 (B store) -> 0.
 * Each player skips the opponent's store.
 */

export type Player = 0 | 1;
export const PLAYER_A: Player = 0;
export const PLAYER_B: Player = 1;

export const HOUSES_PER_SIDE = 7;
export const SHELLS_PER_HOUSE = 7;
export const SLOT_COUNT = 16;
export const STORE_A = 7;
export const STORE_B = 15;
export const TOTAL_SHELLS = HOUSES_PER_SIDE * 2 * SHELLS_PER_HOUSE; // 98

export const storeOf = (p: Player): number => (p === 0 ? STORE_A : STORE_B);
export const firstHouseOf = (p: Player): number => (p === 0 ? 0 : 8);
export const isStore = (i: number): boolean => i === STORE_A || i === STORE_B;
export const isHouse = (i: number): boolean => i >= 0 && i < SLOT_COUNT && !isStore(i);
export const ownerOf = (i: number): Player => (i < 8 ? 0 : 1);
export const isOwnHouse = (p: Player, i: number): boolean =>
  p === 0 ? i >= 0 && i <= 6 : i >= 8 && i <= 14;
/** The house directly across the board. Only defined for houses. */
export const opposite = (i: number): number => 14 - i;
export const other = (p: Player): Player => (p === 0 ? 1 : 0);

/**
 * NEXT[p][i] = the slot after i when player p is sowing (skips the opponent's store).
 * Precomputed so the hot sowing loop is a single table lookup.
 */
export const NEXT: readonly [Uint8Array, Uint8Array] = (() => {
  const make = (p: Player): Uint8Array => {
    const t = new Uint8Array(SLOT_COUNT);
    const skip = p === 0 ? STORE_B : STORE_A;
    for (let i = 0; i < SLOT_COUNT; i++) {
      let n = (i + 1) % SLOT_COUNT;
      if (n === skip) n = (n + 1) % SLOT_COUNT;
      t[i] = n;
    }
    return t;
  };
  return [make(0), make(1)];
})();

/** Human-friendly slot names, e.g. "A3", "B0", "storeA". */
export function slotName(i: number): string {
  if (i === STORE_A) return 'storeA';
  if (i === STORE_B) return 'storeB';
  return i < 7 ? `A${i}` : `B${i - 8}`;
}
