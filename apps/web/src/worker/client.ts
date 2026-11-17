/**
 * Promise wrapper around the bot worker. Handles the failure path the spec asks
 * for: if the worker crashes or stops answering, the pending request rejects, the
 * worker is replaced, and the UI can offer a retry.
 */
import type {
  AnalyzeResponse,
  ThinkResponse,
  WorkerRequest,
  WorkerResponse,
} from '@hasik/protocol';

type Ok = ThinkResponse | AnalyzeResponse;

/** Rejection reason for work abandoned on purpose (new game, undo, leaving the page). */
export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

export class BotWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (r: Ok) => void; reject: (e: Error) => void; timer: number }
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
      if (msg.type === 'error') p.reject(new Error(msg.message));
      else p.resolve(msg);
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      this.fail(new Error(ev.message || 'bot worker crashed'));
    };
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

  private send<T extends Ok>(req: Omit<WorkerRequest, 'id'>): Promise<T> {
    let w: Worker;
    try {
      w = this.ensure();
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(
        () => this.fail(new Error('the bot took too long to answer')),
        this.timeoutMs,
      );
      this.pending.set(id, { resolve: resolve as (r: Ok) => void, reject, timer });
      w.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  think(position: string, spec: string, seed: number): Promise<ThinkResponse> {
    return this.send<ThinkResponse>({ type: 'think', position, spec, seed });
  }

  /** Score every legal move (hint mode). */
  analyze(position: string, spec: string, seed: number): Promise<AnalyzeResponse> {
    return this.send<AnalyzeResponse>({ type: 'analyze', position, spec, seed });
  }

  /** Abandon any search in progress (new game, undo, leaving the page). */
  cancel(): void {
    if (this.pending.size > 0) this.fail(new CancelledError());
  }
}
