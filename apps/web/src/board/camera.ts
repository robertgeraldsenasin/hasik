/**
 * The camera for the 2.5D board. Pure maths, no DOM, so it can be unit-tested.
 *
 * Board space is the flat layout from layout.ts (x to the right, y towards the
 * player, in CSS pixels) plus z, the height above the board's top surface. The
 * camera sits in front of the board and looks down at it, `pitch` degrees from
 * the table: 90 is straight down (the flat view), lower is a lower, more dramatic
 * angle. Perspective comes from the camera's distance.
 *
 * The camera only ever tilts about the board's left-right axis, so a line across
 * the board stays horizontal on screen with one scale along it. The scene relies
 * on that to map the wood texture onto the tilted board in horizontal strips.
 */
import type { BoardLayout, Orientation } from './layout';

export type View = 'tilt' | 'flat';

export interface Camera {
  /** Degrees between the line of sight and the table. 90 looks straight down. */
  readonly pitch: number;
  /** Distance from the board's centre, in multiples of its longer side. */
  readonly distance: number;
}

export const CAMERAS: Readonly<Record<Orientation, Readonly<Record<View, Camera>>>> = {
  landscape: { tilt: { pitch: 50, distance: 1.9 }, flat: { pitch: 90, distance: 14 } },
  // A tall board recedes a long way, so phones get a steeper, gentler tilt.
  portrait: { tilt: { pitch: 62, distance: 2.5 }, flat: { pitch: 90, distance: 14 } },
};

/** How thick the board is, as a fraction of its shorter side. */
export const BOARD_DEPTH = 0.07;

export interface Projected {
  readonly x: number;
  readonly y: number;
  /** Screen pixels per board pixel across the board at this point. */
  readonly s: number;
}

export interface Projection {
  /** Canvas size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly camera: Camera;
  project(x: number, y: number, z?: number): Projected;
  /**
   * How much a flat shape lying on the board at row y is squashed vertically:
   * 1 when seen from straight above, smaller as the camera tilts down.
   */
  foreshorten(y: number): number;
}

export interface Fit {
  /** Canvas width to fill. */
  readonly width: number;
  /** The canvas may not be taller than this; the board shrinks to fit. */
  readonly maxHeight?: number;
  /** An exact canvas height (used while the camera moves, so the canvas doesn't resize). */
  readonly height?: number;
  /** Space above the board for shells in the air, in board pixels. */
  readonly headroom: number;
  /** Empty border around everything, in CSS pixels. */
  readonly margin: number;
}

const RAD = Math.PI / 180;

export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  return {
    pitch: a.pitch * (1 - t) + b.pitch * t,
    distance: a.distance * (1 - t) + b.distance * t,
  };
}

export function makeProjection(layout: BoardLayout, camera: Camera, fit: Fit): Projection {
  const W = layout.width;
  const H = layout.height;
  const d = camera.distance * Math.max(W, H);
  const a = Math.max(5, Math.min(90, camera.pitch)) * RAD;
  const sinA = Math.sin(a);
  const cosA = Math.cos(a);
  const depth = BOARD_DEPTH * Math.min(W, H);

  // Normalised projection (focal length 1). The board's centre is the origin; Y
  // points away from the player, Z up.
  const raw = (x: number, y: number, z: number) => {
    const X = x - W / 2;
    const Yr = H / 2 - y + d * cosA;
    const Zr = z - d * sinA;
    const up = Yr * sinA + Zr * cosA;
    const ahead = Yr * cosA - Zr * sinA;
    return { u: X / ahead, v: -up / ahead, k: 1 / ahead };
  };

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  // The board and its thickness set the width; the air above it only adds height.
  for (const x of [0, W])
    for (const y of [0, H]) {
      for (const z of [-depth, 0]) {
        const p = raw(x, y, z);
        minU = Math.min(minU, p.u);
        maxU = Math.max(maxU, p.u);
        minV = Math.min(minV, p.v);
        maxV = Math.max(maxV, p.v);
      }
      const p = raw(x, y, fit.headroom);
      minV = Math.min(minV, p.v);
      maxV = Math.max(maxV, p.v);
    }

  const m = fit.margin;
  const limit = fit.height ?? fit.maxHeight;
  let scale = (fit.width - 2 * m) / (maxU - minU);
  if (limit !== undefined && (maxV - minV) * scale + 2 * m > limit)
    scale = Math.max(1e-6, (limit - 2 * m) / (maxV - minV));
  const width = Math.round(fit.width);
  const height = Math.round(fit.height ?? (maxV - minV) * scale + 2 * m);
  const ox = width / 2 - (scale * (minU + maxU)) / 2;
  const oy = height / 2 - (scale * (minV + maxV)) / 2;

  const project = (x: number, y: number, z = 0): Projected => {
    const p = raw(x, y, z);
    return { x: ox + scale * p.u, y: oy + scale * p.v, s: scale * p.k };
  };
  return {
    width,
    height,
    camera,
    project,
    foreshorten(y: number) {
      const cx = W / 2;
      const dy = project(cx, y + 0.5).y - project(cx, y - 0.5).y;
      const dx = project(cx + 0.5, y).x - project(cx - 0.5, y).x;
      return dx > 0 ? Math.max(0.05, Math.min(1, dy / dx)) : 1;
    },
  };
}
