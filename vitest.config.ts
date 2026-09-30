import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { env } from 'node:process';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  define: {
    __GHOSTPRINT_TELEMETRY_ENDPOINT__: JSON.stringify(env.VITE_TELEMETRY_ENDPOINT ?? ''),
  },
  resolve: { alias: { '@': r('./src') } },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: { include: ['src/**/*.ts'], reporter: ['text', 'lcov'] },
  },
});
