/**
 * Canvas 2D board renderer. Framework-free on purpose: it only knows how to draw
 * a frame from plain data, so it is easy to reason about and fast.
 * All art is drawn procedurally (no images): an original look, not borrowed.
 */
import { type BoardLayout, computeLayout, shellOffsets } from './layout';

export interface Frame {
  readonly slots: ArrayLike<number>;
  /** Houses the human may click now. */
  readonly playable: ReadonlySet<number>;
  readonly hover: number | null;
  /** Slot being sown into during an animation. */
  readonly active: number | null;
  /** Shells currently in hand during an animation. */
  readonly hand: number;
  /** House the last move started from. */
  readonly lastMove: number | null;
  readonly captureFlash: ReadonlySet<number>;
}

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export class BoardRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  layout: BoardLayout;
  private flip = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.layout = computeLayout(800, false);
  }

  /** Match the canvas to its CSS size and the screen's pixel density. */
  resize(cssWidth: number, flip: boolean): void {
    this.flip = flip;
    this.layout = computeLayout(Math.max(280, Math.floor(cssWidth)), flip);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.layout.width * dpr);
    this.canvas.height = Math.round(this.layout.height * dpr);
    this.canvas.style.width = `${this.layout.width}px`;
    this.canvas.style.height = `${this.layout.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  get flipped(): boolean {
    return this.flip;
  }

  draw(f: Frame): void {
    const { ctx } = this;
    const { width: w, height: h, slots } = this.layout;
    const wood = css('--wood', '#9a5b2e');
    const woodDark = css('--wood-dark', '#6e3b1a');
    const pit = css('--pit', '#4a2611');
    const accent = css('--accent', '#f2b705');
    const ink = css('--board-ink', '#fff7e6');

    ctx.clearRect(0, 0, w, h);

    // Board body: a rounded, boat-like plank with a subtle grain gradient.
    const pad = w * 0.012;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, wood);
    grad.addColorStop(1, woodDark);
    ctx.fillStyle = grad;
    roundRect(ctx, pad, pad, w - 2 * pad, h - 2 * pad, h * 0.42);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#000';
    for (let i = 1; i < 9; i++) {
      ctx.beginPath();
      const y = pad + ((h - 2 * pad) * i) / 9;
      ctx.moveTo(w * 0.12, y + Math.sin(i) * 3);
      ctx.bezierCurveTo(w * 0.4, y - 4, w * 0.6, y + 4, w * 0.88, y + Math.cos(i) * 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (let i = 0; i < 16; i++) {
      const g = slots[i]!;
      const n = f.slots[i] as number;
      // Pit.
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, g.r, g.ry, 0, 0, Math.PI * 2);
      const pg = ctx.createRadialGradient(
        g.x,
        g.y - g.ry * 0.3,
        g.r * 0.1,
        g.x,
        g.y,
        Math.max(g.r, g.ry),
      );
      pg.addColorStop(0, pit);
      pg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = pg;
      ctx.fill();

      const isPlayable = f.playable.has(i);
      if (isPlayable) {
        ctx.lineWidth = i === f.hover ? 4 : 2;
        ctx.strokeStyle = i === f.hover ? accent : 'rgba(242,183,5,0.55)';
        ctx.stroke();
      }
      if (i === f.lastMove) {
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = ink;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (i === f.active || f.captureFlash.has(i)) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = f.captureFlash.has(i) ? '#ff6b4a' : accent;
        ctx.stroke();
      }

      // Shells.
      const shown = Math.min(n, g.kind === 'store' ? 60 : 24);
      const size = Math.max(3, g.r * (g.kind === 'store' ? 0.13 : 0.17));
      const spread = (g.kind === 'store' ? Math.min(g.r, g.ry) : g.r) * 0.62;
      for (const o of shellOffsets(i, shown, spread)) {
        const sy = g.kind === 'store' ? o.dy * (g.ry / g.r) * 0.9 : o.dy;
        drawShell(ctx, g.x + o.dx, g.y + sy, size, o.rot);
      }

      // Count label.
      ctx.fillStyle = ink;
      ctx.font = `600 ${Math.round(Math.max(12, g.r * 0.36))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (g.kind === 'store') {
        // Store totals sit on a dark pill at the bottom of the store so they stay readable.
        const py = g.y + g.ry * 0.78;
        const pw = Math.max(28, g.r * 1.1);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        roundRect(ctx, g.x - pw / 2, py - 12, pw, 24, 12);
        ctx.fill();
        ctx.fillStyle = ink;
        ctx.fillText(String(n), g.x, py + 1);
      } else {
        // House counts sit outside the pit: above the top row, below the bottom row.
        const labelY = g.y < h / 2 ? g.y - g.r - h * 0.045 : g.y + g.r + h * 0.05;
        ctx.fillText(String(n), g.x, labelY);
      }
    }

    // Shells in hand during sowing.
    if (f.active !== null && f.hand > 0) {
      const g = slots[f.active]!;
      const bx = g.x + g.r * 0.9;
      const by = g.y - g.ry * 0.9;
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(12, g.r * 0.32), 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.fillStyle = '#2a1606';
      ctx.font = `700 ${Math.round(Math.max(11, g.r * 0.3))}px system-ui, sans-serif`;
      ctx.fillText(String(f.hand), bx, by + 1);
    }
  }
}

function drawShell(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * 0.68, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(-s * 0.3, -s * 0.3, s * 0.1, 0, 0, s);
  g.addColorStop(0, '#fffaf0');
  g.addColorStop(1, '#d9c7a3');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,50,20,0.45)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // The cowrie's slit.
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, 0);
  ctx.quadraticCurveTo(0, s * 0.12, s * 0.55, 0);
  ctx.strokeStyle = 'rgba(90,60,30,0.6)';
  ctx.stroke();
  ctx.restore();
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
