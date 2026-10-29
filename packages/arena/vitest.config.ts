import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/cli.ts', 'src/worker.ts', 'src/worker-entry.mjs'],
      reporter: ['text-summary', 'lcov', 'json-summary'],
      thresholds: { lines: 70, functions: 70, statements: 70 },
    },
  },
});
