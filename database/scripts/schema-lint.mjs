// Reglas de esquema para PostgreSQL / Supabase (schema-lint.sql).
//
// CI (validate.yml, paso 8b) lo ejecuta sobre la base efímera construida con
// todas las migraciones: una PR que agregue una FK sin índice, una segunda
// política permisiva para la misma acción, una llamada por fila a
// is_company_member() en una política, etc., no pasa.
//
// Uso: MIGRATOR_DATABASE_URL=... node database/scripts/schema-lint.mjs

import { readFile } from "node:fs/promises";
import path from "node:path";

import pg from "pg";

import { databaseRoot, postgresClientConfig, requireEnv } from "./db-utils.mjs";

const { Client } = pg;
const lintSql = await readFile(path.join(databaseRoot, "scripts", "schema-lint.sql"), "utf8");
const client = new Client(postgresClientConfig(requireEnv("MIGRATOR_DATABASE_URL")));

await client.connect();

try {
  await client.query("BEGIN READ ONLY");
  const { rows } = await client.query(lintSql);
  await client.query("COMMIT");

  if (rows.length === 0) {
    console.log("Esquema sin infracciones.");
  } else {
    console.error(`El esquema tiene ${rows.length} infracción(es):`);

    for (const row of rows) {
      console.error(`  [${row.rule}] ${row.object}${row.detail ? ` — ${row.detail}` : ""}`);
    }

    console.error("\nVer docs/database-change-process.md (Reglas de esquema).");
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
