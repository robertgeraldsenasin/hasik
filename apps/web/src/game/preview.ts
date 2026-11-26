/**
 * Move preview: what a house would do if you played it now. Pure and DOM-free, so
 * the board can show it on hover or keyboard focus and tests can pin it down.
 */
import { type GameState, applyMoveTraced, storeOf } from '@hasik/engine';
import { houseNumber } from './notation';

export interface MovePreview {
  readonly house: number;
  /** Slot the last shell lands in (a house or the mover's store). */
  readonly landing: number;
  readonly extraTurn: boolean;
  readonly captured: number;
  /** Times the sowing picks up again from a non-empty house. */
  readonly relays: number;
  readonly drops: number;
  /** Shells the mover's store gains, captures included. */
  readonly storeGain: number;
  readonly endsGame: boolean;
  /** Every slot a shell is dropped into, in order (relays included). */
  readonly path: readonly number[];
  /** Houses where the sowing scoops up again and carries on. */
  readonly relaySlots: readonly number[];
  /** One line for the UI, written from the mover's point of view. */
  readonly text: string;
}

export function previewMove(state: GameState, house: number): MovePreview {
  const r = applyMoveTraced(state, house);
  const store = storeOf(state.toMove);
  let landing = house;
  let relays = 0;
  const path: number[] = [];
  const relaySlots: number[] = [];
  for (const e of r.events) {
    if (e.kind === 'drop') {
      landing = e.slot;
      path.push(e.slot);
    } else if (e.kind === 'pickup' && e.relay) {
      relays++;
      relaySlots.push(e.slot);
    }
  }
  const storeGain = (r.state.slots[store] as number) - (state.slots[store] as number);
  const endsGame = r.state.over;
  const extraTurn = r.extraTurn && !endsGame;
  const bits = [`House ${houseNumber(house)}: ${state.slots[house]} shells`];
  if (landing === store) bits.push('last shell lands in your store');
  if (extraTurn) bits.push('extra turn');
  if (relays > 0) bits.push(`keeps sowing ${relays === 1 ? 'once more' : `${relays} more times`}`);
  if (r.captured > 0) bits.push(`captures ${r.captured}`);
  bits.push(storeGain > 0 ? `+${storeGain} to your store` : 'nothing to your store');
  if (endsGame) bits.push('ends the game');
  return {
    house,
    landing,
    extraTurn,
    captured: r.captured,
    relays,
    drops: r.sowSteps,
    storeGain,
    endsGame,
    path,
    relaySlots,
    text: bits.join(' · '),
  };
}
