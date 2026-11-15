// Detecta cambios de esquema hechos fuera de las migraciones.
//
// Compara la huella (schema-fingerprint.sql) de dos bases:
//   REFERENCE_DATABASE_URL  base efímera construida con las migraciones del
//                           repositorio (en deploy.yml, un PostgreSQL 17 del
//                           runner).
//   MIGRATOR_DATABASE_URL   base revisada (producción).
//
// Sale con código 1 si hay objetos que faltan, sobran o tienen otra
// definición (tablas, columnas, restricciones, índices, políticas RLS,
// funciones, disparadores, permisos, enums, vistas). Solo lee el catálogo.
//
// Uso:
//   npm run db:drift:supabase        (con REFERENCE_DATABASE_URL local)
//   node database/scripts/schema-drift.mjs --print   (huella de la base revisada)

import { readFile } from "node:fs/promises";
import path from "node:path";

import pg from "pg";

import {
  databaseRoot,
  diffSchemaFingerprints,
  formatSchemaDrift,
  postgresClientConfig,
  requireEnv,
} from "./db-utils.mjs";

const { Client } = pg;
const printOnly = process.argv.includes("--print");
const fingerprintSql = await readFile(
  path.join(databaseRoot, "scripts", "schema-fingerprint.sql"),
  "utf8",
);

async function readFingerprint(connectionString) {
  const client = new Client(postgresClientConfig(connectionString));
  await client.connect();

  try {
    // Solo lectura: si alguien cambiara la consulta por error, la base lo
    // rechaza.
    await client.query("BEGIN READ ONLY");
    const result = await client.query(fingerprintSql);
    await client.query("COMMIT");
    return result.rows;
  } finally {
    await client.end();
  }
}

const actual = await readFingerprint(requireEnv("MIGRATOR_DATABASE_URL"));

if (printOnly) {
  for (const row of actual) {
    console.log(`${row.hash} ${row.kind} ${row.name}`);
  }
  process.exit(0);
}

const reference = await readFingerprint(requireEnv("REFERENCE_DATABASE_URL"));
const drift = diffSchemaFingerprints(reference, actual);

if (drift.hasDrift) {
  console.error(
    "Deriva de esquema: la base no coincide con lo que producen las migraciones.\n" +
      formatSchemaDrift(drift) +
      "\n\nSi el cambio es intencional, escríbelo como una migración nueva y " +
      "aplícala con npm run db:migrate:supabase. Si no, reviértelo en la base. " +
      "Ver docs/database/proceso-de-cambios.md.",
  );

  for (const row of drift.changed.slice(0, 5)) {
    console.error(`\n--- ${row.kind} ${row.name}\nmigraciones: ${row.definition}\nbase:        ${row.actualDefinition}`);
  }

  process.exitCode = 1;
} else {
  console.log(`Sin deriva de esquema: ${actual.length} objetos coinciden con las migraciones.`);
}
