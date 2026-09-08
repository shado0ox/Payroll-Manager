import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',
  timeout:30_000,
  retries:process.env.CI ? 1 : 0,
  use:{
    baseURL:process.env.E2E_BASE_URL || 'http://127.0.0.1:3036',
    browserName:'chromium',
    trace:'retain-on-failure',
  },
  reporter:process.env.CI ? [['line']] : [['list']],
});
