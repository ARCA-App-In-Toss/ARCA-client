import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const mockPort = 5174;

export default defineConfig({
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  projects: [
    // Production bundle: no Toss bridge, no API host (start must end on F90).
    {
      name: 'chromium',
      testDir: 'tests/browser',
      use: { ...devices['Pixel 7'], baseURL: `http://127.0.0.1:${port}` },
    },
    { name: 'webkit', testDir: 'tests/browser', use: { ...devices['iPhone 15'], baseURL: `http://127.0.0.1:${port}` } },
    // Dev server with the dev-only mock world (never part of the production build).
    {
      name: 'mock-chromium',
      testDir: 'tests/browser-mock',
      use: { ...devices['Pixel 7'], baseURL: `http://localhost:${mockPort}` },
    },
    {
      name: 'mock-webkit',
      testDir: 'tests/browser-mock',
      use: { ...devices['iPhone 15'], baseURL: `http://localhost:${mockPort}` },
    },
  ],
  webServer: [
    {
      // Preview runs as a direct child so teardown stops it; the bundle is built by `test:browser`.
      command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `node node_modules/vite/bin/vite.js --host localhost --port ${mockPort} --strictPort`,
      url: `http://localhost:${mockPort}`,
      env: { VITE_ARCA_MOCK_SCENARIO: 'MS-SES-001-active' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
