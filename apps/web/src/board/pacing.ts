/**
 * How long a move takes to animate. Pure, so tests can pin the numbers down.
 *
 * Measured with the engine (docs/design/ui-research.md): the median move drops 6
 * shells, but one move in ten drops 37 to 48 and relays can run past 130. A fixed
 * delay per shell makes those long moves crawl for 10 to 20 seconds. Instead each
 * move gets a time budget: the first few drops are slow enough to follow, later
 * drops speed up, and no move's sowing takes much more than three seconds at
 * normal speed. Players can still fast-forward any move by tapping the board.
 */
export const SPEEDS = ['slow', 'normal', 'fast', 'instant'] as const;
export type Speed = (typeof SPEEDS)[number];

/** Multiplier on every duration. 0 means no animation at all. */
export const SPEED_SCALE: Readonly<Record<Speed, number>> = {
  slow: 1.7,
  normal: 1,
  fast: 0.45,
  instant: 0,
};

/** Fast-forward multiplier applied to the scene clock when the player taps to skip. */
export const SKIP_TIMESCALE = 8;

const PER_DROP_MS = 115;
const BUDGET_MS = 2600;
const MIN_DROP_MS = 26;
const MAX_DROP_MS = 175;

/** Milliseconds from each drop to the next, for a move of `drops` shells. */
export function dropSchedule(drops: number, scale: number): number[] {
  if (drops <= 0) return [];
  if (scale <= 0) return new Array<number>(drops).fill(0);
  const weights = Array.from({ length: drops }, (_, k) => 1 + 1.6 * Math.exp(-k / 5));
  const total = weights.reduce((a, b) => a + b, 0);
  const base = Math.min(drops * PER_DROP_MS, BUDGET_MS) / total;
  return weights.map((w) =>
    Math.round(Math.min(MAX_DROP_MS, Math.max(MIN_DROP_MS, base * w)) * scale),
  );
}

/**
 * Pause when the hand scoops shells up. The opening scoop and the first relay get a
 * beat so the player sees where sowing restarts; later relays in a long chain shorten.
 */
export function pickupPause(relayIndex: number, scale: number): number {
  if (scale <= 0) return 0;
  const ms = relayIndex === 0 ? 240 : Math.max(110, 320 - 40 * relayIndex);
  return Math.round(ms * scale);
}

/** The beat before captured shells fly to the store, and their flight. */
export function capturePause(scale: number): { beat: number; flight: number; stagger: number } {
  return {
    beat: Math.round(260 * scale),
    flight: Math.round(420 * scale),
    stagger: Math.round(28 * scale),
  };
}

/** Rough total for a move, used by tests and to decide when to offer fast-forward. */
export function estimateMoveMs(drops: number, relays: number, scale: number): number {
  let ms = pickupPause(0, scale);
  for (let r = 1; r <= relays; r++) ms += pickupPause(r, scale);
  for (const d of dropSchedule(drops, scale)) ms += d;
  return ms;
}
