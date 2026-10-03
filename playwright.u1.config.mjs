import { defineConfig } from "@playwright/test";
import chromium from "@sparticuz/chromium";

const nextAuthSecret = "u1-playwright-test-secret";
const databaseUrl = "postgresql://postgres@localhost:5432/swift_senior_checklist_test?schema=public";
const executablePath = await chromium.executablePath();

export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    headless: true,
    launchOptions: {
      executablePath,
      args: chromium.args,
    },
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: `NEXTAUTH_SECRET=${nextAuthSecret} NEXTAUTH_URL=http://localhost:3000 DATABASE_URL='${databaseUrl}' DIRECT_URL='${databaseUrl}' TEST_DATABASE_URL='${databaseUrl}' npm run dev -- --hostname 0.0.0.0 --port 3000`,
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
