import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

import {
  quoteIdentifier,
  requireEnv,
  validateLocalAdminUrl,
} from "./db-utils.mjs";

const { Client } = pg;
const testDbName = `test_leuret_${randomUUID().replaceAll("-", "")}`;

if (process.env.NODE_ENV !== "test") {
  throw new Error("Las pruebas destructivas de migraciones requieren NODE_ENV=test.");
}

const adminUrl = validateLocalAdminUrl(
  requireEnv("DATABASE_ADMIN_URL"),
);
// La migración histórica 024 necesita el administrador en la base descartable.
const testUrl = new URL(adminUrl);
testUrl.pathname = `/${testDbName}`;
const migrationOptions = {
  env: { ...process.env, MIGRATOR_DATABASE_URL: testUrl.toString() },
  encoding: "utf8"
};

function migrate(...args) {
  return execFileSync(process.execPath, ["database/scripts/migrate.mjs", ...args], migrationOptions);
}

test("T-055: Ejecutar migraciones automáticamente desde cero", async () => {
  const adminClient = new Client({ connectionString: adminUrl });
  await adminClient.connect();

  try {
    execFileSync(process.execPath, ["database/scripts/bootstrap.mjs"], {
      env: { ...process.env, DATABASE_NAME: testDbName },
      stdio: "pipe"
    });

    migrate();
    migrate("--check");

    const testClient = new Client({ connectionString: testUrl.toString() });
    await testClient.connect();

    try {
      const historySql = "SELECT filename, checksum, applied_at FROM app_migrations.schema_migrations ORDER BY filename";
      const { rows: history } = await testClient.query(historySql);
      const filesInDir = fs.readdirSync(path.join(process.cwd(), "database", "migrations"))
        .filter((file) => file.endsWith(".sql"));
      assert.ok(filesInDir.length > 0);
      assert.deepEqual(history.map(({ filename }) => filename).sort(), filesInDir.sort());

      migrate();
      assert.deepEqual((await testClient.query(historySql)).rows, history);

      const validateSql = fs.readFileSync("database/scripts/validate_foreign_keys.sql", "utf8");
      const results = await testClient.query(validateSql);
      const [summary] = results.at(-1).rows;
      assert.ok(Number(summary.foreign_keys_checked) > 0);
      assert.equal(Number(summary.failed_foreign_keys), 0);
      assert.equal(Number(summary.total_orphan_rows), 0);

      await testClient.query(
        "UPDATE app_migrations.schema_migrations SET checksum = $1 WHERE filename = $2",
        ["0".repeat(64), history[0].filename]
      );
      const drift = spawnSync(process.execPath, ["database/scripts/migrate.mjs", "--check"], migrationOptions);
      assert.ifError(drift.error);
      assert.equal(drift.status, 1, "El check debe fallar si cambia un checksum aplicado.");
      assert.match(drift.stderr, /1 checksum\(s\) distinto\(s\)/);
    } finally {
      await testClient.end();
    }
  } finally {
    await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(testDbName)}`);
    await adminClient.end();
  }
});

test("T-070: Probar ejecución de backup en modo dry-run", async () => {
  const { runBackup } = await import("./backup-staging.mjs");
  const result = await runBackup({ dryRun: true });
  assert.equal(result.success, true);
  assert.equal(result.dryRun, true);
});

test("T-071: Probar simulación de restauración de backup en modo dry-run", async () => {
  const { runRestoreTest } = await import("./restore-test.mjs");
  const result = await runRestoreTest({ dryRun: true });
  assert.equal(result.success, true);
  assert.equal(result.dryRun, true);
});
