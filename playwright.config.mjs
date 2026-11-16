import { randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";

process.env.LEURET_E2E_RUN_ID ??= randomUUID();
const chromiumPath = process.env.LEURET_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:8081",
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
    }
  ]
});
