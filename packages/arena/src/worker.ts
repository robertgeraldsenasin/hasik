import { parentPort } from 'node:worker_threads';
import type { PairTask } from './pool';
import { runPairTask } from './task';

parentPort!.on('message', async ({ index, task }: { index: number; task: PairTask }) => {
  try {
    parentPort!.postMessage({ index, result: await runPairTask(task) });
  } catch (e) {
    parentPort!.postMessage({
      index,
      error: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
  }
});
