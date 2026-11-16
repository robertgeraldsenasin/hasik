import { describe, expect, it } from 'vitest';
import {
  type GameState,
  STORE_A,
  applyMove,
  fromSlots,
  initialState,
  legalMoves,
} from '@hasik/engine';
import { WIN_SCORE } from '@hasik/bots';
import { shareText, shortScore, statsFor, describeMove } from '../src/game/notation';
import { previewMove } from '../src/game/preview';
import {
  type Settings,
  addResult,
  parseRecord,
  parseSavedGame,
  parseSettings,
  replay,
  undoTarget,
} from '../src/game/save';
import { analyzePosition } from '../src/worker/analyze';

/** A deterministic sequence of positions from a simple self-play, for property checks. */
function playout(n: number, salt: number): GameState[] {
  const out = [initialState()];
  let s = out[0]!;
  for (let i = 0; i < n && !s.over; i++) {
    const moves = legalMoves(s);
    s = applyMove(s, moves[(i * 7 + salt) % moves.length]!).state;
    out.push(s);
  }
  return out;
}

describe('move preview', () => {
  it('describes the classic opening moves', () => {
    const a1 = previewMove(initialState(), 0);
    expect(a1).toMatchObject({ landing: STORE_A, extraTurn: true, captured: 0, storeGain: 1 });
    expect(a1.text).toContain('extra turn');
    const a2 = previewMove(initialState(), 1);
    expect(a2).toMatchObject({
      landing: 1,
      extraTurn: false,
      captured: 9,
      relays: 1,
      storeGain: 10,
    });
    expect(a2.text).toBe(
      'House 2: 7 shells · keeps sowing once more · captures 9 · +10 to your store',
    );
  });

  it('agrees with the engine on every legal move of many positions', () => {
    for (let salt = 0; salt < 6; salt++) {
      for (const s of playout(60, salt)) {
        for (const m of legalMoves(s)) {
          const p = previewMove(s, m);
          const r = applyMove(s, m);
          const store = s.toMove === 0 ? 7 : 15;
          expect(p.storeGain).toBe((r.state.slots[store] as number) - (s.slots[store] as number));
          expect(p.captured).toBe(r.captured);
          expect(p.extraTurn).toBe(r.extraTurn && !r.state.over);
          expect(p.endsGame).toBe(r.state.over);
          expect(p.drops).toBe(r.sowSteps);
        }
      }
    }
  });
});

describe('saved settings', () => {
  const defaults: Settings = {
    opponentId: 'level-3',
    human: 0,
    speed: 'normal',
    sound: true,
    seenHelp: false,
  };
  const ids = ['level-1', 'level-3', 'mcts'];
  const speeds = ['slow', 'normal', 'instant'];

  it('falls back to defaults for missing or broken storage', () => {
    for (const text of [null, '', '{', '[]', '42', 'null'])
      expect(parseSettings(text, defaults, ids, speeds)).toEqual(defaults);
  });
  it('keeps valid fields and replaces invalid ones one by one', () => {
    const text = JSON.stringify({
      opponentId: 'mcts',
      human: 7,
      speed: 'warp',
      sound: false,
      seenHelp: 'yes',
    });
    expect(parseSettings(text, defaults, ids, speeds)).toEqual({
      ...defaults,
      opponentId: 'mcts',
      sound: false,
    });
  });
});

describe('saved games', () => {
  const ids = ['level-3'];
  const valid = { v: 1, seed: 42, opponentId: 'level-3', human: 1, moves: [0, 1], assisted: true };

  it('accepts a well-formed game', () => {
    expect(parseSavedGame(JSON.stringify(valid), ids)).toEqual(valid);
  });
  it('rejects anything malformed', () => {
    const bad = [
      { ...valid, v: 2 },
      { ...valid, seed: -1 },
      { ...valid, seed: 1.5 },
      { ...valid, opponentId: 'level-9' },
      { ...valid, human: 2 },
      { ...valid, moves: 'nope' },
      { ...valid, moves: [0, 'x'] },
      { ...valid, moves: new Array(2001).fill(0) },
    ];
    for (const g of bad) expect(parseSavedGame(JSON.stringify(g), ids)).toBeNull();
    expect(parseSavedGame('{"v":1', ids)).toBeNull();
    expect(parseSavedGame(null, ids)).toBeNull();
  });
  it('replays legal moves and refuses illegal ones', () => {
    const ok = replay([0, 1]);
    expect(ok).toHaveLength(3);
    expect(ok![2]).toEqual(applyMove(applyMove(initialState(), 0).state, 1).state);
    expect(replay([0, 0])).toBeNull(); // house A1 is empty after it is played
    expect(replay([8])).toBeNull(); // B cannot move first
    expect(replay([99])).toBeNull();
  });
});

describe('undo', () => {
  it('goes back to the latest earlier position with the human to move', () => {
    const p = replay([0, 1])!; // A1 gives A an extra turn, so A moves twice
    expect(undoTarget(p, 0)).toBe(1);
    expect(undoTarget(p.slice(0, 2), 0)).toBe(0);
    expect(undoTarget(p.slice(0, 1), 0)).toBeNull();
    // Playing B: the bot's opening moves alone leave nothing to undo.
    const botOnly = replay([0, 1])!;
    expect(undoTarget(botOnly, 1)).toBeNull();
  });
  it('takes back the human move together with the bot replies after it', () => {
    const afterA2 = replay([1])!; // A2 ends A's turn, then B moves
    expect(afterA2[1]!.toMove).toBe(1);
    const p = replay([1, legalMoves(afterA2[1]!)[0]!])!;
    expect(undoTarget(p, 0)).toBe(0);
  });
});

describe('record book', () => {
  it('ignores malformed entries', () => {
    const text = JSON.stringify({
      a: { w: 1, d: 0, l: 2 },
      b: { w: -1, d: 0, l: 0 },
      c: 'x',
      d: { w: 1, d: 1, l: 1, streak: 3 },
    });
    expect(parseRecord(text)).toEqual({
      a: { w: 1, d: 0, l: 2, streak: 0 },
      d: { w: 1, d: 1, l: 1, streak: 3 },
    });
    expect(parseRecord('nope')).toEqual({});
  });
  it('counts results and win streaks', () => {
    let book = addResult({}, 'x', 'win');
    book = addResult(book, 'x', 'win');
    expect(book.x).toEqual({ w: 2, d: 0, l: 0, streak: 2 });
    book = addResult(book, 'x', 'draw');
    expect(book.x).toEqual({ w: 2, d: 1, l: 0, streak: 0 });
    book = addResult(book, 'x', 'loss');
    expect(book.x).toEqual({ w: 2, d: 1, l: 1, streak: 0 });
  });
});

describe('notation helpers', () => {
  it('formats hint chips', () => {
    expect(shortScore(240)).toBe('+2.4');
    expect(shortScore(-1234)).toBe('−12.3');
    expect(shortScore(3)).toBe('±0');
    expect(shortScore(WIN_SCORE + 6)).toBe('win +6');
    expect(shortScore(-WIN_SCORE - 3)).toBe('lose −3');
  });
  it('sums per-player stats from the log', () => {
    const moves = [1];
    moves.push(legalMoves(replay(moves)!.at(-1)!)[0]!);
    const p = replay(moves)!;
    const results = moves.map((m, i) => applyMove(p[i]!, m));
    const log = moves.map((m, i) => describeMove(i + 1, p[i]!.toMove, 'x', m, results[i]!));
    expect(statsFor(log, 0)).toEqual({ moves: 1, captured: 9, extraTurns: 0, longestMove: 15 });
    const b = statsFor(log, 1);
    expect(b.moves).toBe(1);
    expect(b.captured).toBe(results[1]!.captured);
    expect(b.longestMove).toBe(results[1]!.sowSteps);
  });
  it('writes share text for each outcome', () => {
    expect(shareText('win', 50, 48, 'Hari', 'u')).toBe(
      'I beat Hari at Sungka, 50–48. Play Hasik: u',
    );
    expect(shareText('loss', 40, 58, 'Hari', 'u')).toContain('Hari beat me at Sungka, 58–40');
    expect(shareText('draw', 49, 49, 'Hari', 'u')).toContain('I drew Hari');
  });
});

describe('hint analysis', () => {
  it('scores every legal move once, best first', () => {
    const s = initialState();
    const a = analyzePosition(s, 'minimax:depth=2', 1);
    expect(a.moves.map((m) => m.move).sort()).toEqual(legalMoves(s));
    for (let i = 1; i < a.moves.length; i++)
      expect(a.moves[i - 1]!.score).toBeGreaterThanOrEqual(a.moves[i]!.score);
    expect(a.nodes).toBeGreaterThan(0);
  });

  it('scores a game-ending move exactly, from the mover’s side', () => {
    // A has one shell, next to its store: playing it ends the game.
    // A finishes with 41, B with 56 + 1 = 57, so A loses by 16.
    const slots = [0, 0, 0, 0, 0, 0, 1, 40, 8, 8, 8, 8, 8, 8, 8, 1];
    const s = fromSlots(slots, 0);
    const a = analyzePosition(s, 'minimax:depth=2', 1);
    expect(a.moves).toEqual([{ move: 6, score: -(WIN_SCORE + 16) }]);
  });

  it('matches a direct search of each child position', () => {
    const s = playout(10, 3).at(-1)!;
    const a = analyzePosition(s, 'greedy', 1);
    expect(a.moves).toHaveLength(legalMoves(s).length);
  });
});
