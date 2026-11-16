/// <reference lib="webworker" />
/**
 * The bot runs here, off the UI thread, so a one-second search never freezes the
 * page (constraint C4). The worker is the only place in the web app that gives a
 * bot a clock: performance.now is injected through the search limits.
 */
import { createBot } from '@hasik/bots';
import { decodePosition } from '@hasik/engine';
import type { WorkerRequest, WorkerResponse } from '@hasik/protocol';
import { analyzePosition } from './analyze';

const cache = new Map<string, ReturnType<typeof createBot>>();

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  const reply = (msg: WorkerResponse) => (self as DedicatedWorkerGlobalScope).postMessage(msg);
  try {
    const state = decodePosition(req.position);
    const t0 = performance.now();
    if (req.type === 'analyze') {
      const a = analyzePosition(state, req.spec, req.seed, () => performance.now());
      reply({
        type: 'analysis',
        id: req.id,
        moves: a.moves,
        nodes: a.nodes,
        ms: performance.now() - t0,
      });
      return;
    }
    let entry = cache.get(req.spec);
    if (!entry) {
      entry = createBot(req.spec);
      cache.set(req.spec, entry);
    }
    const r = entry.bot.think(state, {
      ...entry.limits,
      seed: req.seed,
      now: () => performance.now(),
    });
    reply({
      type: 'move',
      id: req.id,
      move: r.move,
      ...(r.score !== undefined ? { score: r.score } : {}),
      ...(r.depth !== undefined ? { depth: r.depth } : {}),
      ...(r.nodes !== undefined ? { nodes: r.nodes } : {}),
      ...(r.pv !== undefined ? { pv: r.pv } : {}),
      ms: performance.now() - t0,
    });
  } catch (e) {
    reply({ type: 'error', id: req.id, message: e instanceof Error ? e.message : String(e) });
  }
};
