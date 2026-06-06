import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Los tests de E2E comparten el servidor — se corre secuencial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Limpia cookies/storage entre tests
    storageState: undefined,
  },

  projects: [
    // Setup: pre-autenticación guardada en archivos de estado
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    // Tests de auth (sin estado previo)
    {
      name: 'auth',
      testMatch: /auth\/.*/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Tests autenticados (usan estado guardado por setup)
    {
      name: 'authenticated',
      testMatch: /authenticated\/.*/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
    },
  ],

  // Levanta `pnpm dev` automáticamente si no hay servidor corriendo
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
