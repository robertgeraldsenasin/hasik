// Worker bootstrap: registers the TypeScript loader inside the worker thread, then
// loads the real worker. Worker threads don't inherit loaders reliably across
// runners (tsx, vitest, plain node), so each worker registers its own.
import { register } from 'tsx/esm/api';

register();
await import('./worker.ts');
