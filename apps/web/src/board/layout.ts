/**
 * Board geometry, kept free of any DOM code so it can be unit-tested.
 *
 * The human always sees their own row nearest to them, sowing towards their own
 * store, which is how a player sitting at a real board sees it. When the human
 * plays B the board is simply mirrored.
 *
 * Two orientations:
 * - landscape (desktops, tablets): your row along the bottom, sowing left to right
 *   into your store on the right, the opponent's row along the top;
 * - portrait (phones held upright): the same board turned a quarter turn clockwise,
 *   so your row runs down the left column into your store at the bottom and the
 *   opponent's row runs up the right column into their store at the top. Sowing is
 *   still counter-clockwise, and the houses are big enough to tap.
 */
import { STORE_A, STORE_B } from '@hasik/engine';

export interface SlotGeometry {
  readonly x: number;
  readonly y: number;
  /** Radius (houses) or horizontal half-axis (stores). */
  readonly r: number;
  /** Vertical half-axis. Equal to r for houses. */
  readonly ry: number;
  readonly kind: 'house' | 'store';
}

export type Orientation = 'landscape' | 'portrait';

export interface BoardLayout {
  readonly width: number;
  readonly height: number;
  readonly slots: readonly SlotGeometry[];
  readonly flip: boolean;
  readonly orientation: Orientation;
}

/** Height as a fraction of width in landscape. */
export const ASPECT = 0.4;
/** Height as a multiple of width in portrait, before it is fitted to the screen. */
export const PORTRAIT_ASPECT = 1.75;

export interface LayoutOptions {
  readonly orientation?: Orientation;
  /** Portrait only: the tallest the board may be (defaults to width × PORTRAIT_ASPECT). */
  readonly maxHeight?: number;
}

export function computeLayout(width: number, flip: boolean, opts: LayoutOptions = {}): BoardLayout {
  return opts.orientation === 'portrait'
    ? portrait(width, flip, opts.maxHeight)
    : landscape(width, flip);
}

/** Which slots sit where: the human's houses and store, then the opponent's. */
function sides(flip: boolean) {
  return {
    nearBase: flip ? 8 : 0,
    farBase: flip ? 0 : 8,
    nearStore: flip ? STORE_B : STORE_A,
    farStore: flip ? STORE_A : STORE_B,
  };
}

function landscape(width: number, flip: boolean): BoardLayout {
  const height = Math.round(width * ASPECT);
  const pad = width * 0.03;
  const storeW = width * 0.1;
  const left = pad + storeW;
  const right = width - pad - storeW;
  const colW = (right - left) / 7;
  const r = Math.min(colW * 0.4, height * 0.165);
  const topY = height * 0.3;
  const botY = height * 0.7;
  const colX = (k: number) => left + (k + 0.5) * colW;
  const s = sides(flip);

  const slots: SlotGeometry[] = new Array(16);
  for (let k = 0; k < 7; k++) {
    slots[s.nearBase + k] = { x: colX(k), y: botY, r, ry: r, kind: 'house' };
    slots[s.farBase + k] = { x: colX(6 - k), y: topY, r, ry: r, kind: 'house' };
  }
  const store = { r: storeW * 0.58, ry: height * 0.32, kind: 'store' as const };
  slots[s.nearStore] = { ...store, x: width - pad - storeW / 2, y: height / 2 };
  slots[s.farStore] = { ...store, x: pad + storeW / 2, y: height / 2 };
  return { width, height, slots, flip, orientation: 'landscape' };
}

function portrait(width: number, flip: boolean, maxHeight?: number): BoardLayout {
  const height = Math.round(
    Math.max(width * 1.15, Math.min(width * PORTRAIT_ASPECT, maxHeight ?? Infinity)),
  );
  const pad = height * 0.025;
  const storeH = height * 0.105;
  const top = pad + storeH;
  const bottom = height - pad - storeH;
  const rowH = (bottom - top) / 7;
  const r = Math.min(width * 0.15, rowH * 0.4);
  const nearX = width * 0.34;
  const farX = width * 0.66;
  const rowY = (k: number) => top + (k + 0.5) * rowH;
  const s = sides(flip);

  const slots: SlotGeometry[] = new Array(16);
  for (let k = 0; k < 7; k++) {
    // Your houses run down the left column; the opponent's run up the right one,
    // so opposite houses share a row.
    slots[s.nearBase + k] = { x: nearX, y: rowY(k), r, ry: r, kind: 'house' };
    slots[s.farBase + k] = { x: farX, y: rowY(6 - k), r, ry: r, kind: 'house' };
  }
  const store = { r: width * 0.3, ry: storeH * 0.4, kind: 'store' as const };
  slots[s.nearStore] = { ...store, x: width / 2, y: height - pad - storeH / 2 };
  slots[s.farStore] = { ...store, x: width / 2, y: pad + storeH / 2 };
  return { width, height, slots, flip, orientation: 'portrait' };
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

/**
 * Deterministic pseudo-random offsets so shells sit in the same place every frame.
 * Offsets are for a circle of the given radius; stores stretch them to their ellipse.
 *
 * With a `capacity`, shell i always gets the same spot however many shells the pit
 * holds, so a shell landing in a pit doesn't make the others jump. Past capacity,
 * shells pile on top of the first layer.
 */
export function shellOffsets(
  slot: number,
  count: number,
  radius: number,
  capacity = count,
): Array<{ dx: number; dy: number; rot: number }> {
  const out: Array<{ dx: number; dy: number; rot: number }> = [];
  const cap = Math.max(capacity, 1);
  let h = (slot + 1) * 2654435761;
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h ^= h >>> 13;
    return ((h >>> 0) % 10000) / 10000;
  };
  for (let i = 0; i < count; i++) {
    // Golden-angle spiral keeps shells spread out instead of clumping.
    const layer = Math.floor(i / cap);
    const t = Math.sqrt(((i % cap) + 0.5) / cap) * (layer === 0 ? 1 : 0.8);
    const a = i * 2.39996 + rnd() * 0.6 + layer * 0.9;
    out.push({ dx: Math.cos(a) * t * radius, dy: Math.sin(a) * t * radius, rot: rnd() * Math.PI });
  }
  return out;
}
