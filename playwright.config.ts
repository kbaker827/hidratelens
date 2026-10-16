import { defineConfig, devices } from "@playwright/test";

const PORT = 8787;

export default defineConfig({
  testDir: "test/e2e",
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 600, height: 600 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 600, height: 600 } } }],
  webServer: {
    command: `npx wrangler dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/today`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
