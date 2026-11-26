/**
 * Everything the play page keeps in localStorage: settings, the game in progress
 * (so a reload or a closed tab doesn't lose it) and the win/draw/loss record.
 *
 * Storage is untrusted input: another version of the app, a browser extension or
 * the user may have changed it. Every parser here validates the shape and falls
 * back to safe defaults instead of throwing, and a saved game is only restored if
 * every move in it is legal when replayed through the engine.
 */
import { type GameState, type Player, applyMove, initialState, isLegalMove } from '@hasik/engine';

export const KEYS = {
  settings: 'hasik:settings',
  game: 'hasik:game',
  record: 'hasik:record',
} as const;

export interface Settings {
  readonly opponentId: string;
  readonly human: Player;
  readonly speed: string;
  readonly sound: boolean;
  /** The how-to-play dialog opens by itself only on the first visit. */
  readonly seenHelp: boolean;
  /** 'tilt' is the 2.5D table view, 'flat' looks straight down at the board. */
  readonly view: 'tilt' | 'flat';
}

export interface SavedGame {
  readonly v: 1;
  readonly seed: number;
  readonly opponentId: string;
  readonly human: Player;
  readonly moves: readonly number[];
  /** Hints or undo were used: the game doesn't count toward the record. */
  readonly assisted: boolean;
}

export interface Tally {
  readonly w: number;
  readonly d: number;
  readonly l: number;
  /** Current run of wins (0 after a draw or loss). */
  readonly streak: number;
}
export type RecordBook = Readonly<Record<string, Tally>>;
export type Outcome = 'win' | 'draw' | 'loss';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function parseSettings(
  text: string | null,
  defaults: Settings,
  opponentIds: readonly string[],
  speeds: readonly string[],
): Settings {
  const raw = parseJson(text);
  if (!isObj(raw)) return defaults;
  return {
    opponentId:
      typeof raw.opponentId === 'string' && opponentIds.includes(raw.opponentId)
        ? raw.opponentId
        : defaults.opponentId,
    human: raw.human === 0 || raw.human === 1 ? raw.human : defaults.human,
    speed: typeof raw.speed === 'string' && speeds.includes(raw.speed) ? raw.speed : defaults.speed,
    sound: typeof raw.sound === 'boolean' ? raw.sound : defaults.sound,
    seenHelp: typeof raw.seenHelp === 'boolean' ? raw.seenHelp : defaults.seenHelp,
    view: raw.view === 'tilt' || raw.view === 'flat' ? raw.view : defaults.view,
  };
}

export function parseSavedGame(
  text: string | null,
  opponentIds: readonly string[],
): SavedGame | null {
  const raw = parseJson(text);
  if (!isObj(raw) || raw.v !== 1) return null;
  const { seed, opponentId, human, moves, assisted } = raw;
  if (!Number.isInteger(seed) || (seed as number) < 0 || (seed as number) > 0xffffffff) return null;
  if (typeof opponentId !== 'string' || !opponentIds.includes(opponentId)) return null;
  if (human !== 0 && human !== 1) return null;
  if (!Array.isArray(moves) || moves.length > 2000) return null;
  if (!moves.every((m) => Number.isInteger(m))) return null;
  return {
    v: 1,
    seed: seed as number,
    opponentId,
    human,
    moves: moves as number[],
    assisted: assisted === true,
  };
}

/**
 * Replay moves from the opening position. Returns every position (positions[i] is
 * the one before moves[i]; the last is the current one), or null if any move is
 * illegal, which means the saved game is corrupt and must be discarded.
 */
export function replay(moves: readonly number[]): GameState[] | null {
  const positions = [initialState()];
  for (const m of moves) {
    const s = positions[positions.length - 1]!;
    if (!isLegalMove(s, m)) return null;
    positions.push(applyMove(s, m).state);
  }
  return positions;
}

/**
 * Where "undo" goes: the latest position before the end of the game record in
 * which the human was to move. Undoing therefore takes back the human's last move
 * together with any bot replies after it. Returns null if there is nothing to undo.
 */
export function undoTarget(positions: readonly GameState[], human: Player): number | null {
  for (let i = positions.length - 2; i >= 0; i--) {
    if (positions[i]!.toMove === human) return i;
  }
  return null;
}

export function parseRecord(text: string | null): RecordBook {
  const raw = parseJson(text);
  if (!isObj(raw)) return {};
  const out: Record<string, Tally> = {};
  for (const [id, t] of Object.entries(raw)) {
    if (!isObj(t) || !isCount(t.w) || !isCount(t.d) || !isCount(t.l)) continue;
    out[id] = { w: t.w, d: t.d, l: t.l, streak: isCount(t.streak) ? t.streak : 0 };
  }
  return out;
}

export function addResult(book: RecordBook, id: string, outcome: Outcome): RecordBook {
  const t = book[id] ?? { w: 0, d: 0, l: 0, streak: 0 };
  const next: Tally =
    outcome === 'win'
      ? { ...t, w: t.w + 1, streak: t.streak + 1 }
      : outcome === 'draw'
        ? { ...t, d: t.d + 1, streak: 0 }
        : { ...t, l: t.l + 1, streak: 0 };
  return { ...book, [id]: next };
}

/** localStorage that never throws (private mode, sandboxed iframes, full quota). */
export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* not kept: the game still works, it just won't survive a reload */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
