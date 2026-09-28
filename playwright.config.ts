import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: fileURLToPath(new URL('./tests/e2e', import.meta.url)),
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'retain-on-failure' },
});
