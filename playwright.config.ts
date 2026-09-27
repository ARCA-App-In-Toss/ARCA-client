import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const mockPort = 5174;
const onboardingPort = 5175;
const timePort = 5176;
const archivePort = 5177;

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
    // Same dev mock, unregistered synthetic key: onboarding starts at F01.
    {
      name: 'onboarding-chromium',
      testDir: 'tests/browser-onboarding',
      use: { ...devices['Pixel 7'], baseURL: `http://localhost:${onboardingPort}` },
    },
    {
      name: 'onboarding-webkit',
      testDir: 'tests/browser-onboarding',
      use: { ...devices['iPhone 15'], baseURL: `http://localhost:${onboardingPort}` },
    },
    // Same dev mock, the server day moves on before the first save (MS-TIME-002 → F13, Sheet).
    {
      name: 'time-chromium',
      testDir: 'tests/browser-time',
      use: { ...devices['Pixel 7'], baseURL: `http://localhost:${timePort}` },
    },
    {
      name: 'time-webkit',
      testDir: 'tests/browser-time',
      use: { ...devices['iPhone 15'], baseURL: `http://localhost:${timePort}` },
    },
    // Same dev mock, 21 records across a month boundary (MS-LIST-003/004, F21~F23).
    {
      name: 'archive-chromium',
      testDir: 'tests/browser-archive',
      use: { ...devices['Pixel 7'], baseURL: `http://localhost:${archivePort}` },
    },
    {
      name: 'archive-webkit',
      testDir: 'tests/browser-archive',
      use: { ...devices['iPhone 15'], baseURL: `http://localhost:${archivePort}` },
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
    {
      command: `node node_modules/vite/bin/vite.js --host localhost --port ${onboardingPort} --strictPort`,
      url: `http://localhost:${onboardingPort}`,
      env: { VITE_ARCA_MOCK_SCENARIO: 'MS-SES-001-pre' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `node node_modules/vite/bin/vite.js --host localhost --port ${timePort} --strictPort`,
      url: `http://localhost:${timePort}`,
      env: { VITE_ARCA_MOCK_SCENARIO: 'MS-TIME-002' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `node node_modules/vite/bin/vite.js --host localhost --port ${archivePort} --strictPort`,
      url: `http://localhost:${archivePort}`,
      env: { VITE_ARCA_MOCK_SCENARIO: 'MS-LIST-003' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
