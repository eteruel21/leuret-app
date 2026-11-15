import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

import { deriveTestDatabaseEnvironment } from "./src/db/test-database-env.js";

const databaseEnvironmentPath = fileURLToPath(
  new URL("../../database/.env", import.meta.url)
);

if (existsSync(databaseEnvironmentPath)) {
  dotenv.config({
    path: databaseEnvironmentPath,
    quiet: true
  });
}

const isolatedDatabase = process.env.TEST_DATABASE_URL
  ? deriveTestDatabaseEnvironment(
      process.env.TEST_DATABASE_URL,
      process.env.NODE_ENV ?? "test"
    )
  : {};

const testEnvironment = {
  NODE_ENV: "test",
  DATABASE_MODE: process.env.DATABASE_MODE ?? (process.env.TEST_DATABASE_URL ? "postgres" : "hyperdrive"),
  ...isolatedDatabase,
  ...(process.env.PGUSER ? { PGUSER: process.env.PGUSER } : {}),
  ...(process.env.PGPASSWORD ? { PGPASSWORD: process.env.PGPASSWORD } : {})
} satisfies Record<string, string>;

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    testTimeout: 30000,
    env: testEnvironment
  }
});
