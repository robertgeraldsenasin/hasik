import { pathToFileURL } from 'node:url';
import { type Bot, type SearchLimits, createBot } from '@hasik/bots';
import { playPair, type PairRecord } from './game';
import type { BotSource, PairTask } from './pool';

type Factory = (spec: string) => { bot: Bot; limits: Partial<SearchLimits> };
const bundleCache = new Map<string, Promise<Factory>>();

/** Load createBot() from a bundle built by packages/bots/build.mjs (used by the SPRT gate). */
function loadFactory(source: BotSource): Promise<Factory> {
  if (source === 'local') return Promise.resolve(createBot);
  let f = bundleCache.get(source.bundle);
  if (!f) {
    f = import(pathToFileURL(source.bundle).href).then((m: { createBot?: Factory }) => {
      if (typeof m.createBot !== 'function')
        throw new Error(`${source.bundle} does not export createBot`);
      return m.createBot;
    });
    bundleCache.set(source.bundle, f);
  }
  return f;
}

export async function runPairTask(t: PairTask): Promise<PairRecord> {
  const [fx, fy] = await Promise.all([loadFactory(t.x.source), loadFactory(t.y.source)]);
  const x = { label: t.x.label, ...fx(t.x.spec) };
  const y = { label: t.y.label, ...fy(t.y.spec) };
  return playPair(x, y, t.opening, t.pair, t.seed, undefined, t.maxPlies);
}
