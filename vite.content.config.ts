import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Pass 2: content scripts. Chrome cannot load ES modules as content scripts,
 * so these must be single-file IIFE bundles with no code splitting.
 */
export default defineConfig({
  resolve: { alias: { '@': r('./src') } },
  build: {
    outDir: r('./dist'),
    emptyOutDir: false,
    target: 'chrome120',
    sourcemap: true,
    lib: {
      entry: r('./src/content/index.ts'),
      formats: ['iife'],
      name: 'GhostPrintContent',
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: { extend: true },
    },
  },
});
