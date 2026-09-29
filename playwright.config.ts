import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: fileURLToPath(new URL('./tests/e2e', import.meta.url)),
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'node tools/sandbox-server.mjs',
    url: 'http://127.0.0.1:4173/facebook',
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
