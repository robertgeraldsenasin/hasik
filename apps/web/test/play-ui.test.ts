import { describe, expect, it } from 'vitest';
import {
  TOTAL_SHELLS,
  applyMove,
  applyMoveTraced,
  fromSlots,
  initialState,
  isLegalMove,
  legalMoves,
} from '@hasik/engine';
import {
  SPEEDS,
  SPEED_SCALE,
  capturePause,
  dropSchedule,
  estimateMoveMs,
  pickupPause,
} from '../src/board/pacing';
import { LESSONS, lessonCopy } from '../src/game/lessons';
import { previewMove } from '../src/game/preview';

describe('animation pacing', () => {
  it('gives the first drops time to be followed and never slows down', () => {
    for (const n of [1, 6, 15, 48, 137, 250]) {
      const d = dropSchedule(n, 1);
      expect(d).toHaveLength(n);
      for (let k = 1; k < n; k++) expect(d[k]!).toBeLessThanOrEqual(d[k - 1]!);
      expect(d[0]!).toBeGreaterThanOrEqual(26);
      expect(d[0]!).toBeLessThanOrEqual(175);
    }
    expect(dropSchedule(6, 1)[0]!).toBeGreaterThanOrEqual(100);
  });

  it('keeps long relays to a few seconds at normal speed', () => {
    // One move in ten drops 37 to 48 shells; the longest measured ran past 130.
    expect(estimateMoveMs(6, 0, 1)).toBeLessThan(1100);
    expect(estimateMoveMs(48, 3, 1)).toBeLessThan(3800);
    expect(estimateMoveMs(137, 8, 1)).toBeLessThan(6500);
  });

  it('scales with the speed setting and switches off at instant', () => {
    expect(SPEEDS).toEqual(['slow', 'normal', 'fast', 'instant']);
    expect(estimateMoveMs(20, 1, SPEED_SCALE.slow)).toBeGreaterThan(estimateMoveMs(20, 1, 1));
    expect(estimateMoveMs(20, 1, SPEED_SCALE.fast)).toBeLessThan(estimateMoveMs(20, 1, 1));
    expect(dropSchedule(12, SPEED_SCALE.instant)).toEqual(new Array(12).fill(0));
    expect(pickupPause(0, 0)).toBe(0);
    expect(capturePause(0)).toEqual({ beat: 0, flight: 0, stagger: 0 });
    expect(dropSchedule(0, 1)).toEqual([]);
  });

  it('shortens the pause for each later relay in a chain, down to a floor', () => {
    const pauses = [1, 2, 3, 4, 5, 9].map((r) => pickupPause(r, 1));
    for (let i = 1; i < pauses.length; i++) expect(pauses[i]!).toBeLessThanOrEqual(pauses[i - 1]!);
    expect(pauses.at(-1)!).toBe(110);
  });
});

describe('move preview path', () => {
  it('lists every drop in order and every relay, exactly as the engine traces it', () => {
    let s = initialState();
    for (let ply = 0; ply < 40 && !s.over; ply++) {
      for (const m of legalMoves(s)) {
        const p = previewMove(s, m);
        const r = applyMoveTraced(s, m);
        const drops = r.events.flatMap((e) => (e.kind === 'drop' ? [e.slot] : []));
        const relays = r.events.flatMap((e) => (e.kind === 'pickup' && e.relay ? [e.slot] : []));
        expect(p.path).toEqual(drops);
        expect(p.relaySlots).toEqual(relays);
        expect(p.path.at(-1)).toBe(p.landing);
      }
      const moves = legalMoves(s);
      s = applyMove(s, moves[(ply * 5) % moves.length]!).state;
    }
  });
});

describe('tutorial lessons', () => {
  it('uses legal positions with all 98 shells and a legal move for A', () => {
    expect(LESSONS.map((l) => l.id)).toEqual(['sow', 'relay', 'capture', 'preview', 'end']);
    for (const l of LESSONS) {
      expect(l.slots.reduce((a, b) => a + b, 0)).toBe(TOTAL_SHELLS);
      const s = fromSlots(l.slots, 0);
      expect(s.over).toBe(false);
      expect(isLegalMove(s, l.house)).toBe(true);
    }
  });

  it('does exactly what each lesson says it does', () => {
    for (const l of LESSONS) {
      const p = previewMove(fromSlots(l.slots, 0), l.house);
      expect({
        extraTurn: p.extraTurn,
        relays: p.relays,
        captured: p.captured,
        endsGame: p.endsGame,
      }).toEqual(l.expect);
    }
  });

  it('ends the last lesson 50 to 48, as the debrief says', () => {
    const end = LESSONS.find((l) => l.id === 'end')!;
    const r = applyMove(fromSlots(end.slots, 0), end.house);
    expect(r.state.over).toBe(true);
    expect(end.debrief).toContain('50 to 48');
  });

  it('fills in direction words for both orientations and leaves no placeholders', () => {
    for (const l of LESSONS) {
      for (const o of ['landscape', 'portrait'] as const) {
        expect(lessonCopy(l.prompt, o)).not.toMatch(/[{}]/);
        expect(lessonCopy(l.debrief, o)).not.toMatch(/[{}]/);
      }
    }
    expect(lessonCopy('{store}', 'landscape')).toBe('on the right');
    expect(lessonCopy('{store}', 'portrait')).toBe('at the bottom');
    expect(lessonCopy('{unknown}', 'portrait')).toBe('{unknown}');
  });
});
