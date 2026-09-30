import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { env } from 'node:process';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Pass 1: extension pages + MV3 service worker (ES modules are allowed here).
 * Content scripts are built separately by vite.content.config.ts as IIFE.
 */
export default defineConfig({
  define: {
    __GHOSTPRINT_TELEMETRY_ENDPOINT__: JSON.stringify(env.VITE_TELEMETRY_ENDPOINT ?? ''),
  },
  root: r('./src'),
  publicDir: r('./src/public'),
  resolve: { alias: { '@': r('./src') } },
  build: {
    outDir: r('./dist'),
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: true,
    modulePreload: false,
    rollupOptions: {
      input: {
        background: r('./src/background/index.ts'),
        popup: r('./src/popup/index.html'),
        options: r('./src/options/index.html'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
