import { describe, expect, it } from 'vitest';
import { ServerMessage, parseClientMessage } from '../src/index';

describe('client message validation', () => {
  it('accepts well-formed messages', () => {
    expect(
      parseClientMessage('{"type":"join","nickname":"Zea","vsBot":{"botId":"minimax","level":3}}')
        .ok,
    ).toBe(true);
    expect(parseClientMessage('{"type":"move","gameId":"g1","house":3,"clientPly":0}').ok).toBe(
      true,
    );
    expect(parseClientMessage('{"type":"resign","gameId":"g1"}').ok).toBe(true);
    expect(parseClientMessage('{"type":"spectate","gameId":"g1"}').ok).toBe(true);
  });

  it('rejects malformed JSON, unknown types, unknown fields and out-of-range values', () => {
    for (const raw of [
      'not json',
      '{"type":"hack"}',
      '{"type":"move","gameId":"g1","house":3,"clientPly":0,"admin":true}',
      '{"type":"move","gameId":"g1","house":99,"clientPly":0}',
      '{"type":"move","gameId":"g1","house":3,"clientPly":-1}',
      '{"type":"join","nickname":""}',
      '{"type":"join","nickname":"a","vsBot":{"botId":"x","level":9}}',
    ]) {
      expect(parseClientMessage(raw).ok).toBe(false);
    }
  });

  it('describes server messages', () => {
    const ok = ServerMessage.safeParse({
      type: 'state',
      gameId: 'g',
      slots: new Array(16).fill(0),
      toMove: 0,
      ply: 0,
      over: false,
    });
    expect(ok.success).toBe(true);
    expect(
      ServerMessage.safeParse({
        type: 'state',
        gameId: 'g',
        slots: [1],
        toMove: 0,
        ply: 0,
        over: false,
      }).success,
    ).toBe(false);
  });
});
