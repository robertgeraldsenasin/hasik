/**
 * Runs game pairs in parallel across CPU cores with worker threads, because a
 * match of hundreds of pairs is embarrassingly parallel and CI runners have
 * several cores. Results are handed back strictly in pair order, so anything
 * computed from them (an SPRT stopping point, a results file) is reproducible no
 * matter which worker finished first.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { Opening, PairRecord } from './game';
import { runPairTask } from './task';

/** Where a bot implementation comes from: the workspace, or a bundle file (SPRT base/head). */
export type BotSource = 'local' | { readonly bundle: string };

export interface PairTask {
  readonly pair: number;
  readonly x: { readonly spec: string; readonly label: string; readonly source: BotSource };
  readonly y: { readonly spec: string; readonly label: string; readonly source: BotSource };
  readonly opening: Opening;
  readonly seed: number;
  readonly maxPlies: number;
}

export interface PoolOptions {
  /** 0 or 1 = run in this thread (simplest to debug). Default: cores - 1, at least 1. */
  readonly workers?: number;
  /** Called with each result, in task order. Return false to stop early. */
  readonly onResult?: (r: PairRecord, done: number) => boolean | void;
}

export const defaultWorkers = (): number => Math.max(1, availableParallelism() - 1);

export async function runPairs(
  tasks: readonly PairTask[],
  opts: PoolOptions = {},
): Promise<PairRecord[]> {
  const n = Math.min(opts.workers ?? defaultWorkers(), tasks.length);
  const out: PairRecord[] = [];
  if (n <= 1) {
    for (const t of tasks) {
      const r = await runPairTask(t);
      out.push(r);
      if (opts.onResult?.(r, out.length) === false) break;
    }
    return out;
  }

  return new Promise<PairRecord[]>((resolve, reject) => {
    const workers: Worker[] = [];
    const buffered = new Map<number, PairRecord>();
    let next = 0; // next task index to hand out
    let emit = 0; // next task index to emit in order
    let stopped = false;
    let active = 0;

    const finish = () => {
      for (const w of workers) void w.terminate();
      resolve(out);
    };
    const feed = (w: Worker) => {
      if (stopped || next >= tasks.length) {
        if (active === 0) finish();
        return;
      }
      active++;
      w.postMessage({ index: next, task: tasks[next] });
      next++;
    };

    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker-entry.mjs', import.meta.url));
      workers.push(w);
      w.on('message', (msg: { index: number; result?: PairRecord; error?: string }) => {
        active--;
        if (msg.error) {
          stopped = true;
          for (const x of workers) void x.terminate();
          reject(new Error(`pair ${msg.index} failed: ${msg.error}`));
          return;
        }
        buffered.set(msg.index, msg.result!);
        while (!stopped && buffered.has(emit)) {
          const r = buffered.get(emit)!;
          buffered.delete(emit);
          emit++;
          out.push(r);
          if (opts.onResult?.(r, out.length) === false) stopped = true;
        }
        if (stopped && active === 0) finish();
        else feed(w);
      });
      w.on('error', (e) => {
        stopped = true;
        reject(e);
      });
      feed(w);
    }
  });
}
