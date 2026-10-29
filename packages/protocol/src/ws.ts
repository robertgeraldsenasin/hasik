/**
 * WebSocket protocol for online play (milestone 2). Every client message is
 * validated with these schemas; .strict() rejects unknown fields (constraint C7).
 */
import { z } from 'zod';

const house = z.number().int().min(0).max(15);
const gameId = z.string().min(1).max(64);
const nickname = z.string().trim().min(1).max(24);

export const ClientMessage = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('join'),
      room: z.string().min(1).max(64).optional(),
      vsBot: z
        .object({ botId: z.string().min(1).max(64), level: z.number().int().min(1).max(5) })
        .strict()
        .optional(),
      nickname,
    })
    .strict(),
  z.object({ type: z.literal('move'), gameId, house, clientPly: z.number().int().min(0) }).strict(),
  z.object({ type: z.literal('resign'), gameId }).strict(),
  z.object({ type: z.literal('spectate'), gameId }).strict(),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const ErrorCode = z.enum([
  'ILLEGAL_MOVE',
  'NOT_YOUR_TURN',
  'STALE_PLY',
  'ROOM_FULL',
  'BAD_MESSAGE',
  'RATE_LIMITED',
]);

export const ServerMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('state'),
    gameId,
    slots: z.array(z.number().int().min(0).max(98)).length(16),
    toMove: z.union([z.literal(0), z.literal(1)]),
    ply: z.number().int().min(0),
    lastMove: house.optional(),
    over: z.boolean(),
    result: z.enum(['A', 'B', 'draw']).optional(),
  }),
  z.object({ type: z.literal('error'), code: ErrorCode, message: z.string() }),
  z.object({ type: z.literal('bot-thinking'), gameId, botId: z.string() }),
  z.object({
    type: z.literal('game-over'),
    gameId,
    scoreA: z.number().int(),
    scoreB: z.number().int(),
    result: z.enum(['A', 'B', 'draw']),
  }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

/** Parse untrusted input; never throws. */
export function parseClientMessage(
  raw: string,
): { ok: true; msg: ClientMessage } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'not JSON' };
  }
  const r = ClientMessage.safeParse(data);
  return r.success
    ? { ok: true, msg: r.data }
    : { ok: false, error: r.error.issues.map((i) => i.message).join('; ') };
}
