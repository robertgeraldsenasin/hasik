import { defineConfig } from 'vite';

// BASE_PATH is set by the deploy workflow to "/<repo>/" for GitHub Pages project sites.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    reportCompressedSize: true,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
