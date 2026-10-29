/**
 * Promise wrapper around the bot worker. Handles the failure path the spec asks
 * for: if the worker crashes or stops answering, the pending request rejects, the
 * worker is replaced, and the UI can offer a retry.
 */
import type { ThinkResponse, WorkerResponse } from '@hasik/protocol';

export class BotWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (r: ThinkResponse) => void; reject: (e: Error) => void; timer: number }
  >();

  constructor(private readonly timeoutMs = 20_000) {}

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.type === 'move') p.resolve(msg);
      else p.reject(new Error(msg.message));
    };
    w.onerror = (ev) => this.fail(new Error(ev.message || 'bot worker crashed'));
    this.worker = w;
    return w;
  }

  private fail(err: Error) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null; // a fresh worker is created on the next request
  }

  think(position: string, spec: string, seed: number): Promise<ThinkResponse> {
    const w = this.ensure();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(
        () => this.fail(new Error('the bot took too long to answer')),
        this.timeoutMs,
      );
      this.pending.set(id, { resolve, reject, timer });
      w.postMessage({ type: 'think', id, position, spec, seed });
    });
  }

  /** Abandon any search in progress (new game, leaving the page). */
  cancel(): void {
    if (this.pending.size > 0) this.fail(new Error('cancelled'));
  }
}
