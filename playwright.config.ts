import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

const PORT = 8788;
// E2E_BASE_URL=https://syndicplus-staging.syndicplus.workers.dev pour tester un environnement déployé (jamais la production)
const remote = process.env.E2E_BASE_URL;
// Permet d'utiliser un Chromium déjà installé (ex. PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome)
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
// Identité de démonstration du cockpit en local : secret aléatoire à chaque lancement (jamais versionné)
const demoSecret = randomBytes(24).toString('hex');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: remote ?? `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', launchOptions: { executablePath } },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { executablePath } } },
  ],
  webServer: remote
    ? undefined
    : {
    command: `npx wrangler d1 migrations apply syndicplus-db --local && npx wrangler dev --port ${PORT} --ip 127.0.0.1 --var DEMO_IDENTITY:enabled --var DEMO_SECRET:${demoSecret}`,
    url: `http://127.0.0.1:${PORT}/api/dossiers`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
      },
});
