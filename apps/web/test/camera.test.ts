import { describe, expect, it } from 'vitest';
import { BOARD_DEPTH, CAMERAS, lerpCamera, makeProjection } from '../src/board/camera';
import { computeLayout } from '../src/board/layout';

const landscape = computeLayout(1000, false);
const portrait = computeLayout(390, false, { orientation: 'portrait', maxHeight: 560 });
const fit = (width: number, maxHeight?: number) =>
  maxHeight === undefined
    ? { width, headroom: 120, margin: 12 }
    : { width, maxHeight, headroom: 120, margin: 12 };

describe('2.5D camera', () => {
  it('tilts the board: the near row sits lower and looks bigger than the far row', () => {
    const P = makeProjection(landscape, CAMERAS.landscape.tilt, fit(1000));
    const near = P.project(500, landscape.slots[3]!.y);
    const far = P.project(500, landscape.slots[11]!.y);
    expect(near.y).toBeGreaterThan(far.y);
    expect(near.s).toBeGreaterThan(far.s * 1.05);
    expect(P.foreshorten(200)).toBeLessThan(0.85);
    // Tilted, the board takes less height than seen from above.
    const flat = makeProjection(landscape, CAMERAS.landscape.flat, fit(1000));
    expect(P.height).toBeLessThan(flat.height);
  });

  it('keeps lines across the board horizontal, and the board centred', () => {
    const P = makeProjection(landscape, CAMERAS.landscape.tilt, fit(900));
    for (const y of [0, 120, 400]) {
      expect(P.project(0, y).y).toBeCloseTo(P.project(1000, y).y, 6);
      expect(P.project(500, y).x).toBeCloseTo(P.width / 2, 6);
    }
  });

  it('lifts a point up the screen as it rises off the board', () => {
    const P = makeProjection(portrait, CAMERAS.portrait.tilt, fit(390, 600));
    const g = portrait.slots[0]!;
    expect(P.project(g.x, g.y, 40).y).toBeLessThan(P.project(g.x, g.y, 0).y);
    expect(P.project(g.x, g.y, 40).s).toBeGreaterThan(P.project(g.x, g.y, 0).s);
  });

  it('looks straight down in the flat view, with almost no perspective', () => {
    const P = makeProjection(landscape, CAMERAS.landscape.flat, fit(1000));
    expect(P.foreshorten(0)).toBeGreaterThan(0.97);
    const near = P.project(500, 400);
    const far = P.project(500, 0);
    expect(near.s / far.s).toBeLessThan(1.03);
    const w = P.project(1000, 200).x - P.project(0, 200).x;
    const h = near.y - far.y;
    expect(w / h).toBeCloseTo(1000 / 400, 1);
  });

  it('fits the board and its thickness to the width, and the air above it in the height', () => {
    for (const [layout, cam, f] of [
      [landscape, CAMERAS.landscape.tilt, fit(1000)],
      [landscape, CAMERAS.landscape.flat, fit(640)],
      [portrait, CAMERAS.portrait.tilt, fit(390, 520)],
      [portrait, { pitch: 30, distance: 1.2 }, fit(390, 400)],
    ] as const) {
      const P = makeProjection(layout, cam, f);
      if (f.maxHeight !== undefined) expect(P.height).toBeLessThanOrEqual(f.maxHeight);
      const depth = BOARD_DEPTH * Math.min(layout.width, layout.height);
      for (const x of [0, layout.width])
        for (const y of [0, layout.height])
          for (const z of [-depth, 0, f.headroom]) {
            const p = P.project(x, y, z);
            // The board fills the width; the air above it only needs to fit in height.
            if (z <= 0) {
              expect(p.x).toBeGreaterThanOrEqual(-0.001);
              expect(p.x).toBeLessThanOrEqual(P.width + 0.001);
            }
            expect(p.y).toBeGreaterThanOrEqual(-0.001);
            expect(p.y).toBeLessThanOrEqual(P.height + 0.001);
          }
    }
  });

  it('blends between two cameras', () => {
    const a = CAMERAS.landscape.flat;
    const b = CAMERAS.landscape.tilt;
    expect(lerpCamera(a, b, 0)).toEqual(a);
    expect(lerpCamera(a, b, 1)).toEqual(b);
    expect(lerpCamera(a, b, 0.5).pitch).toBeCloseTo((a.pitch + b.pitch) / 2, 6);
  });
});
