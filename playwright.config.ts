/**
 * Playwright-Konfiguration (E2E-Tests in e2e/).
 *
 * Standard (`npm run test:e2e`): baut die App (`npm run build`) und startet den Produktionsserver
 * auf Port 8790 mit einer frischen, temporären Datendatei – die echten Daten in data/db.json
 * bleiben unberührt.
 *
 * Umgebungsvariablen:
 *   E2E_BASE_URL=http://localhost:5173   gegen einen bereits laufenden Server testen (kein eigener Start)
 *   E2E_PORT=8790                        Port des Test-Servers
 *   E2E_SKIP_BUILD=1                     vorhandenen Build aus dist/ verwenden (schneller)
 *
 * Projekte: „Desktop Chromium“ (1440 × 900) und „iPhone“ (Chromium, 390 × 844, Touch, Retina).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 8790);
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL?.trim().replace(/\/+$/, '') || undefined;
const SKIP_BUILD = ['1', 'true', 'yes'].includes((process.env.E2E_SKIP_BUILD ?? '').toLowerCase());
/** temporäre Datendatei des Test-Servers – vor jedem Lauf gelöscht, damit frische Demo-Daten entstehen */
const DATA_FILE = path.join(os.tmpdir(), `altinger-e2e-${PORT}.json`);
const CI = !!process.env.CI;

// nur im Hauptprozess (Worker laden die Konfiguration ebenfalls) und nur, wenn wir den Server selbst starten
if (!EXTERNAL_BASE_URL && !process.env.TEST_WORKER_INDEX) fs.rmSync(DATA_FILE, { force: true });

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: EXTERNAL_BASE_URL ?? `http://localhost:${PORT}`,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'Desktop Chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'iPhone',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
  webServer: EXTERNAL_BASE_URL
    ? undefined
    : {
        command: SKIP_BUILD ? 'npm start' : 'npm run build && npm start',
        url: `http://localhost:${PORT}/api/health`,
        reuseExistingServer: false,
        timeout: SKIP_BUILD ? 60_000 : 240_000,
        stdout: 'ignore',
        stderr: 'pipe',
        env: {
          PORT: String(PORT),
          DATA_FILE,
          DEMO_MODE: 'true',
          RESEED_STALE: 'true',
          NODE_ENV: 'production',
        },
      },
});
