import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { configDefaults, defineConfig } from "vitest/config";

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

const integrationEnvironment = {
  NODE_ENV: "test",
  DATABASE_MODE: "postgres",
  ...isolatedDatabase,
  ...(process.env.PGUSER ? { PGUSER: process.env.PGUSER } : {}),
  ...(process.env.PGPASSWORD ? { PGPASSWORD: process.env.PGPASSWORD } : {})
} satisfies Record<string, string>;

const integrationTests = "src/**/__tests__/**/*.integration.test.ts";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/__tests__/**/*.test.ts"],
          exclude: [...configDefaults.exclude, integrationTests],
          env: { NODE_ENV: "test", DATABASE_MODE: "hyperdrive" }
        }
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: [integrationTests],
          env: integrationEnvironment
        }
      }
    ]
  }
});
