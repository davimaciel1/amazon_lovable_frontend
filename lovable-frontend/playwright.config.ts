import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: path.join(__dirname, 'tests', 'e2e'),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:8092',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    // Backend on 8090 with auth disabled for tests
    {
      command: 'npm run dev',
      cwd: path.join(__dirname, '..', 'amazon-unified-backend'),
      port: 8090,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ENABLE_COPILOT_AUTH: 'true',
        PORT: '8090',
        NODE_ENV: 'development',
      },
    },
    // Frontend build + preview with backend 8090
    {
      command: 'npm run build',
      cwd: __dirname,
      port: 0,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        VITE_BACKEND_URL: 'http://localhost:8090',
        VITE_API_URL: 'http://localhost:8090/api',
        VITE_API_KEY: 'D3NqFX9inLDTn98ckrZlHaJfrNTNh0ccx6PFqDyVvhI',
      },
    },
    {
      command: 'npm run preview -- --port 8092',
      cwd: __dirname,
      port: 8092,
      reuseExistingServer: false,
      timeout: 60_000
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
