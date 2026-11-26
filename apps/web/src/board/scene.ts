/**
 * The animated board, in 2.5D. Canvas 2D, no libraries, all art drawn in code.
 *
 * The board is a carved plank lying on a woven mat by lamplight, seen through a
 * tilted camera (camera.ts). Everything is placed in board space (the flat layout
 * plus a height above the wood) and projected each frame, so shells pile up in
 * their pits, rise into a hand that floats over the board, and arc through the
 * air with a shadow on the wood beneath them.
 *
 * The scene keeps its own display counts and plays a move as the physical thing
 * it is: the hand scoops the shells up, glides from pit to pit and lets one fall
 * into each, a pit bounces when a shell lands, captured shells fly to the store.
 * Everything runs on a scene clock that the player can fast-forward by tapping.
 *
 * The scene is cosmetic. The engine is still the referee: play.ts only shows a
 * move the engine has already traced, and resets the counts to the engine's
 * position when the animation ends or is cancelled.
 */
import type { GameState, Player, SowEvent } from '@hasik/engine';
import {
  BOARD_DEPTH,
  CAMERAS,
  type Camera,
  type Fit,
  type Projection,
  type View,
  lerpCamera,
  makeProjection,
} from './camera';
import { type BoardLayout, type Orientation, computeLayout, shellOffsets } from './layout';
import { SKIP_TIMESCALE, capturePause, dropSchedule, pickupPause } from './pacing';

const TAU = Math.PI * 2;
const HOUSE_CAPACITY = 14;
const STORE_CAPACITY = 34;
const SWEEP_MS = 950;
const SWITCH_MS = 650;

export interface PreviewMarks {
  readonly path: readonly number[];
  readonly relaySlots: readonly number[];
  readonly landing: number;
  /** Short outcome label drawn above the landing pit, e.g. "Isa pa!" or "Kain +9". */
  readonly chip: string | null;
  readonly store: number;
  readonly storeGain: number;
}

export interface Marks {
  /** Houses the human may play now. */
  readonly playable: ReadonlySet<number>;
  /** House under the pointer, focused, or picked with a first tap. */
  readonly hover: number | null;
  /** Touch: the hovered house was tapped once and waits for a second tap. */
  readonly armed: boolean;
  readonly lastMove: { readonly slot: number; readonly player: Player } | null;
  readonly preview: PreviewMarks | null;
  readonly hints: ReadonlyMap<number, { readonly label: string; readonly best: boolean }>;
  /** Tutorial: the house the coach points at. */
  readonly coach: number | null;
  /** The bot whose row shimmers while it searches. */
  readonly thinking: Player | null;
  /** The house the bot is about to play. */
  readonly telegraph: number | null;
}

export const NO_MARKS: Marks = {
  playable: new Set(),
  hover: null,
  armed: false,
  lastMove: null,
  preview: null,
  hints: new Map(),
  coach: null,
  thinking: null,
  telegraph: null,
};

/** A point in board space: x, y on the board's top surface, z above it. */
interface P3 {
  x: number;
  y: number;
  z: number;
}

interface Flight {
  /** Destination slot, or -1 for shells scooped into the hand. */
  to: number;
  from: P3;
  dest: P3;
  t0: number;
  dur: number;
  /** Extra height at the top of the arc, in board pixels. */
  arc: number;
  size: number;
  rot: number;
  spin: number;
  land?: () => void;
}
interface Floater {
  slot: number;
  text: string;
  t0: number;
  dur: number;
  color: string;
  size: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t0: number;
  life: number;
  color: string;
  size: number;
}
interface Ripple {
  slot: number;
  t0: number;
  color: string;
}
interface Hand {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  z: number;
  t0: number;
  dur: number;
  count: number;
  color: string;
}
interface Wait {
  until: number;
  resolve: (alive: boolean) => void;
}
interface Spot {
  dx: number;
  dy: number;
  dz: number;
  rot: number;
}
interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

interface Palette {
  wood: string;
  woodHi: string;
  woodLo: string;
  pit: string;
  ink: string;
  you: string;
  bot: string;
  shell: string;
  shellShade: string;
  display: string;
  ui: string;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

export class BoardScene {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private pal: Palette;
  private sprites = new Map<number, HTMLCanvasElement>();
  private offsetCache = new Map<number, Array<{ dx: number; dy: number; rot: number }>>();

  /** Board space: the flat layout every position is measured in. */
  layout: BoardLayout;
  /** The projection being drawn (it moves during a camera sweep). */
  private proj: Projection;
  /** Where the camera is going; overlay buttons are placed with this one. */
  private finalProj: Projection;
  private orientation: Orientation = 'landscape';
  private fitBase: Fit = { width: 800, headroom: 100, margin: 10 };
  private camAnim: { from: Camera; to: Camera; t0: number; dur: number } | null = null;

  private texture: HTMLCanvasElement | null = null;
  private textureScale = 1;
  private mat: HTMLCanvasElement | null = null;
  private matScale = 0.5;
  private matRect = { x0: 0, y0: 0, x1: 1, y1: 1 };
  private base: HTMLCanvasElement | null = null;
  private hull: Array<{ x: number; y: number }> = [];

  /** The player sitting at the near side of the board; colours follow the player. */
  human: Player = 0;
  /** 'tilt' is the 2.5D table view; 'flat' looks straight down. */
  view: View = 'tilt';
  reducedMotion = false;
  onCounts: ((counts: readonly number[]) => void) | null = null;
  /** Called when the board's on-screen position changes, so buttons can follow. */
  onProjection: (() => void) | null = null;

  private counts: number[] = new Array<number>(16).fill(0);
  private marks: Marks = NO_MARKS;
  private flights: Flight[] = [];
  private floaters: Floater[] = [];
  private sparks: Spark[] = [];
  private ripples: Ripple[] = [];
  private pulses = new Map<number, number>();
  private glow = new Map<number, { t0: number; color: string }>();
  private hand: Hand | null = null;
  private waits: Wait[] = [];
  private shakeT0 = -1;
  private shakeAmp = 0;

  private clock = 0;
  private timeScale = 1;
  private last = 0;
  private raf = 0;
  private dirtyCounts = true;
  private generation = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.pal = readPalette();
    this.layout = computeLayout(800, false);
    this.proj = makeProjection(this.layout, CAMERAS.landscape.tilt, this.fitBase);
    this.finalProj = this.proj;
  }

  // ---------------------------------------------------------------- setup

  /**
   * Size the board to a container `cssWidth` wide (portrait: at most `maxHeight`
   * tall). With `sweep`, the camera swings down from overhead to the table view.
   */
  resize(
    cssWidth: number,
    orientation: Orientation,
    maxHeight?: number,
    sweep = false,
  ): BoardLayout {
    const flip = this.human === 1;
    const portrait = orientation === 'portrait';
    const width = Math.max(260, Math.floor(cssWidth));
    this.layout = computeLayout(
      width,
      flip,
      maxHeight === undefined
        ? { orientation }
        : { orientation, maxHeight: Math.round(maxHeight * (portrait ? 1.05 : 1)) },
    );
    this.orientation = orientation;
    // Leave a strip of mat around the board, and some air above it for flying shells.
    const headroom = Math.min(this.layout.width, this.layout.height) * 0.14;
    const margin = portrait ? 8 : Math.max(12, width * 0.028);
    this.fitBase =
      maxHeight === undefined
        ? { width, headroom, margin }
        : { width, maxHeight, headroom, margin };
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.pal = readPalette();
    this.sprites.clear();
    this.offsetCache.clear();
    this.hull = hullPolyline(this.layout);
    const target = CAMERAS[orientation][this.view];
    this.finalProj = makeProjection(this.layout, target, this.fitBase);
    this.sizeCanvas();
    this.paintTexture();
    this.paintMat();
    if (sweep && !this.reducedMotion) {
      const from = { pitch: 86, distance: target.distance * 1.25 };
      this.camAnim = { from, to: target, t0: performance.now(), dur: SWEEP_MS };
      this.proj = this.projectionFor(from);
    } else {
      this.camAnim = null;
      this.proj = this.finalProj;
    }
    this.renderBase();
    this.onProjection?.();
    this.kick();
    return this.layout;
  }

  /** Switch between the table view and the flat view, moving the camera between them. */
  setView(view: View): void {
    if (view === this.view) return;
    const from = this.proj.camera;
    this.view = view;
    const to = CAMERAS[this.orientation][view];
    this.finalProj = makeProjection(this.layout, to, this.fitBase);
    this.sizeCanvas();
    this.paintTexture();
    if (this.reducedMotion) {
      this.camAnim = null;
      this.proj = this.finalProj;
    } else {
      this.camAnim = { from, to, t0: performance.now(), dur: SWITCH_MS };
      this.proj = this.projectionFor(from);
    }
    this.renderBase();
    this.onProjection?.();
    this.kick();
  }

  /** The on-screen box of a pit (CSS pixels, relative to the canvas), at the camera's resting place. */
  pitBox(slot: number): { x: number; y: number; w: number; h: number } {
    const e = this.ellipse(slot, 0, 0, this.finalProj);
    return { x: e.cx - e.rx, y: e.cy - e.ry, w: e.rx * 2, h: e.ry * 2 };
  }

  get canvasSize(): { width: number; height: number } {
    return { width: this.finalProj.width, height: this.finalProj.height };
  }

  private sizeCanvas() {
    const { width, height } = this.finalProj;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  /** A projection for an in-between camera, fitted to the final canvas size. */
  private projectionFor(cam: Camera): Projection {
    return makeProjection(this.layout, cam, {
      ...this.fitBase,
      width: this.finalProj.width,
      height: this.finalProj.height,
    });
  }

  setCounts(slots: ArrayLike<number>): void {
    for (let i = 0; i < 16; i++) this.counts[i] = slots[i] as number;
    this.dirtyCounts = true;
    this.kick();
  }

  setMarks(m: Partial<Marks>): void {
    this.marks = { ...this.marks, ...m };
    this.kick();
  }

  get currentMarks(): Marks {
    return this.marks;
  }

  get animating(): boolean {
    return this.waits.length > 0 || this.flights.length > 0;
  }

  colorOf(p: Player): string {
    return p === this.human ? this.pal.you : this.pal.bot;
  }

  /** Stop every running animation; pending playMove calls resolve to false. */
  cancel(): void {
    this.generation++;
    for (const w of this.waits) w.resolve(false);
    this.waits = [];
    this.flights = [];
    this.hand = null;
    this.glow.clear();
    this.timeScale = 1;
    this.kick();
  }

  /** Speed the current move up so the player isn't kept waiting. */
  fastForward(): void {
    if (this.animating) this.timeScale = SKIP_TIMESCALE;
  }

  destroy(): void {
    this.cancel();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  // ------------------------------------------------------------ playback

  /**
   * Animate one traced move from `before`. Resolves true when it finished and
   * false if it was cancelled (new game, undo, leaving the page).
   */
  async playMove(before: GameState, events: readonly SowEvent[], scale: number): Promise<boolean> {
    const gen = ++this.generation;
    this.timeScale = 1;
    this.setCounts(before.slots);
    const mover = before.toMove;
    const color = this.colorOf(mover);
    const drops = events.filter((e) => e.kind === 'drop').length;
    const schedule = dropSchedule(drops, scale);
    const alive = () => gen === this.generation;
    let k = 0;
    let relay = 0;
    let storeDrops = 0;
    const g = this.layout.slots;

    for (const e of events) {
      if (!alive()) return false;
      if (e.kind === 'pickup') {
        if (!(await this.settle())) return false;
        const pause = pickupPause(e.relay ? ++relay : 0, scale);
        this.scoop(e.slot, e.count, color, pause);
        this.onScoop?.(e.relay);
        if (e.relay) this.float(e.slot, relay === 1 ? 'Tuloy!' : `Tuloy ×${relay}`, color, 0.8);
        if (!(await this.wait(pause))) return false;
      } else if (e.kind === 'drop') {
        const d = schedule[k++] ?? 0;
        const target = g[e.slot]!;
        this.moveHand(target.x, target.y, Math.max(16, d * 0.75));
        if (!(await this.wait(Math.max(10, d * 0.55)))) return false;
        const isStore = target.kind === 'store';
        const step = k;
        this.dropFromHand(e.slot, Math.max(70, Math.min(200, d * 1.35)), color, () => {
          this.onLand?.(isStore ? 'store' : 'house', isStore ? storeDrops++ : step);
        });
        if (!(await this.wait(Math.max(0, d * 0.45)))) return false;
      } else if (e.kind === 'capture') {
        if (!(await this.settle())) return false;
        this.hand = null;
        const p = capturePause(scale);
        this.glow.set(e.landing, { t0: this.clock, color });
        this.glow.set(e.opposite, { t0: this.clock, color });
        this.onCapture?.(e.count);
        if (!(await this.wait(p.beat))) return false;
        const fromOpp = this.counts[e.opposite]!;
        const fromLanding = e.count - fromOpp;
        let launched = 0;
        const launch = (slot: number, n: number) => {
          for (let j = 0; j < n; j++) {
            const delay = launched++ * p.stagger;
            this.later(delay, () => this.fly(slot, e.store, p.flight));
          }
        };
        launch(e.opposite, fromOpp);
        launch(e.landing, fromLanding);
        if (!(await this.wait(launched * p.stagger + p.flight))) return false;
        if (!(await this.settle())) return false;
        this.glow.delete(e.landing);
        this.glow.delete(e.opposite);
        this.float(e.store, `Kain +${e.count}`, color, 1.25);
        this.burst(e.store, color, Math.min(40, 10 + e.count * 2));
        this.shake(Math.min(7, 1.5 + e.count * 0.35));
      }
    }
    if (!(await this.settle())) return false;
    this.hand = null;
    this.timeScale = 1;
    this.kick();
    return alive();
  }

  /** Optional hooks for sound: a shell landing, a scoop, and a capture starting. */
  onLand: ((kind: 'house' | 'store' | 'capture', step: number) => void) | null = null;
  onCapture: ((count: number) => void) | null = null;
  onScoop: ((relay: boolean) => void) | null = null;

  float(slot: number, text: string, color: string, size = 1): void {
    this.floaters.push({ slot, text, t0: this.clock, dur: 1100, color, size });
    this.kick();
  }

  burst(slot: number, color: string, n = 18): void {
    if (this.reducedMotion) return;
    const g = this.layout.slots[slot]!;
    const c = this.P(g.x, g.y, Math.min(g.r, g.ry) * 0.4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.sin(i * 12.9898) * 0.4;
      const v = 0.08 + ((i * 7) % 5) * 0.03;
      this.sparks.push({
        x: c.x,
        y: c.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.7 - 0.09,
        t0: this.clock,
        life: 560 + ((i * 13) % 7) * 40,
        color: i % 3 === 0 ? this.pal.shell : color,
        size: 1.6 + (i % 3),
      });
    }
    this.kick();
  }

  shake(amp: number): void {
    if (this.reducedMotion) return;
    this.shakeT0 = this.clock;
    this.shakeAmp = amp;
    this.kick();
  }

  /** Pulse the pit the bot is about to play, then resolve. */
  async telegraph(slot: number, ms: number): Promise<boolean> {
    this.setMarks({ telegraph: slot });
    const ok = await this.wait(ms);
    this.setMarks({ telegraph: null });
    return ok;
  }

  // -------------------------------------------------------------- motion

  private handZ(slot: number): number {
    const g = this.layout.slots[slot]!;
    return g.kind === 'store' ? Math.min(g.r, g.ry) * 1.3 : g.r * 1.7;
  }

  private handNow(): P3 {
    const h = this.hand;
    if (!h) return { x: 0, y: 0, z: 0 };
    const t = h.dur > 0 ? easeInOut(clamp01((this.clock - h.t0) / h.dur)) : 1;
    // The hand dips a little between pits, like a real hand sowing.
    const dip = Math.sin(t * Math.PI) * h.z * 0.12;
    return { x: h.fx + (h.tx - h.fx) * t, y: h.fy + (h.ty - h.fy) * t, z: h.z + dip };
  }

  private moveHand(x: number, y: number, dur: number) {
    if (!this.hand) return;
    const p = this.handNow();
    this.hand = { ...this.hand, fx: p.x, fy: p.y, tx: x, ty: y, t0: this.clock, dur };
    this.kick();
  }

  private scoop(slot: number, count: number, color: string, pause: number) {
    const g = this.layout.slots[slot]!;
    const n = this.counts[slot]!;
    const z = this.handZ(slot);
    this.counts[slot] = 0;
    this.dirtyCounts = true;
    for (let i = 0; i < Math.min(n, 10); i++) {
      const s = this.spotFor(slot, i);
      this.flights.push({
        to: -1,
        from: { x: g.x + s.dx, y: g.y + s.dy, z: s.dz },
        dest: { x: g.x, y: g.y, z },
        t0: this.clock,
        dur: Math.max(60, pause * 0.6),
        arc: 0,
        size: this.shellSize(slot),
        rot: s.rot,
        spin: 0.5,
      });
    }
    this.hand = { fx: g.x, fy: g.y, tx: g.x, ty: g.y, z, t0: this.clock, dur: 0, count, color };
    this.kick();
  }

  private dropFromHand(slot: number, dur: number, color: string, landed: () => void) {
    if (!this.hand) return;
    this.hand.count = Math.max(0, this.hand.count - 1);
    const from = this.handNow();
    const g = this.layout.slots[slot]!;
    const spot = this.spotFor(slot, this.counts[slot]! + this.pendingInto(slot));
    this.flights.push({
      to: slot,
      from,
      dest: { x: g.x + spot.dx, y: g.y + spot.dy, z: spot.dz },
      t0: this.clock,
      dur,
      arc: g.r * 0.25,
      size: this.shellSize(slot),
      rot: spot.rot,
      spin: 2.2,
      land: () => {
        this.counts[slot]!++;
        this.dirtyCounts = true;
        this.pulses.set(slot, this.clock);
        this.ripples.push({ slot, t0: this.clock, color });
        landed();
      },
    });
    this.kick();
  }

  private fly(from: number, to: number, dur: number) {
    const a = this.layout.slots[from]!;
    const b = this.layout.slots[to]!;
    const n = this.counts[from]!;
    if (n <= 0) return;
    const s = this.spotFor(from, n - 1);
    this.counts[from] = n - 1;
    this.dirtyCounts = true;
    const target = this.spotFor(to, this.counts[to]! + this.pendingInto(to));
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    this.flights.push({
      to,
      from: { x: a.x + s.dx, y: a.y + s.dy, z: s.dz },
      dest: { x: b.x + target.dx, y: b.y + target.dy, z: target.dz },
      t0: this.clock,
      dur,
      arc: Math.min(this.fitBase.headroom * 1.1, 24 + dist * 0.3),
      size: this.shellSize(from),
      rot: s.rot,
      spin: 4,
      land: () => {
        this.counts[to]!++;
        this.dirtyCounts = true;
        this.pulses.set(to, this.clock);
        this.onLand?.('capture', 0);
      },
    });
    this.kick();
  }

  private pendingInto(slot: number): number {
    let n = 0;
    for (const f of this.flights) if (f.to === slot) n++;
    return n;
  }

  private later(ms: number, fn: () => void) {
    if (ms <= 0) {
      fn();
      return;
    }
    const gen = this.generation;
    void this.wait(ms).then((ok) => {
      if (ok && gen === this.generation) fn();
    });
  }

  /** Wait on the scene clock (which fast-forward speeds up). */
  private wait(ms: number): Promise<boolean> {
    if (ms <= 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      this.waits.push({ until: this.clock + ms, resolve });
      this.kick();
    });
  }

  /** Wait until every shell in the air has landed. */
  private async settle(): Promise<boolean> {
    let guard = 0;
    while (this.flights.some((f) => f.land) && guard++ < 400) {
      if (!(await this.wait(16))) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- loop

  private kick() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number) => {
    this.raf = 0;
    const dt = Math.min(50, Math.max(0, now - this.last));
    this.last = now;
    this.clock += dt * this.timeScale;
    this.stepCamera(now);
    this.step();
    this.draw();
    if (this.dirtyCounts) {
      this.dirtyCounts = false;
      this.onCounts?.(this.counts);
    }
    if (this.busy()) this.raf = requestAnimationFrame(this.tick);
  };

  private stepCamera(now: number) {
    const a = this.camAnim;
    if (!a) return;
    const t = clamp01((now - a.t0) / a.dur);
    if (t >= 1) {
      this.camAnim = null;
      this.proj = this.finalProj;
    } else {
      this.proj = this.projectionFor(lerpCamera(a.from, a.to, easeOut(t)));
    }
    this.renderBase();
  }

  private step() {
    const done: Flight[] = [];
    this.flights = this.flights.filter((f) => {
      if (this.clock - f.t0 >= f.dur) {
        done.push(f);
        return false;
      }
      return true;
    });
    for (const f of done) f.land?.();
    const ready = this.waits.filter((w) => w.until <= this.clock);
    if (ready.length) {
      this.waits = this.waits.filter((w) => w.until > this.clock);
      for (const w of ready) w.resolve(true);
    }
    this.floaters = this.floaters.filter((f) => this.clock - f.t0 < f.dur);
    this.sparks = this.sparks.filter((s) => this.clock - s.t0 < s.life);
    this.ripples = this.ripples.filter((r) => this.clock - r.t0 < 420);
    for (const [slot, t0] of this.pulses) if (this.clock - t0 > 260) this.pulses.delete(slot);
  }

  private busy(): boolean {
    const m = this.marks;
    const ambient =
      !this.reducedMotion &&
      (m.playable.size > 0 || m.thinking !== null || m.coach !== null || m.telegraph !== null);
    return (
      ambient ||
      this.camAnim !== null ||
      this.waits.length > 0 ||
      this.flights.length > 0 ||
      this.floaters.length > 0 ||
      this.sparks.length > 0 ||
      this.ripples.length > 0 ||
      this.pulses.size > 0 ||
      this.glow.size > 0 ||
      (this.hand !== null && this.clock - this.hand.t0 < this.hand.dur) ||
      this.clock - this.shakeT0 < 380
    );
  }

  // ------------------------------------------------------------ geometry

  private P(x: number, y: number, z = 0) {
    return this.proj.project(x, y, z);
  }

  /** A pit's outline on screen, grown by `grow` board pixels, raised by z. */
  private ellipse(slot: number, grow = 0, z = 0, proj: Projection = this.proj): Ellipse {
    const g = this.layout.slots[slot]!;
    const l = proj.project(g.x - g.r - grow, g.y, z);
    const r = proj.project(g.x + g.r + grow, g.y, z);
    const f = proj.project(g.x, g.y - g.ry - grow, z);
    const n = proj.project(g.x, g.y + g.ry + grow, z);
    return { cx: (l.x + r.x) / 2, cy: (f.y + n.y) / 2, rx: (r.x - l.x) / 2, ry: (n.y - f.y) / 2 };
  }

  private shellSize(slot: number): number {
    const g = this.layout.slots[slot]!;
    return g.kind === 'store' ? Math.min(g.r, g.ry) * 0.2 : g.r * 0.19;
  }

  private spotFor(slot: number, i: number): Spot {
    const g = this.layout.slots[slot]!;
    const cap = g.kind === 'store' ? STORE_CAPACITY : HOUSE_CAPACITY;
    let list = this.offsetCache.get(slot);
    if (!list || list.length <= i) {
      list = shellOffsets(slot, Math.max(i + 1, (list?.length ?? 0) * 2, cap), 1, cap);
      this.offsetCache.set(slot, list);
    }
    const o = list[i]!;
    const k = g.kind === 'store' ? 0.72 : 0.6;
    // Past a pit's capacity shells pile on top, so full stores grow into a heap.
    const layer = Math.floor(i / cap);
    return {
      dx: o.dx * g.r * k,
      dy: o.dy * g.ry * k,
      dz: layer * this.shellSize(slot) * 0.55,
      rot: o.rot,
    };
  }

  // ------------------------------------------------------------- drawing

  private draw() {
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let ox = 0;
    let oy = 0;
    const st = this.clock - this.shakeT0;
    if (st < 380 && this.shakeAmp > 0) {
      const decay = 1 - st / 380;
      ox = Math.sin(st * 0.09) * this.shakeAmp * decay;
      oy = Math.cos(st * 0.11) * this.shakeAmp * 0.6 * decay;
    }
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    if (this.base) ctx.drawImage(this.base, 0, 0, this.proj.width, this.proj.height);

    this.drawLamp();
    this.drawThinking();
    this.drawRings();
    this.drawPreviewUnder();
    const order = Array.from({ length: 16 }, (_, i) => i).sort(
      (a, b) => this.layout.slots[a]!.y - this.layout.slots[b]!.y,
    );
    for (const i of order) this.drawShells(i);
    this.drawLabels();
    this.drawPreviewOver();
    this.drawHints();
    this.drawFlights();
    this.drawHand();
    this.drawPointers();
    this.drawFx();
  }

  /** A slow, faint flicker of the oil lamp over the table. */
  private drawLamp() {
    if (this.reducedMotion || this.view === 'flat') return;
    const t = this.clock / 1000;
    const flicker =
      0.5 + 0.25 * Math.sin(t * 2.1) + 0.15 * Math.sin(t * 5.3 + 1) + 0.1 * Math.sin(t * 11.7);
    const c = this.P(this.layout.width / 2, this.layout.height * 0.35, 0);
    const R = Math.max(this.proj.width, this.proj.height) * 0.55;
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(c.x, c.y, R * 0.05, c.x, c.y, R);
    g.addColorStop(0, `rgba(255,190,110,${(0.03 + 0.035 * flicker).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.proj.width, this.proj.height);
  }

  private strokeEllipse(e: Ellipse, color: string, width: number, dash?: number[]) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.ellipse(e.cx, e.cy, Math.max(0.1, e.rx), Math.max(0.1, e.ry), 0, 0, TAU);
    if (dash) ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }

  private drawThinking() {
    const p = this.marks.thinking;
    if (p === null) return;
    const base = p === 0 ? 0 : 8;
    const phase = (this.clock / 900) % 1;
    for (let k = 0; k < 7; k++) {
      const d = Math.abs(((k / 7 - phase + 1.5) % 1) - 0.5);
      const a = Math.max(0, 0.36 - d * 1.1);
      if (a <= 0) continue;
      this.strokeEllipse(this.ellipse(base + k, 3), withAlpha(this.colorOf(p), a), 3);
    }
  }

  private drawRings() {
    const ctx = this.ctx;
    const m = this.marks;
    const breathe = this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.clock / 420);
    const you = this.pal.you;
    for (const i of m.playable) {
      if (i === m.hover) continue;
      this.strokeEllipse(this.ellipse(i, 2), withAlpha(you, 0.35 + 0.3 * breathe), 2);
    }
    if (m.hover !== null) {
      const e = this.ellipse(m.hover, 3);
      ctx.beginPath();
      ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, TAU);
      ctx.fillStyle = withAlpha(you, m.armed ? 0.22 : 0.12);
      ctx.fill();
      this.strokeEllipse(e, you, m.armed ? 4 : 3);
    }
    if (m.lastMove && m.lastMove.slot !== m.hover)
      this.strokeEllipse(
        this.ellipse(m.lastMove.slot, 2),
        withAlpha(this.colorOf(m.lastMove.player), 0.75),
        2,
        [3, 5],
      );
    for (const slot of [m.coach, m.telegraph]) {
      if (slot === null) continue;
      const color = this.colorOf((slot < 8 ? 0 : 1) as Player);
      const t = ((this.clock % 1100) / 1100) * (this.reducedMotion ? 0 : 1);
      for (const off of [0, 0.5]) {
        const tt = (t + off) % 1;
        this.strokeEllipse(this.ellipse(slot, 3 + tt * 14), withAlpha(color, 0.8 * (1 - tt)), 3);
      }
    }
    for (const [slot, gl] of this.glow) {
      const e = this.ellipse(slot, 4);
      const a = 0.35 + 0.25 * Math.sin((this.clock - gl.t0) / 60);
      ctx.beginPath();
      ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, TAU);
      ctx.fillStyle = withAlpha(gl.color, a * 0.5);
      ctx.fill();
      this.strokeEllipse(e, gl.color, 3);
    }
    for (const r of this.ripples) {
      const g = this.layout.slots[r.slot]!;
      const t = (this.clock - r.t0) / 420;
      this.strokeEllipse(
        this.ellipse(r.slot, g.r * t * 0.35),
        withAlpha(r.color, 0.55 * (1 - t)),
        2,
      );
    }
  }

  /** A bobbing marker over the coach's house, floating in the air above it. */
  private drawPointers() {
    const slot = this.marks.coach;
    if (slot === null) return;
    const g = this.layout.slots[slot]!;
    const bob = this.reducedMotion ? 0 : Math.sin(this.clock / 180) * g.r * 0.12;
    const p = this.P(g.x, g.y, g.r * 1.5 + bob);
    const ground = this.P(g.x, g.y, 0);
    const ctx = this.ctx;
    const size = Math.max(8, g.r * 0.28 * p.s);
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, size * 0.9, size * 0.35, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - size, p.y - size * 1.45);
    ctx.lineTo(p.x + size, p.y - size * 1.45);
    ctx.closePath();
    ctx.fillStyle = this.pal.you;
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,4,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private drawPreviewUnder() {
    const p = this.marks.preview;
    if (!p) return;
    const ctx = this.ctx;
    const visits = new Map<number, number>();
    for (const s of p.path) visits.set(s, (visits.get(s) ?? 0) + 1);
    const you = this.pal.you;
    for (const [slot, n] of visits) {
      const g = this.layout.slots[slot]!;
      // One small bead on the far rim per shell the pit receives.
      const shown = Math.min(n, 5);
      for (let j = 0; j < shown; j++) {
        const a = -Math.PI / 2 + (j - (shown - 1) / 2) * 0.32;
        const b = this.P(g.x + Math.cos(a) * (g.r + 7), g.y + Math.sin(a) * (g.ry + 7));
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(2, 2.8 * b.s), 0, TAU);
        ctx.fillStyle = you;
        ctx.fill();
      }
      if (n > 5) {
        const t = this.P(g.x + g.r * 0.9, g.y - g.ry - 10);
        ctx.font = `700 ${Math.round(Math.max(10, 11 * t.s))}px ${this.pal.ui}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = you;
        ctx.fillText(`×${n}`, t.x, t.y);
      }
    }
    for (const slot of p.relaySlots) {
      const e = this.ellipse(slot, 1);
      ctx.beginPath();
      ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, -Math.PI * 0.9, Math.PI * 0.6);
      ctx.strokeStyle = withAlpha(you, 0.85);
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawPreviewOver() {
    const p = this.marks.preview;
    if (!p) return;
    const ctx = this.ctx;
    const e = this.ellipse(p.landing, 6);
    ctx.beginPath();
    ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, TAU);
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = this.reducedMotion ? 0 : -this.clock / 40;
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.pal.you;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    const g = this.layout.slots[p.landing]!;
    if (p.chip) {
      const c = this.P(g.x, g.y, Math.min(g.r, g.ry) * 1.25);
      this.chip(p.chip, c.x, c.y - 10, this.pal.you, '#2a1606', 14);
    }
    if (p.storeGain > 0 && p.store !== p.landing) {
      const s = this.layout.slots[p.store]!;
      const c = this.P(s.x, s.y, Math.min(s.r, s.ry) * 0.9);
      this.chip(`+${p.storeGain}`, c.x, c.y, 'rgba(20,10,4,0.82)', this.pal.you, 13);
    }
  }

  private chip(text: string, x: number, y: number, bg: string, fg: string, size: number) {
    const ctx = this.ctx;
    ctx.font = `700 ${size}px ${this.pal.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    const cw = tw + 14;
    const ch = size + 10;
    const lx = Math.min(Math.max(x, cw / 2 + 2), this.proj.width - cw / 2 - 2);
    const ly = Math.max(ch / 2 + 2, y);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, lx - cw / 2, ly - ch / 2, cw, ch, ch / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = fg;
    ctx.fillText(text, lx, ly + 1);
  }

  private drawShells(slot: number) {
    const n = this.counts[slot]!;
    if (n <= 0) return;
    const g = this.layout.slots[slot]!;
    const size = this.shellSize(slot);
    const k = this.proj.foreshorten(g.y);
    let lift = 0;
    const pt = this.pulses.get(slot);
    if (pt !== undefined) {
      const t = (this.clock - pt) / 260;
      lift = Math.sin(t * Math.PI) * (1 - t) * g.r * 0.12;
    }
    // The hovered house's shells rise a little, as if about to be picked up.
    const m = this.marks;
    if (slot === m.hover && m.playable.has(slot) && !this.reducedMotion)
      lift += g.r * (m.armed ? 0.22 : 0.14) * (0.75 + 0.25 * Math.sin(this.clock / 160));
    const shown = Math.min(n, g.kind === 'store' ? STORE_CAPACITY * 3 : HOUSE_CAPACITY * 3);
    const spots: Spot[] = [];
    for (let i = 0; i < shown; i++) spots.push(this.spotFor(slot, i));
    spots.sort((a, b) => a.dz - b.dz || a.dy - b.dy);
    for (const s of spots) {
      const p = this.P(g.x + s.dx, g.y + s.dy, s.dz + lift);
      this.drawShell(p.x, p.y, size * p.s, s.rot, k);
    }
  }

  private drawLabels() {
    const ctx = this.ctx;
    const L = this.layout;
    const portrait = L.orientation === 'portrait';
    const nearBase = this.human === 0 ? 0 : 8;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (let i = 0; i < 16; i++) {
      const g = L.slots[i]!;
      const n = this.counts[i]!;
      if (g.kind === 'store') {
        const p = portrait ? this.P(g.x + g.r * 0.78, g.y) : this.P(g.x, g.y + g.ry * 0.82);
        const fs = Math.round(Math.max(15, Math.min(28, Math.min(g.r, g.ry) * 0.55 * p.s)));
        ctx.font = `700 ${fs}px ${this.pal.display}`;
        const text = String(n);
        const tw = ctx.measureText(text).width;
        roundRect(ctx, p.x - tw / 2 - 9, p.y - fs / 2 - 5, tw + 18, fs + 10, (fs + 10) / 2);
        ctx.fillStyle = 'rgba(18,9,4,0.78)';
        ctx.fill();
        ctx.fillStyle = this.colorOf((i === 7 ? 0 : 1) as Player);
        ctx.fillText(text, p.x, p.y + 1);
        continue;
      }
      const near = i >= nearBase && i < nearBase + 7;
      const off = g.r + 13;
      const p = portrait
        ? this.P(near ? g.x - off : g.x + off, g.y)
        : this.P(g.x, near ? g.y + off : g.y - off - 3);
      const fs = Math.round(Math.max(11, Math.min(19, g.r * 0.42 * p.s)));
      ctx.font = `700 ${fs}px ${this.pal.ui}`;
      ctx.fillStyle = this.pal.ink;
      ctx.fillText(String(n), p.x, p.y);
      if (near) {
        // Your house numbers, carved faintly into the centre strip.
        const c = portrait
          ? this.P(L.width / 2 - g.r * 0.4, g.y)
          : this.P(g.x, L.height / 2 + g.r * 0.32);
        ctx.font = `700 ${Math.max(10, fs - 3)}px ${this.pal.display}`;
        ctx.fillStyle = withAlpha(this.pal.ink, 0.42);
        ctx.fillText(String(i - nearBase + 1), c.x, c.y);
      }
    }
  }

  private drawHints() {
    const m = this.marks;
    if (m.hints.size === 0) return;
    for (const [i, hint] of m.hints) {
      const g = this.layout.slots[i]!;
      const p = this.P(g.x, g.y, g.r * 0.5);
      const fs = Math.round(Math.max(11, Math.min(14, g.r * 0.32 * p.s)));
      this.chip(
        hint.label,
        p.x,
        p.y,
        hint.best ? this.pal.you : 'rgba(20,10,4,0.85)',
        hint.best ? '#2a1606' : this.pal.ink,
        fs,
      );
    }
  }

  private flightAt(f: Flight): P3 {
    const t = clamp01((this.clock - f.t0) / f.dur);
    const e = f.land ? easeInOut(t) : easeOut(t);
    return {
      x: f.from.x + (f.dest.x - f.from.x) * e,
      y: f.from.y + (f.dest.y - f.from.y) * e,
      z: f.from.z + (f.dest.z - f.from.z) * e + Math.sin(t * Math.PI) * f.arc,
    };
  }

  private drawFlights() {
    const ctx = this.ctx;
    const placed = this.flights.map((f) => ({ f, at: this.flightAt(f) }));
    // Shadows first, all on the wood; then the shells, nearest last.
    for (const { f, at } of placed) {
      const ground = this.P(at.x, at.y, 0);
      const k = this.proj.foreshorten(at.y);
      const fade = Math.max(0.08, 0.3 - at.z / 400);
      ctx.beginPath();
      ctx.ellipse(
        ground.x,
        ground.y,
        f.size * ground.s * 0.95,
        f.size * ground.s * 0.95 * k,
        0,
        0,
        TAU,
      );
      ctx.fillStyle = `rgba(0,0,0,${fade.toFixed(3)})`;
      ctx.fill();
    }
    placed.sort((a, b) => a.at.y - b.at.y);
    for (const { f, at } of placed) {
      const t = clamp01((this.clock - f.t0) / f.dur);
      const p = this.P(at.x, at.y, at.z);
      const k = this.proj.foreshorten(at.y);
      this.drawShell(p.x, p.y, f.size * p.s, f.rot + t * f.spin, (k + 1) / 2);
    }
  }

  private drawHand() {
    const h = this.hand;
    if (!h || h.count <= 0) return;
    const ctx = this.ctx;
    const at = this.handNow();
    const p = this.P(at.x, at.y, at.z);
    const ground = this.P(at.x, at.y, 0);
    const k = this.proj.foreshorten(at.y);
    const g0 = this.layout.slots[0]!;
    const size = g0.r * 0.19;
    const R = size * 2.2;
    // Its shadow on the wood.
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, R * 1.2 * ground.s, R * 1.2 * ground.s * k, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();
    // The handful of shells, floating.
    const r = R * p.s;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 1.15, 0, TAU);
    ctx.fillStyle = withAlpha(h.color, 0.22);
    ctx.fill();
    ctx.strokeStyle = h.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    const shown = Math.min(h.count, 7);
    for (let i = 0; i < shown; i++) {
      const a = i * 2.39996;
      const t = Math.sqrt((i + 0.5) / shown) * r * 0.6;
      this.drawShell(p.x + Math.cos(a) * t, p.y + Math.sin(a) * t * 0.8, size * p.s, a, 0.85);
    }
    const bx = p.x + r * 1.05;
    const by = p.y - r * 0.95;
    const fs = Math.round(Math.max(11, size * p.s * 2.4));
    ctx.font = `800 ${fs}px ${this.pal.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = Math.max(fs, ctx.measureText(String(h.count)).width + 8);
    roundRect(ctx, bx - tw / 2, by - fs / 2 - 3, tw, fs + 6, (fs + 6) / 2);
    ctx.fillStyle = h.color;
    ctx.fill();
    ctx.fillStyle = '#2a1606';
    ctx.fillText(String(h.count), bx, by + 1);
  }

  private drawFx() {
    const ctx = this.ctx;
    for (const s of this.sparks) {
      const t = this.clock - s.t0;
      const k = t / s.life;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x + s.vx * t, s.y + s.vy * t + 0.0002 * t * t, s.size * (1 - k * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of this.floaters) {
      const g = this.layout.slots[f.slot]!;
      const anchor = this.P(g.x, g.y, Math.min(g.r, g.ry) * 1.1);
      const t = (this.clock - f.t0) / f.dur;
      const rise = easeOut(clamp01(t * 1.4)) * 26;
      const pop = t < 0.12 ? 0.7 + (t / 0.12) * 0.4 : t < 0.2 ? 1.1 - ((t - 0.12) / 0.08) * 0.1 : 1;
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      this.chip(
        f.text,
        anchor.x,
        anchor.y - rise,
        f.color,
        '#2a1606',
        Math.round(14 * f.size * pop),
      );
      ctx.globalAlpha = 1;
    }
  }

  /** A cowrie lying on the board: rotated in the board's plane, then squashed by the tilt. */
  private drawShell(x: number, y: number, size: number, rot: number, squash: number) {
    const key = Math.max(2, Math.round(size * 2));
    let sprite = this.sprites.get(key);
    if (!sprite) {
      sprite = this.paintShell(key / 2);
      this.sprites.set(key, sprite);
    }
    const ctx = this.ctx;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const d = this.dpr;
    const t = ctx.getTransform();
    ctx.setTransform(c * d, s * d * squash, -s * d, c * d * squash, t.e + x * d, t.f + y * d);
    const sw = sprite.width / d;
    const sh = sprite.height / d;
    ctx.drawImage(sprite, -sw / 2, -sh / 2, sw, sh);
    ctx.setTransform(t);
  }

  // --------------------------------------------------------- static art

  private paintShell(s: number): HTMLCanvasElement {
    const d = this.dpr;
    const c = document.createElement('canvas');
    c.width = Math.ceil(s * 2.4 * d);
    c.height = Math.ceil(s * 1.8 * d);
    const x = c.getContext('2d')!;
    x.scale(d, d);
    x.translate(s * 1.2, s * 0.9);
    x.beginPath();
    x.ellipse(0, s * 0.08, s, s * 0.7, 0, 0, TAU);
    x.fillStyle = 'rgba(30,12,2,0.35)';
    x.fill();
    x.beginPath();
    x.ellipse(0, 0, s, s * 0.7, 0, 0, TAU);
    const g = x.createRadialGradient(-s * 0.35, -s * 0.3, s * 0.08, 0, 0, s);
    g.addColorStop(0, '#fffaf0');
    g.addColorStop(0.55, this.pal.shell);
    g.addColorStop(1, this.pal.shellShade);
    x.fillStyle = g;
    x.fill();
    x.strokeStyle = 'rgba(70,40,15,0.5)';
    x.lineWidth = Math.max(0.6, s * 0.08);
    x.stroke();
    // The cowrie's toothed slit.
    x.beginPath();
    x.moveTo(-s * 0.6, s * 0.05);
    x.quadraticCurveTo(0, s * 0.22, s * 0.6, s * 0.05);
    x.strokeStyle = 'rgba(95,60,28,0.7)';
    x.lineWidth = Math.max(0.6, s * 0.1);
    x.stroke();
    x.beginPath();
    x.ellipse(-s * 0.3, -s * 0.28, s * 0.28, s * 0.12, -0.3, 0, TAU);
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.fill();
    return c;
  }

  /**
   * The board's top surface, flat, as a texture: wood, grain, capiz inlays and the
   * carved pits. renderBase() lays it onto the tilted board.
   */
  private paintTexture() {
    const { width: w, height: h, slots, orientation } = this.layout;
    const near = this.finalProj.project(w / 2, h, 0).s;
    const ts = Math.min(3, Math.max(1, near * this.dpr));
    this.textureScale = ts;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * ts);
    c.height = Math.ceil(h * ts);
    const x = c.getContext('2d')!;
    x.scale(ts, ts);
    const p = this.pal;
    const portrait = orientation === 'portrait';
    const hull = new Path2D();
    this.hull.forEach((q, i) => (i === 0 ? hull.moveTo(q.x, q.y) : hull.lineTo(q.x, q.y)));
    hull.closePath();

    // Wood body, lit from above and behind the board.
    const grad = portrait ? x.createLinearGradient(0, 0, w, 0) : x.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, p.woodHi);
    grad.addColorStop(0.5, p.wood);
    grad.addColorStop(1, p.woodLo);
    x.fillStyle = grad;
    x.fill(hull);
    x.save();
    x.clip(hull);

    // Grain: long, slightly wavy strokes, seeded so they don't change between resizes.
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const lines = 30;
    for (let i = 0; i < lines; i++) {
      const t = (i + rnd() * 0.6) / lines;
      x.beginPath();
      x.lineWidth = 0.6 + rnd() * 1.4;
      x.strokeStyle = `rgba(30,12,2,${(0.05 + rnd() * 0.08).toFixed(3)})`;
      if (!portrait) {
        const y = t * h;
        x.moveTo(0, y);
        x.bezierCurveTo(
          w * 0.3,
          y + (rnd() - 0.5) * 14,
          w * 0.7,
          y + (rnd() - 0.5) * 14,
          w,
          y + (rnd() - 0.5) * 8,
        );
      } else {
        const xx = t * w;
        x.moveTo(xx, 0);
        x.bezierCurveTo(
          xx + (rnd() - 0.5) * 14,
          h * 0.3,
          xx + (rnd() - 0.5) * 14,
          h * 0.7,
          xx + (rnd() - 0.5) * 8,
          h,
        );
      }
      x.stroke();
    }
    for (let i = 0; i < 2; i++) {
      const kx = w * (0.3 + rnd() * 0.4);
      const ky = h * (0.42 + rnd() * 0.16);
      for (let r = 3; r < 16; r += 3.5) {
        x.beginPath();
        x.ellipse(kx, ky, r * 1.8, r * 0.7, portrait ? Math.PI / 2 : 0, 0, TAU);
        x.strokeStyle = 'rgba(30,12,2,0.07)';
        x.lineWidth = 1;
        x.stroke();
      }
    }

    // Capiz inlays down the centre line, between the columns of houses.
    const inlay = (cx: number, cy: number, s: number) => {
      x.beginPath();
      x.moveTo(cx, cy - s);
      x.lineTo(cx + s * 0.62, cy);
      x.lineTo(cx, cy + s);
      x.lineTo(cx - s * 0.62, cy);
      x.closePath();
      const ig = x.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
      ig.addColorStop(0, 'rgba(255,248,230,0.8)');
      ig.addColorStop(0.5, 'rgba(200,225,235,0.6)');
      ig.addColorStop(1, 'rgba(255,230,200,0.65)');
      x.fillStyle = ig;
      x.fill();
      x.strokeStyle = 'rgba(40,18,6,0.5)';
      x.lineWidth = 0.8;
      x.stroke();
    };
    const nearBase = this.human === 0 ? 0 : 8;
    for (let k = 0; k < 6; k++) {
      const a = slots[nearBase + k]!;
      const b = slots[nearBase + k + 1]!;
      const s = Math.max(3, a.r * 0.13);
      if (!portrait) inlay((a.x + b.x) / 2, h / 2, s);
      else inlay(w / 2, (a.y + b.y) / 2, s);
    }

    // Pits: carved cups. Seen from in front, the far inner wall catches the lamp and
    // the near lip throws the bottom into shadow.
    for (let i = 0; i < 16; i++) {
      const g = slots[i]!;
      x.save();
      x.beginPath();
      x.ellipse(g.x, g.y + 1.5, g.r + 2, g.ry + 2, 0, 0, TAU);
      x.fillStyle = 'rgba(255,215,160,0.18)';
      x.fill();
      x.beginPath();
      x.ellipse(g.x, g.y, g.r, g.ry, 0, 0, TAU);
      const wall = x.createLinearGradient(g.x, g.y - g.ry, g.x, g.y + g.ry);
      wall.addColorStop(0, '#7a3c18');
      wall.addColorStop(0.35, p.pit);
      wall.addColorStop(1, '#0d0401');
      x.fillStyle = wall;
      x.fill();
      x.clip();
      const floor = x.createRadialGradient(
        g.x,
        g.y + g.ry * 0.15,
        0,
        g.x,
        g.y + g.ry * 0.15,
        Math.max(g.r, g.ry) * 0.75,
      );
      floor.addColorStop(0, 'rgba(60,24,8,0.85)');
      floor.addColorStop(1, 'rgba(60,24,8,0)');
      x.fillStyle = floor;
      x.fillRect(g.x - g.r, g.y - g.ry, g.r * 2, g.ry * 2);
      x.beginPath();
      x.ellipse(g.x, g.y + g.ry * 0.55, g.r * 1.15, g.ry * 0.8, 0, Math.PI, TAU);
      x.lineWidth = Math.min(g.r, g.ry) * 0.3;
      x.strokeStyle = 'rgba(0,0,0,0.4)';
      x.stroke();
      x.restore();
    }
    x.restore();
    this.texture = c;
  }

  /** The woven banig the board sits on, as a texture for the table plane. */
  private paintMat() {
    const { width: w, height: h } = this.layout;
    const portrait = this.layout.orientation === 'portrait';
    const r = portrait
      ? { x0: -0.5 * w, y0: -0.8 * h, x1: 1.5 * w, y1: 1.5 * h }
      : { x0: -0.6 * w, y0: -2.4 * h, x1: 1.6 * w, y1: 2 * h };
    this.matRect = r;
    const ms = Math.min(1, 1.2 * this.dpr * 0.5);
    this.matScale = ms;
    const c = document.createElement('canvas');
    c.width = Math.ceil((r.x1 - r.x0) * ms);
    c.height = Math.ceil((r.y1 - r.y0) * ms);
    const x = c.getContext('2d')!;
    x.scale(ms, ms);
    x.fillStyle = '#4e3519';
    x.fillRect(0, 0, r.x1 - r.x0, r.y1 - r.y0);
    // Over-under weave: alternating diagonal strips of light and dark pandan.
    const cell = 16;
    const cols = Math.ceil((r.x1 - r.x0) / cell) + 2;
    const rows = Math.ceil((r.y1 - r.y0) / cell) + 2;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const cx = i * cell;
        const cy = j * cell;
        x.beginPath();
        if ((i + j) % 2 === 0) {
          x.moveTo(cx, cy);
          x.lineTo(cx + cell, cy + cell * 0.18);
          x.lineTo(cx + cell, cy + cell);
          x.lineTo(cx, cy + cell * 0.82);
          x.fillStyle = 'rgba(122,88,46,0.55)';
        } else {
          x.moveTo(cx, cy + cell * 0.18);
          x.lineTo(cx + cell * 0.82, cy);
          x.lineTo(cx + cell, cy + cell * 0.82);
          x.lineTo(cx + cell * 0.18, cy + cell);
          x.fillStyle = 'rgba(40,24,10,0.35)';
        }
        x.closePath();
        x.fill();
      }
    // Dyed bands across the mat.
    const bandEvery = 300;
    for (let y = 120; y < r.y1 - r.y0; y += bandEvery) {
      x.fillStyle = 'rgba(142,47,76,0.55)';
      x.fillRect(0, y, r.x1 - r.x0, 20);
      x.fillStyle = 'rgba(184,134,42,0.5)';
      x.fillRect(0, y + 24, r.x1 - r.x0, 8);
    }
    this.mat = c;
  }

  /** Lay a flat texture covering board-space rect r onto the table plane at height z. */
  private drawPlane(
    ctx: CanvasRenderingContext2D,
    img: HTMLCanvasElement,
    scale: number,
    r: { x0: number; y0: number; x1: number; y1: number },
    z: number,
  ) {
    const top = this.P(r.x0, r.y0, z).y;
    const bottom = this.P(r.x0, r.y1, z).y;
    const strips = Math.min(400, Math.max(8, Math.ceil(Math.abs(bottom - top) / 2)));
    for (let i = 0; i < strips; i++) {
      const ya = r.y0 + ((r.y1 - r.y0) * i) / strips;
      const yb = r.y0 + ((r.y1 - r.y0) * (i + 1)) / strips;
      const ym = (ya + yb) / 2;
      const a = this.P(r.x0, ya, z);
      const b = this.P(r.x0, yb, z);
      const left = this.P(r.x0, ym, z).x;
      const right = this.P(r.x1, ym, z).x;
      const sy = (ya - r.y0) * scale;
      const sh = Math.max(1, (yb - ya) * scale);
      if (sy + sh > img.height) continue;
      ctx.drawImage(img, 0, sy, img.width, sh, left, a.y, right - left, b.y - a.y + 0.75);
    }
  }

  private hullPath(z: number, dy = 0): Path2D {
    const path = new Path2D();
    this.hull.forEach((q, i) => {
      const p = this.P(q.x, q.y + dy, z);
      if (i === 0) path.moveTo(p.x, p.y);
      else path.lineTo(p.x, p.y);
    });
    path.closePath();
    return path;
  }

  /** The static part of the scene for the current camera: mat, shadow, board. */
  private renderBase() {
    const { width, height } = this.proj;
    const d = this.dpr;
    let c = this.base;
    if (!c) c = this.base = document.createElement('canvas');
    if (c.width !== Math.round(width * d) || c.height !== Math.round(height * d)) {
      c.width = Math.round(width * d);
      c.height = Math.round(height * d);
    }
    const x = c.getContext('2d')!;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    x.setTransform(d, 0, 0, d, 0, 0);
    const L = this.layout;
    const depth = BOARD_DEPTH * Math.min(L.width, L.height);
    const centre = this.P(L.width / 2, L.height / 2, 0);

    // The mat, fading out at the edges into the page.
    if (this.mat) {
      this.drawPlane(x, this.mat, this.matScale, this.matRect, -depth);
      // An oval mask that reaches zero exactly at the canvas edges, so the mat melts
      // into the page's own mat with no visible rectangle.
      x.globalCompositeOperation = 'destination-in';
      x.save();
      x.translate(width / 2, height / 2);
      x.scale(width / 2, height / 2);
      const fade = x.createRadialGradient(0, 0, 0, 0, 0, 1);
      fade.addColorStop(0, 'rgba(0,0,0,1)');
      fade.addColorStop(0.62, 'rgba(0,0,0,0.92)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = fade;
      x.fillRect(-1, -1, 2, 2);
      x.restore();
      x.globalCompositeOperation = 'source-over';
      const R = Math.max(width, height) * 0.62;
      // Night: the lamp lights the middle of the mat.
      const lamp = x.createRadialGradient(
        centre.x,
        centre.y - height * 0.15,
        0,
        centre.x,
        centre.y,
        R,
      );
      lamp.addColorStop(0, 'rgba(255,190,110,0.14)');
      lamp.addColorStop(0.6, 'rgba(30,14,4,0.15)');
      lamp.addColorStop(1, 'rgba(20,10,3,0.45)');
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = lamp;
      x.fillRect(0, 0, width, height);
      x.globalCompositeOperation = 'source-over';
    }

    // The board's shadow on the mat.
    x.save();
    x.shadowColor = 'rgba(0,0,0,0.6)';
    x.shadowBlur = 24;
    x.shadowOffsetY = 12;
    x.fillStyle = 'rgba(0,0,0,0.5)';
    x.fill(this.hullPath(-depth, L.height * 0.02));
    x.restore();

    // The side of the plank, visible along the near edge.
    const top = this.hullPath(0);
    const side = x.createLinearGradient(0, centre.y, 0, this.P(L.width / 2, L.height, -depth).y);
    side.addColorStop(0, this.pal.woodLo);
    side.addColorStop(1, '#2a1006');
    x.fillStyle = side;
    x.fill(this.hullPath(-depth));
    x.strokeStyle = 'rgba(0,0,0,0.35)';
    x.lineWidth = 1;
    x.stroke(this.hullPath(-depth));

    // The top surface.
    if (this.texture) {
      x.save();
      x.clip(top);
      this.drawPlane(
        x,
        this.texture,
        this.textureScale,
        { x0: 0, y0: 0, x1: L.width, y1: L.height },
        0,
      );
      x.restore();
    }
    x.strokeStyle = 'rgba(255,222,175,0.28)';
    x.lineWidth = 1.5;
    x.stroke(top);
  }
}

/** The board's outline in board space: a carved plank with rounded, boat-like ends. */
function hullPolyline(layout: BoardLayout): Array<{ x: number; y: number }> {
  const { width: w, height: h, orientation } = layout;
  type Pt = readonly [number, number];
  const out: Array<{ x: number; y: number }> = [];
  let cur: Pt = [0, 0];
  const N = 18;
  const move = (p: Pt) => {
    cur = p;
    out.push({ x: p[0], y: p[1] });
  };
  const cubic = (a: Pt, b: Pt, c: Pt) => {
    const p0 = cur;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const u = 1 - t;
      out.push({
        x: u * u * u * p0[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * c[0],
        y: u * u * u * p0[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * c[1],
      });
    }
    cur = c;
  };
  const quad = (a: Pt, b: Pt) => {
    const p0 = cur;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const u = 1 - t;
      out.push({
        x: u * u * p0[0] + 2 * u * t * a[0] + t * t * b[0],
        y: u * u * p0[1] + 2 * u * t * a[1] + t * t * b[1],
      });
    }
    cur = b;
  };
  if (orientation === 'landscape') {
    const m = h * 0.04;
    const bow = h * 0.05;
    move([w * 0.005, h / 2]);
    cubic([w * 0.005, m + bow], [w * 0.04, m], [w * 0.12, m]);
    quad([w / 2, m - bow], [w * 0.88, m]);
    cubic([w * 0.96, m], [w * 0.995, m + bow], [w * 0.995, h / 2]);
    cubic([w * 0.995, h - m - bow], [w * 0.96, h - m], [w * 0.88, h - m]);
    quad([w / 2, h - m + bow], [w * 0.12, h - m]);
    cubic([w * 0.04, h - m], [w * 0.005, h - m - bow], [w * 0.005, h / 2]);
  } else {
    const m = w * 0.04;
    const bow = w * 0.05;
    move([w / 2, h * 0.004]);
    cubic([w - m - bow, h * 0.004], [w - m, h * 0.03], [w - m, h * 0.09]);
    quad([w - m + bow, h / 2], [w - m, h * 0.91]);
    cubic([w - m, h * 0.97], [w - m - bow, h * 0.996], [w / 2, h * 0.996]);
    cubic([m + bow, h * 0.996], [m, h * 0.97], [m, h * 0.91]);
    quad([m - bow, h / 2], [m, h * 0.09]);
    cubic([m, h * 0.03], [m + bow, h * 0.004], [w / 2, h * 0.004]);
  }
  return out;
}

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    wood: v('--wood', '#8a4524'),
    woodHi: v('--wood-hi', '#b0622f'),
    woodLo: v('--wood-lo', '#4a1f0c'),
    pit: v('--pit', '#3a1909'),
    ink: v('--board-ink', '#fbeedb'),
    you: v('--you', '#f6b93b'),
    bot: v('--bot', '#ef7d9b'),
    shell: v('--shell', '#efe2c6'),
    shellShade: v('--shell-shade', '#cdb48a'),
    display: v('--font-display', 'Georgia, serif'),
    ui: v('--font-ui', 'system-ui, sans-serif'),
  };
}

/** "#rrggbb" or "rgb(...)" plus an alpha. */
export function withAlpha(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (m) {
    const n = parseInt(m[1]!, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
  }
  return color;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
