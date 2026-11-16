import { randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";

process.env.LEURET_E2E_RUN_ID ??= randomUUID();
const chromiumPath = process.env.LEURET_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./tests/e2e",
  reporter: process.env.CI ? [["list"], ["json", { outputFile: "e2e-audit/results.json" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:8081",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : { channel: "chrome" })
  },
  webServer: [
    {
      command: "npm run serve:e2e -w apps/api",
      url: "http://127.0.0.1:3001/health/database",
      env: { NODE_ENV: "test" }
    },
    {
      command: "vite preview apps/mobile --host 127.0.0.1 --port 8081 --strictPort",
      url: "http://127.0.0.1:8081"
    },
    {
      command: "vite preview apps/admin-web --host 127.0.0.1 --port 3000 --strictPort",
      url: "http://127.0.0.1:3000"
    }
  ]
});
