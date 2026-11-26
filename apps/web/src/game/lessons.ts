/**
 * The interactive tutorial: five short lessons, each a real position where the
 * player makes one move and watches it play out. Positions are plain data so the
 * unit tests can check every lesson against the engine; the copy can never drift
 * from what the move actually does.
 *
 * In every lesson the player is A. Directions in the copy are written as {first},
 * {onward} and {store} and filled in for the board's orientation by lessonCopy().
 */
import type { Orientation } from '../board/layout';

export interface Lesson {
  readonly id: string;
  /** The Tagalog word for the idea, shown big. */
  readonly word: string;
  /** Plain English title. */
  readonly title: string;
  readonly slots: readonly number[];
  /** The house to play (engine index). */
  readonly house: number;
  /** Shown before the move. */
  readonly prompt: string;
  /** Shown after the move. */
  readonly debrief: string;
  /** What the move must do; tests hold the lesson to it. */
  readonly expect: {
    readonly extraTurn: boolean;
    readonly relays: number;
    readonly captured: number;
    readonly endsGame: boolean;
  };
}

const START = [7, 7, 7, 7, 7, 7, 7, 0, 7, 7, 7, 7, 7, 7, 7, 0];

export const LESSONS: readonly Lesson[] = [
  {
    id: 'sow',
    word: 'Hasik',
    title: 'Sow',
    slots: START,
    house: 0,
    prompt:
      'Every house starts with 7 shells. Tap your first house, {first}. You scoop up its shells and drop one into each pit {onward}.',
    debrief:
      'The last shell fell into your ulo, the big store {store}. Ending there earns you another turn. Isa pa!',
    expect: { extraTurn: true, relays: 0, captured: 0, endsGame: false },
  },
  {
    id: 'relay',
    word: 'Tuloy',
    title: 'Keep going',
    slots: [0, 0, 0, 2, 0, 2, 0, 40, 0, 5, 6, 4, 5, 6, 4, 24],
    house: 3,
    prompt: 'Play house 4 and keep your eye on where its last shell lands.',
    debrief:
      'It landed in a house that already had shells, so you scooped those up and kept sowing. That run ended in an empty house on their side, which ends your turn.',
    expect: { extraTurn: false, relays: 1, captured: 0, endsGame: false },
  },
  {
    id: 'capture',
    word: 'Kain',
    title: 'Capture',
    slots: [2, 0, 0, 3, 1, 0, 2, 30, 3, 2, 4, 1, 7, 2, 5, 36],
    house: 0,
    prompt:
      'Your third house is empty and the house across from it holds 7. Play house 1 so your last shell lands in that empty house.',
    debrief:
      'Kain! Your last shell landed in an empty house on your side, so you took it and all 7 shells across from it. That is 8 into your ulo.',
    expect: { extraTurn: false, relays: 0, captured: 8, endsGame: false },
  },
  {
    id: 'preview',
    word: 'Silip',
    title: 'Look first',
    slots: START,
    house: 1,
    prompt:
      'Long moves are hard to count in your head, so Hasik counts for you. Point at house 2 (on a phone, tap it once) to see where it ends. Then play it.',
    debrief:
      'It relayed once, wrapped all the way around and captured 9. The beads showed every pit it would touch before you committed.',
    expect: { extraTurn: false, relays: 1, captured: 9, endsGame: false },
  },
  {
    id: 'end',
    word: 'Tapos',
    title: 'Finish',
    slots: [0, 0, 0, 0, 0, 0, 1, 49, 2, 0, 3, 1, 0, 2, 4, 36],
    house: 6,
    prompt: 'One shell left on your side. Play house 7.',
    debrief:
      'Your row is empty, so the game ends. Shells still on a row go to that row’s owner, so they get 12 more: 50 to 48. There are 98 shells, so 50 always wins.',
    expect: { extraTurn: false, relays: 0, captured: 0, endsGame: true },
  },
];

const WHERE: Readonly<Record<Orientation, Readonly<Record<string, string>>>> = {
  landscape: { first: 'the one on the far left', onward: 'to its right', store: 'on the right' },
  portrait: { first: 'the top one on the left', onward: 'below it', store: 'at the bottom' },
};

/** Fill in the direction words for how the board is turned. */
export function lessonCopy(text: string, orientation: Orientation): string {
  return text.replace(/\{(\w+)\}/g, (m, key: string) => WHERE[orientation][key] ?? m);
}
