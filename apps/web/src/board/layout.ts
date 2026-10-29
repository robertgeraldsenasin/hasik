/**
 * Board geometry, kept free of any DOM code so it can be unit-tested.
 *
 * The human always sees their own row at the bottom, sowing left to right into
 * the store on the right, which is how a player sitting at a real board sees it.
 * When the human plays B, the board is simply flipped.
 */
import { STORE_A, STORE_B } from '@hasik/engine';

export interface SlotGeometry {
  readonly x: number;
  readonly y: number;
  /** Radius (houses) or half-width (stores). */
  readonly r: number;
  /** Stores are drawn as tall ellipses: half-height. */
  readonly ry: number;
  readonly kind: 'house' | 'store';
}

export interface BoardLayout {
  readonly width: number;
  readonly height: number;
  readonly slots: readonly SlotGeometry[];
  readonly flip: boolean;
}

export const ASPECT = 0.38;

export function computeLayout(width: number, flip: boolean): BoardLayout {
  const height = Math.round(width * ASPECT);
  const pad = width * 0.025;
  const storeW = width * 0.1;
  const left = pad + storeW;
  const right = width - pad - storeW;
  const colW = (right - left) / 7;
  const r = Math.min(colW * 0.42, height * 0.17);
  const topY = height * 0.31;
  const botY = height * 0.69;
  const storeRx = storeW * 0.62;
  const storeRy = height * 0.33;
  const colX = (k: number) => left + (k + 0.5) * colW;

  const bottomBase = flip ? 8 : 0;
  const topBase = flip ? 0 : 8;
  const bottomStore = flip ? STORE_B : STORE_A;
  const topStore = flip ? STORE_A : STORE_B;

  const slots: SlotGeometry[] = new Array(16);
  for (let k = 0; k < 7; k++) {
    slots[bottomBase + k] = { x: colX(k), y: botY, r, ry: r, kind: 'house' };
    slots[topBase + k] = { x: colX(6 - k), y: topY, r, ry: r, kind: 'house' };
  }
  slots[bottomStore] = {
    x: width - pad - storeW / 2,
    y: height / 2,
    r: storeRx,
    ry: storeRy,
    kind: 'store',
  };
  slots[topStore] = { x: pad + storeW / 2, y: height / 2, r: storeRx, ry: storeRy, kind: 'store' };
  return { width, height, slots, flip };
}

/** Which slot (if any) is under a point. */
export function hitTest(layout: BoardLayout, x: number, y: number): number | null {
  for (let i = 0; i < 16; i++) {
    const g = layout.slots[i]!;
    const dx = (x - g.x) / g.r;
    const dy = (y - g.y) / g.ry;
    if (dx * dx + dy * dy <= 1) return i;
  }
  return null;
}

/** Deterministic pseudo-random offsets so shells sit in the same place every frame. */
export function shellOffsets(
  slot: number,
  count: number,
  radius: number,
): Array<{ dx: number; dy: number; rot: number }> {
  const out: Array<{ dx: number; dy: number; rot: number }> = [];
  let h = (slot + 1) * 2654435761;
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h ^= h >>> 13;
    return ((h >>> 0) % 10000) / 10000;
  };
  for (let i = 0; i < count; i++) {
    // Golden-angle spiral keeps shells spread out instead of clumping.
    const t = Math.sqrt((i + 0.5) / Math.max(count, 1));
    const a = i * 2.39996 + rnd() * 0.6;
    out.push({ dx: Math.cos(a) * t * radius, dy: Math.sin(a) * t * radius, rot: rnd() * Math.PI });
  }
  return out;
}
