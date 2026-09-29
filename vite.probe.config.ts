import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** The MAIN-world probe is a separate IIFE; Chrome cannot load content-script modules. */
export default defineConfig({
  build: {
    outDir: r('./dist'),
    emptyOutDir: false,
    target: 'chrome120',
    sourcemap: true,
    lib: {
      entry: r('./src/content/probes/main.ts'),
      formats: ['iife'],
      name: 'GhostPrintProbe',
      fileName: () => 'probe-main.js',
    },
  },
});