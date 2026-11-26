/**
 * The animated board. Canvas 2D, no libraries, all art drawn in code.
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
import { type BoardLayout, type Orientation, computeLayout, shellOffsets } from './layout';
import { SKIP_TIMESCALE, capturePause, dropSchedule, pickupPause } from './pacing';

const TAU = Math.PI * 2;
const HOUSE_CAPACITY = 14;
const STORE_CAPACITY = 34;

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

interface Flight {
  /** Destination slot, or -1 for shells scooped into the hand. */
  to: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t0: number;
  dur: number;
  arc: number;
  size: number;
  rot: number;
  spin: number;
  land?: () => void;
}
interface Floater {
  x: number;
  y: number;
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
  t0: number;
  dur: number;
  count: number;
  color: string;
}
interface Wait {
  until: number;
  resolve: (alive: boolean) => void;
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
  private base: HTMLCanvasElement | null = null;
  private dpr = 1;
  private pal: Palette;
  private sprites = new Map<number, HTMLCanvasElement>();
  private offsetCache = new Map<number, Array<{ dx: number; dy: number; rot: number }>>();

  layout: BoardLayout;
  /** The player sitting at the near side of the board; colours follow the player. */
  human: Player = 0;
  reducedMotion = false;
  onCounts: ((counts: readonly number[]) => void) | null = null;

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
  }

  // ---------------------------------------------------------------- setup

  resize(cssWidth: number, orientation: Orientation, maxHeight?: number): BoardLayout {
    const flip = this.human === 1;
    this.layout = computeLayout(
      Math.max(260, Math.floor(cssWidth)),
      flip,
      maxHeight === undefined ? { orientation } : { orientation, maxHeight },
    );
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(this.layout.width * this.dpr);
    this.canvas.height = Math.round(this.layout.height * this.dpr);
    this.canvas.style.width = `${this.layout.width}px`;
    this.canvas.style.height = `${this.layout.height}px`;
    this.pal = readPalette();
    this.sprites.clear();
    this.offsetCache.clear();
    this.base = this.paintBase();
    this.kick();
    return this.layout;
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
        const hx = target.x;
        const hy = this.handY(e.slot);
        this.moveHand(hx, hy, Math.max(16, d * 0.75));
        if (!(await this.wait(Math.max(10, d * 0.55)))) return false;
        const isStore = target.kind === 'store';
        const step = k;
        this.dropFromHand(e.slot, Math.max(70, Math.min(190, d * 1.3)), color, () => {
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

  /** Optional hooks for sound: a shell landing, and a capture starting. */
  onLand: ((kind: 'house' | 'store' | 'capture', step: number) => void) | null = null;
  onCapture: ((count: number) => void) | null = null;
  onScoop: ((relay: boolean) => void) | null = null;

  float(slot: number, text: string, color: string, size = 1): void {
    const g = this.layout.slots[slot]!;
    this.floaters.push({
      x: g.x,
      y: g.y - g.ry * 0.4,
      text,
      t0: this.clock,
      dur: 1100,
      color,
      size,
    });
    this.kick();
  }

  burst(slot: number, color: string, n = 18): void {
    if (this.reducedMotion) return;
    const g = this.layout.slots[slot]!;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.sin(i * 12.9898) * 0.4;
      const v = 0.08 + ((i * 7) % 5) * 0.03;
      this.sparks.push({
        x: g.x,
        y: g.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 0.05,
        t0: this.clock,
        life: 520 + ((i * 13) % 7) * 40,
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

  private handY(slot: number): number {
    const g = this.layout.slots[slot]!;
    return g.y - g.ry * (g.kind === 'store' ? 0.55 : 1.05);
  }

  private handNow(): { x: number; y: number } {
    const h = this.hand;
    if (!h) return { x: 0, y: 0 };
    const t = h.dur > 0 ? easeInOut(clamp01((this.clock - h.t0) / h.dur)) : 1;
    return { x: h.fx + (h.tx - h.fx) * t, y: h.fy + (h.ty - h.fy) * t };
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
    const spots = this.spots(slot, Math.min(n, 10));
    const hy = this.handY(slot);
    this.counts[slot] = 0;
    this.dirtyCounts = true;
    for (const s of spots) {
      this.flights.push({
        to: -1,
        x0: g.x + s.dx,
        y0: g.y + s.dy,
        x1: g.x,
        y1: hy,
        t0: this.clock,
        dur: Math.max(60, pause * 0.6),
        arc: 0,
        size: this.shellSize(slot),
        rot: s.rot,
        spin: 0.5,
      });
    }
    this.hand = { fx: g.x, fy: hy, tx: g.x, ty: hy, t0: this.clock, dur: 0, count, color };
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
      x0: from.x,
      y0: from.y,
      x1: g.x + spot.dx,
      y1: g.y + spot.dy,
      t0: this.clock,
      dur,
      arc: -6,
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
      x0: a.x + s.dx,
      y0: a.y + s.dy,
      x1: b.x + target.dx,
      y1: b.y + target.dy,
      t0: this.clock,
      dur,
      arc: -Math.min(90, 20 + dist * 0.25),
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
    this.step();
    this.draw();
    if (this.dirtyCounts) {
      this.dirtyCounts = false;
      this.onCounts?.(this.counts);
    }
    if (this.busy()) this.raf = requestAnimationFrame(this.tick);
  };

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

  // ------------------------------------------------------------- drawing

  private shellSize(slot: number): number {
    const g = this.layout.slots[slot]!;
    return g.kind === 'store' ? Math.min(g.r, g.ry) * 0.19 : g.r * 0.18;
  }

  private spread(slot: number): { sx: number; sy: number } {
    const g = this.layout.slots[slot]!;
    const k = g.kind === 'store' ? 0.72 : 0.6;
    return { sx: g.r * k, sy: g.ry * k };
  }

  private spots(slot: number, n: number) {
    const out: Array<{ dx: number; dy: number; rot: number }> = [];
    for (let i = 0; i < n; i++) out.push(this.spotFor(slot, i));
    return out;
  }

  private spotFor(slot: number, i: number): { dx: number; dy: number; rot: number } {
    const g = this.layout.slots[slot]!;
    const cap = g.kind === 'store' ? STORE_CAPACITY : HOUSE_CAPACITY;
    let list = this.offsetCache.get(slot);
    if (!list || list.length <= i) {
      list = shellOffsets(slot, Math.max(i + 1, (list?.length ?? 0) * 2, cap), 1, cap);
      this.offsetCache.set(slot, list);
    }
    const o = list[i]!;
    const { sx, sy } = this.spread(slot);
    return { dx: o.dx * sx, dy: o.dy * sy, rot: o.rot };
  }

  private draw() {
    const { ctx, dpr } = this;
    const { width: w, height: h } = this.layout;
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
    if (this.base) ctx.drawImage(this.base, 0, 0, w, h);

    this.drawThinking();
    this.drawRings();
    this.drawPreviewUnder();
    for (let i = 0; i < 16; i++) this.drawShells(i);
    this.drawLabels();
    this.drawPreviewOver();
    this.drawHints();
    this.drawFlights();
    this.drawHand();
    this.drawFx();
  }

  private drawThinking() {
    const p = this.marks.thinking;
    if (p === null) return;
    const ctx = this.ctx;
    const base = p === 0 ? 0 : 8;
    const phase = (this.clock / 900) % 1;
    for (let k = 0; k < 7; k++) {
      const g = this.layout.slots[base + k]!;
      const d = Math.abs(((k / 7 - phase + 1.5) % 1) - 0.5);
      const a = Math.max(0, 0.32 - d * 1.1);
      if (a <= 0) continue;
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, g.r * 1.08, g.ry * 1.08, 0, 0, TAU);
      ctx.strokeStyle = withAlpha(this.colorOf(p), a);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  private drawRings() {
    const ctx = this.ctx;
    const m = this.marks;
    const breathe = this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.clock / 420);
    const you = this.pal.you;
    for (const i of m.playable) {
      if (i === m.hover) continue;
      const g = this.layout.slots[i]!;
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, g.r + 2, g.ry + 2, 0, 0, TAU);
      ctx.strokeStyle = withAlpha(you, 0.35 + 0.3 * breathe);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (m.hover !== null) {
      const g = this.layout.slots[m.hover]!;
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, g.r + 3, g.ry + 3, 0, 0, TAU);
      ctx.fillStyle = withAlpha(you, m.armed ? 0.22 : 0.12);
      ctx.fill();
      ctx.strokeStyle = you;
      ctx.lineWidth = m.armed ? 4 : 3;
      ctx.stroke();
    }
    if (m.lastMove && m.lastMove.slot !== m.hover) {
      const g = this.layout.slots[m.lastMove.slot]!;
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, g.r + 2, g.ry + 2, 0, 0, TAU);
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = withAlpha(this.colorOf(m.lastMove.player), 0.75);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const slot of [m.coach, m.telegraph]) {
      if (slot === null) continue;
      const g = this.layout.slots[slot]!;
      const owner = slot < 8 ? 0 : 1;
      const color = this.colorOf(owner as Player);
      const t = ((this.clock % 1100) / 1100) * (this.reducedMotion ? 0 : 1);
      for (const off of [0, 0.5]) {
        const tt = (t + off) % 1;
        ctx.beginPath();
        ctx.ellipse(g.x, g.y, g.r + 3 + tt * 14, g.ry + 3 + tt * 14, 0, 0, TAU);
        ctx.strokeStyle = withAlpha(color, 0.8 * (1 - tt));
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      if (slot === m.coach) this.drawPointer(g.x, g.y - g.ry - 10, color);
    }
    for (const [slot, gl] of this.glow) {
      const g = this.layout.slots[slot]!;
      const a = 0.35 + 0.25 * Math.sin((this.clock - gl.t0) / 60);
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, g.r + 4, g.ry + 4, 0, 0, TAU);
      ctx.fillStyle = withAlpha(gl.color, a * 0.5);
      ctx.fill();
      ctx.strokeStyle = gl.color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    for (const r of this.ripples) {
      const g = this.layout.slots[r.slot]!;
      const t = (this.clock - r.t0) / 420;
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, g.r * (1 + t * 0.35), g.ry * (1 + t * 0.35), 0, 0, TAU);
      ctx.strokeStyle = withAlpha(r.color, 0.55 * (1 - t));
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private drawPointer(x: number, y: number, color: string) {
    const ctx = this.ctx;
    const bob = this.reducedMotion ? 0 : Math.sin(this.clock / 180) * 4;
    ctx.beginPath();
    ctx.moveTo(x, y + bob);
    ctx.lineTo(x - 9, y - 13 + bob);
    ctx.lineTo(x + 9, y - 13 + bob);
    ctx.closePath();
    ctx.fillStyle = color;
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
      // One small bead on the rim per shell the pit receives.
      const shown = Math.min(n, 5);
      for (let j = 0; j < shown; j++) {
        const a = -Math.PI / 2 + (j - (shown - 1) / 2) * 0.32;
        const bx = g.x + Math.cos(a) * (g.r + 7);
        const by = g.y + Math.sin(a) * (g.ry + 7);
        ctx.beginPath();
        ctx.arc(bx, by, 2.6, 0, TAU);
        ctx.fillStyle = you;
        ctx.fill();
      }
      if (n > 5) {
        ctx.font = `700 10px ${this.pal.ui}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = you;
        ctx.fillText(`×${n}`, g.x + g.r * 0.9, g.y - g.ry - 4);
      }
    }
    for (const slot of p.relaySlots) {
      const g = this.layout.slots[slot]!;
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, g.r + 1, g.ry + 1, 0, -Math.PI * 0.9, Math.PI * 0.6);
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
    const g = this.layout.slots[p.landing]!;
    const spin = this.reducedMotion ? 0 : this.clock / 900;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(spin);
    ctx.beginPath();
    ctx.ellipse(0, 0, g.r + 6, g.ry + 6, 0, 0, TAU);
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.pal.you;
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    if (p.chip) this.chip(p.chip, g.x, g.y - g.ry - 18, this.pal.you, '#2a1606', 14);
    if (p.storeGain > 0 && p.store !== p.landing) {
      const s = this.layout.slots[p.store]!;
      this.chip(`+${p.storeGain}`, s.x, s.y - s.ry * 0.55, 'rgba(20,10,4,0.82)', this.pal.you, 13);
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
    const lx = Math.min(Math.max(x, cw / 2 + 2), this.layout.width - cw / 2 - 2);
    const ly = Math.max(ch / 2 + 2, y);
    roundRect(ctx, lx - cw / 2, ly - ch / 2, cw, ch, ch / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.fillText(text, lx, ly + 1);
  }

  private drawShells(slot: number) {
    const n = this.counts[slot]!;
    if (n <= 0) return;
    const g = this.layout.slots[slot]!;
    const size = this.shellSize(slot);
    const pt = this.pulses.get(slot);
    let bounce = 1;
    if (pt !== undefined) {
      const t = (this.clock - pt) / 260;
      bounce = 1 + Math.sin(t * Math.PI) * 0.12 * (1 - t);
    }
    const shown = Math.min(n, g.kind === 'store' ? 80 : 40);
    for (let i = 0; i < shown; i++) {
      const s = this.spotFor(slot, i);
      this.drawShell(g.x + s.dx * bounce, g.y + s.dy * bounce - (bounce - 1) * 10, size, s.rot);
    }
  }

  private drawLabels() {
    const ctx = this.ctx;
    const L = this.layout;
    const portrait = L.orientation === 'portrait';
    const nearBase = this.human === 0 ? 0 : 8;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 16; i++) {
      const g = L.slots[i]!;
      const n = this.counts[i]!;
      if (g.kind === 'store') {
        const fs = Math.round(Math.max(15, Math.min(28, Math.min(g.r, g.ry) * 0.55)));
        ctx.font = `700 ${fs}px ${this.pal.display}`;
        const text = String(n);
        const tw = ctx.measureText(text).width;
        const px = portrait ? g.x + g.r * 0.78 : g.x;
        const py = portrait ? g.y : g.y + g.ry * 0.8;
        roundRect(ctx, px - tw / 2 - 9, py - fs / 2 - 5, tw + 18, fs + 10, (fs + 10) / 2);
        ctx.fillStyle = 'rgba(18,9,4,0.72)';
        ctx.fill();
        ctx.fillStyle = this.colorOf((i === 7 ? 0 : 1) as Player);
        ctx.textAlign = 'center';
        ctx.fillText(text, px, py + 1);
        continue;
      }
      const near = i >= nearBase && i < nearBase + 7;
      const fs = Math.round(Math.max(12, Math.min(18, g.r * 0.42)));
      ctx.font = `700 ${fs}px ${this.pal.ui}`;
      ctx.fillStyle = this.pal.ink;
      ctx.textAlign = 'center';
      let lx = g.x;
      let ly = g.y;
      if (portrait) lx = near ? g.x - g.r - fs * 1.1 : g.x + g.r + fs * 1.1;
      else ly = near ? g.y + g.r + fs * 0.95 : g.y - g.r - fs * 1.25;
      ctx.fillText(String(n), lx, ly);
      if (near) {
        // Your house numbers, carved faintly into the centre strip.
        const k = i - nearBase + 1;
        ctx.font = `700 ${Math.max(10, fs - 3)}px ${this.pal.display}`;
        ctx.fillStyle = withAlpha(this.pal.ink, 0.42);
        if (portrait) ctx.fillText(String(k), L.width / 2 - fs * 0.6, g.y);
        else ctx.fillText(String(k), g.x, L.height / 2 + fs * 0.75);
      }
    }
  }

  private drawHints() {
    const m = this.marks;
    if (m.hints.size === 0) return;
    for (const [i, hint] of m.hints) {
      const g = this.layout.slots[i]!;
      const fs = Math.round(Math.max(11, Math.min(14, g.r * 0.32)));
      this.chip(
        hint.label,
        g.x,
        g.y - g.ry * 0.2,
        hint.best ? this.pal.you : 'rgba(20,10,4,0.85)',
        hint.best ? '#2a1606' : this.pal.ink,
        fs,
      );
    }
  }

  private drawFlights() {
    const ctx = this.ctx;
    for (const f of this.flights) {
      const t = clamp01((this.clock - f.t0) / f.dur);
      const e = f.land ? easeInOut(t) : easeOut(t);
      const x = f.x0 + (f.x1 - f.x0) * e;
      const lift = Math.sin(t * Math.PI) * f.arc;
      const y = f.y0 + (f.y1 - f.y0) * e + lift;
      ctx.beginPath();
      ctx.ellipse(x, f.y0 + (f.y1 - f.y0) * e + 3, f.size * 0.9, f.size * 0.45, 0, 0, TAU);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fill();
      this.drawShell(x, y, f.size * (1 + Math.sin(t * Math.PI) * 0.15), f.rot + t * f.spin);
    }
  }

  private drawHand() {
    const h = this.hand;
    if (!h || h.count <= 0) return;
    const ctx = this.ctx;
    const p = this.handNow();
    const g0 = this.layout.slots[0]!;
    const size = g0.r * 0.2;
    const shown = Math.min(h.count, 7);
    const R = size * 2.1;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 4, R * 1.15, R * 0.75, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, R * 1.15, 0, TAU);
    ctx.fillStyle = withAlpha(h.color, 0.22);
    ctx.fill();
    ctx.strokeStyle = h.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let i = 0; i < shown; i++) {
      const a = i * 2.39996;
      const t = Math.sqrt((i + 0.5) / shown) * R * 0.6;
      this.drawShell(p.x + Math.cos(a) * t, p.y + Math.sin(a) * t, size, a);
    }
    const bx = p.x + R * 1.05;
    const by = p.y - R * 0.95;
    const fs = Math.round(Math.max(11, size * 2.4));
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
      ctx.arc(s.x + s.vx * t, s.y + s.vy * t + 0.00018 * t * t, s.size * (1 - k * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of this.floaters) {
      const t = (this.clock - f.t0) / f.dur;
      const rise = easeOut(clamp01(t * 1.4)) * 26;
      const pop = t < 0.12 ? 0.7 + (t / 0.12) * 0.4 : t < 0.2 ? 1.1 - ((t - 0.12) / 0.08) * 0.1 : 1;
      const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      ctx.globalAlpha = alpha;
      this.chip(f.text, f.x, f.y - rise, f.color, '#2a1606', Math.round(14 * f.size * pop));
      ctx.globalAlpha = 1;
    }
  }

  private drawShell(x: number, y: number, size: number, rot: number) {
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
    ctx.setTransform(c * d, s * d, -s * d, c * d, t.e + x * d, t.f + y * d);
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

  /** The board itself: a carved, boat-shaped plank. Drawn once per resize. */
  private paintBase(): HTMLCanvasElement {
    const { width: w, height: h, slots, orientation } = this.layout;
    const d = this.dpr;
    const c = document.createElement('canvas');
    c.width = Math.round(w * d);
    c.height = Math.round(h * d);
    const x = c.getContext('2d')!;
    x.scale(d, d);
    const p = this.pal;
    const portrait = orientation === 'portrait';

    const hull = () => {
      x.beginPath();
      if (!portrait) {
        const m = h * 0.04;
        const bow = h * 0.05;
        x.moveTo(w * 0.005, h / 2);
        x.bezierCurveTo(w * 0.005, m + bow, w * 0.04, m, w * 0.12, m);
        x.quadraticCurveTo(w / 2, m - bow, w * 0.88, m);
        x.bezierCurveTo(w * 0.96, m, w * 0.995, m + bow, w * 0.995, h / 2);
        x.bezierCurveTo(w * 0.995, h - m - bow, w * 0.96, h - m, w * 0.88, h - m);
        x.quadraticCurveTo(w / 2, h - m + bow, w * 0.12, h - m);
        x.bezierCurveTo(w * 0.04, h - m, w * 0.005, h - m - bow, w * 0.005, h / 2);
      } else {
        const m = w * 0.04;
        const bow = w * 0.05;
        x.moveTo(w / 2, h * 0.004);
        x.bezierCurveTo(w - m - bow, h * 0.004, w - m, h * 0.03, w - m, h * 0.09);
        x.quadraticCurveTo(w - m + bow, h / 2, w - m, h * 0.91);
        x.bezierCurveTo(w - m, h * 0.97, w - m - bow, h * 0.996, w / 2, h * 0.996);
        x.bezierCurveTo(m + bow, h * 0.996, m, h * 0.97, m, h * 0.91);
        x.quadraticCurveTo(m - bow, h / 2, m, h * 0.09);
        x.bezierCurveTo(m, h * 0.03, m + bow, h * 0.004, w / 2, h * 0.004);
      }
      x.closePath();
    };

    // Shadow on the mat.
    x.save();
    x.shadowColor = 'rgba(0,0,0,0.55)';
    x.shadowBlur = 22;
    x.shadowOffsetY = 10;
    hull();
    x.fillStyle = p.woodLo;
    x.fill();
    x.restore();

    // Wood body.
    const grad = portrait ? x.createLinearGradient(0, 0, w, 0) : x.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, p.woodHi);
    grad.addColorStop(0.45, p.wood);
    grad.addColorStop(1, p.woodLo);
    hull();
    x.fillStyle = grad;
    x.fill();

    // Grain: long, slightly wavy strokes, seeded so they don't change between resizes.
    x.save();
    hull();
    x.clip();
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const lines = 26;
    for (let i = 0; i < lines; i++) {
      const t = (i + rnd() * 0.6) / lines;
      x.beginPath();
      x.lineWidth = 0.6 + rnd() * 1.4;
      x.strokeStyle = `rgba(30,12,2,${0.05 + rnd() * 0.08})`;
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
    // A couple of knots.
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
    x.restore();

    // Carved rim: a light edge on top, a dark inset line.
    hull();
    x.strokeStyle = 'rgba(255,220,170,0.18)';
    x.lineWidth = 2;
    x.stroke();
    x.save();
    hull();
    x.clip();
    x.translate(w / 2, h / 2);
    x.scale(0.975, portrait ? 0.988 : 0.94);
    x.translate(-w / 2, -h / 2);
    hull();
    x.strokeStyle = 'rgba(30,12,2,0.35)';
    x.lineWidth = 1.5;
    x.stroke();
    x.restore();

    // Capiz inlays down the centre line, between the columns of houses.
    const inlay = (cx: number, cy: number, s: number) => {
      x.beginPath();
      x.moveTo(cx, cy - s);
      x.lineTo(cx + s * 0.62, cy);
      x.lineTo(cx, cy + s);
      x.lineTo(cx - s * 0.62, cy);
      x.closePath();
      const ig = x.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
      ig.addColorStop(0, 'rgba(255,248,230,0.75)');
      ig.addColorStop(0.5, 'rgba(200,225,235,0.55)');
      ig.addColorStop(1, 'rgba(255,230,200,0.6)');
      x.fillStyle = ig;
      x.fill();
      x.strokeStyle = 'rgba(40,18,6,0.5)';
      x.lineWidth = 0.8;
      x.stroke();
    };
    const near = this.human === 0 ? 0 : 8;
    for (let k = 0; k < 6; k++) {
      const a = slots[near + k]!;
      const b = slots[near + k + 1]!;
      const s = Math.max(3, a.r * 0.13);
      if (!portrait) inlay((a.x + b.x) / 2, h / 2, s);
      else inlay(w / 2, (a.y + b.y) / 2, s);
    }

    // Pits: carved cups lit from above.
    for (let i = 0; i < 16; i++) {
      const g = slots[i]!;
      x.save();
      x.beginPath();
      x.ellipse(g.x, g.y + 1.5, g.r + 1.5, g.ry + 1.5, 0, 0, TAU);
      x.fillStyle = 'rgba(255,215,160,0.16)';
      x.fill();
      x.beginPath();
      x.ellipse(g.x, g.y, g.r, g.ry, 0, 0, TAU);
      const pg = x.createRadialGradient(
        g.x,
        g.y + g.ry * 0.25,
        Math.min(g.r, g.ry) * 0.15,
        g.x,
        g.y,
        Math.max(g.r, g.ry),
      );
      pg.addColorStop(0, p.pit);
      pg.addColorStop(0.75, 'rgba(22,8,2,0.95)');
      pg.addColorStop(1, 'rgba(10,3,0,1)');
      x.fillStyle = pg;
      x.fill();
      x.clip();
      // Inner shadow along the upper lip.
      x.beginPath();
      x.ellipse(g.x, g.y - g.ry * 0.35, g.r * 1.1, g.ry * 0.9, 0, 0, TAU);
      x.lineWidth = Math.min(g.r, g.ry) * 0.35;
      x.strokeStyle = 'rgba(0,0,0,0.35)';
      x.stroke();
      x.restore();
    }
    return c;
  }
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
