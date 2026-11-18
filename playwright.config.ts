import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const PORT = 3199;
const dbPath = path.join(os.tmpdir(), `e2e-market-${process.pid}.db`);

// Smoke test: production build served by the real backend (no external keys, Yahoo off).
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  use: { actionTimeout: 10_000, navigationTimeout: 20_000, baseURL: `http://localhost:${PORT}`, viewport: { width: 1440, height: 900 } },
  webServer: {
    command: 'npm run build && npm start',
    url: `http://localhost:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      MARKET_DB_PATH: dbPath,
      YAHOO_ENABLED: '',
      GEMINI_API_KEY: '',
      NODE_ENV: 'production',
    },
  },
});
