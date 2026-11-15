import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checksum,
  detectMigrationDrift,
  diffSchemaFingerprints,
  formatSchemaDrift,
  legacyCrLfChecksum,
  postgresClientConfig,
  storedChecksumMatches,
  quoteIdentifier,
  quoteLiteral,
  stripOuterTransaction,
  stripPsqlMetaCommands,
  validateLocalAdminUrl,
  validateSupabaseAdminUrl,
  validateTestDatabaseUrl,
} from "./db-utils.mjs";

test("calcula checksums SHA-256 estables", () => {
  assert.equal(
    checksum("contractor-app"),
    "234c141811755f52e1ea80a3e2761c5c6c1194f5bd6aa728cf8d32318632e31d",
  );
});

test("normaliza saltos de línea antes de calcular checksums", () => {
  const expected = checksum("BEGIN;\nSELECT 1;\nCOMMIT;\n");

  assert.equal(checksum("BEGIN;\r\nSELECT 1;\r\nCOMMIT;\r\n"), expected);
  assert.equal(checksum("BEGIN;\rSELECT 1;\rCOMMIT;\r"), expected);
});

test("retira únicamente la transacción exterior", () => {
  assert.equal(
    stripOuterTransaction("BEGIN;\nSELECT 1;\nCOMMIT;\n", "001_test.sql"),
    "SELECT 1;",
  );
});

test("permite comentarios SQL antes de la transacción exterior", () => {
  assert.equal(
    stripOuterTransaction(
      "-- encabezado\n/* metadatos */\nbegin;\nSELECT 1;\ncommit;\n",
      "001_seed.sql",
    ),
    "SELECT 1;",
  );
});

test("conserva la verificación SQL posterior al COMMIT", () => {
  assert.equal(
    stripOuterTransaction(
      "-- Catálogo oficial\n\nbegin;\nINSERT INTO catalog VALUES (1);\n\ncommit;\n\n-- Verificación esperada\nselect count(*) as partidas_importadas from catalog;\n",
      "001_seed.sql",
    ),
    "INSERT INTO catalog VALUES (1);\n\n-- Verificación esperada\nselect count(*) as partidas_importadas from catalog;",
  );
});

test("rechaza migraciones sin transacción exterior", () => {
  assert.throws(
    () => stripOuterTransaction("SELECT 1;", "001_test.sql"),
    /debe contener una transacción exterior delimitada por BEGIN; y COMMIT;/u,
  );
});

test("retira los delimitadores de seguridad generados por pg_dump", () => {
  assert.equal(
    stripPsqlMetaCommands(
      "SELECT 1;\n\\restrict token\nSELECT 2;\n\\unrestrict token",
      "003_dump.sql",
    ),
    "SELECT 1;\nSELECT 2;",
  );
});

test("rechaza otros comandos exclusivos de psql", () => {
  assert.throws(
    () => stripPsqlMetaCommands("\\connect otra_base", "003_dump.sql"),
    /comandos psql no compatibles/u,
  );
});

test("escapa literales y valida identificadores", () => {
  assert.equal(quoteIdentifier("contractor_pro"), '"contractor_pro"');
  assert.equal(quoteLiteral("se'creto"), "'se''creto'");
  assert.throws(() => quoteIdentifier("contractor-pro"), /inválido/u);
});

test("acepta únicamente URLs de bases marcadas como pruebas", () => {
  const safeUrl =
    "postgresql://postgres:secret@localhost:5432/contractor_ci_test";

  assert.equal(validateTestDatabaseUrl(safeUrl, "test"), safeUrl);
  assert.throws(
    () => validateTestDatabaseUrl("postgresql://postgres:secret@localhost:5432/contractor_pro", "test"),
    /inequívocamente de pruebas/u,
  );
  assert.throws(
    () => validateTestDatabaseUrl("postgresql://postgres:secret@localhost:5432/staging_test", "test"),
    /nunca prod, staging, main o live/u,
  );
  assert.throws(
    () => validateTestDatabaseUrl(safeUrl, "production"),
    /NODE_ENV=test/u,
  );
  assert.throws(
    () =>
      validateTestDatabaseUrl(
        `${safeUrl}?host=prod.example.test`,
        "test",
      ),
    /no permite parámetros ni fragmentos/u,
  );
  assert.throws(
    () =>
      validateTestDatabaseUrl(
        "postgresql://localhost:5432/contractor_ci_test",
        "test",
      ),
    /host, usuario y contraseña/u,
  );
});

test("separa conexiones administrativas locales y Supabase", () => {
  const localUrl =
    "postgresql://postgres:secret@127.0.0.1:5432/postgres";

  const supabaseDirectUrl =
    "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";

  const supabasePoolerUrl =
    "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

  assert.equal(
    validateLocalAdminUrl(localUrl),
    localUrl,
  );

  assert.throws(
    () => validateLocalAdminUrl(supabaseDirectUrl),
    /solo puede ejecutarse contra PostgreSQL local/u,
  );

  assert.throws(
    () =>
      validateLocalAdminUrl(
        `${localUrl}?host=db.example.test`,
      ),
    /no permite parámetros ni fragmentos/u,
  );

  assert.throws(
    () =>
      validateLocalAdminUrl(
        "postgresql://contractor_api:secret@127.0.0.1:5432/postgres",
      ),
    /usuario administrativo postgres/u,
  );

  assert.equal(
    validateSupabaseAdminUrl(supabaseDirectUrl),
    supabaseDirectUrl,
  );

  assert.equal(
    validateSupabaseAdminUrl(supabasePoolerUrl),
    supabasePoolerUrl,
  );

  assert.throws(
    () => validateSupabaseAdminUrl(localUrl),
    /host de Supabase/u,
  );

  assert.throws(
    () =>
      validateSupabaseAdminUrl(
        "postgresql://contractor_api:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      ),
    /usuario administrativo postgres/u,
  );
});

test(
  "conserva CA propia aunque Supabase entregue sslmode",
  () => {
    const tempDirectory =
      mkdtempSync(
        join(
          tmpdir(),
          "contractor-supabase-ca-",
        ),
      );

    const caFile =
      join(
        tempDirectory,
        "supabase-ca.crt",
      );

    writeFileSync(
      caFile,
      "TEST SUPABASE CA",
      "utf8",
    );

    const previousCa =
      process.env.DATABASE_SSL_CA_FILE;

    process.env.DATABASE_SSL_CA_FILE =
      caFile;

    try {
      const config =
        postgresClientConfig(
          "postgresql://postgres.project:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&application_name=contractor",
        );

      const parsed =
        new URL(
          config.connectionString,
        );

      assert.equal(
        parsed.searchParams.has(
          "sslmode",
        ),
        false,
      );

      assert.equal(
        parsed.searchParams.get(
          "application_name",
        ),
        "contractor",
      );

      assert.equal(
        config.ssl.ca,
        "TEST SUPABASE CA",
      );

      assert.equal(
        config.ssl.rejectUnauthorized,
        true,
      );
    } finally {
      if (previousCa === undefined) {
        delete process.env
          .DATABASE_SSL_CA_FILE;
      }
      else {
        process.env
          .DATABASE_SSL_CA_FILE =
          previousCa;
      }

      rmSync(
        tempDirectory,
        {
          recursive: true,
          force: true,
        },
      );
    }
  },
);


test(
  "acepta checksums históricos CRLF sin debilitar la integridad",
  () => {
    const contents =
      "BEGIN;\nSELECT 1;\nCOMMIT;\n";

    const normalizedChecksum =
      "d0d802e8a15e6cf272875ae76ed502e82db67cb240e1f2be9a08a4061ac2c9be";

    const legacyChecksum =
      "0407a28b67adea514ef4b6ee7b53aabb165a728523bea61aa8cd929cf3ec97df";

    assert.equal(
      checksum(contents),
      normalizedChecksum,
    );

    assert.equal(
      legacyCrLfChecksum(contents),
      legacyChecksum,
    );

    assert.equal(
      storedChecksumMatches(
        contents,
        normalizedChecksum,
      ),
      true,
    );

    assert.equal(
      storedChecksumMatches(
        contents,
        legacyChecksum,
      ),
      true,
    );

    assert.equal(
      storedChecksumMatches(
        contents,
        "0".repeat(64),
      ),
      false,
    );
  },
);

test(
  "detecta migraciones pendientes, alteradas y remotas sin archivo",
  () => {
    const firstContents =
      "BEGIN;\nSELECT 1;\nCOMMIT;\n";

    const secondContents =
      "BEGIN;\nSELECT 2;\nCOMMIT;\n";

    const files = [
      {
        filename: "001_first.sql",
        contents: firstContents,
      },
      {
        filename: "002_second.sql",
        contents: secondContents,
      },
    ];

    const appliedRows = [
      {
        filename: "001_first.sql",
        checksum: "0".repeat(64),
      },
      {
        filename: "999_remote_only.sql",
        checksum: checksum("remote"),
      },
    ];

    const drift = detectMigrationDrift(
      files,
      appliedRows,
    );

    assert.deepEqual(
      drift.pending.map((file) => file.filename),
      ["002_second.sql"],
    );

    assert.deepEqual(
      drift.checksumMismatches.map(
        (file) => file.filename,
      ),
      ["001_first.sql"],
    );

    assert.deepEqual(
      drift.unexpectedHistory.map(
        (row) => row.filename,
      ),
      ["999_remote_only.sql"],
    );
  },
);

test(
  "acepta un historial de migraciones completamente sincronizado",
  () => {
    const contents =
      "BEGIN;\nSELECT 1;\nCOMMIT;\n";

    const drift = detectMigrationDrift(
      [
        {
          filename: "001_synced.sql",
          contents,
        },
      ],
      [
        {
          filename: "001_synced.sql",
          checksum: checksum(contents),
        },
      ],
    );

    assert.deepEqual(drift.pending, []);
    assert.deepEqual(
      drift.checksumMismatches,
      [],
    );
    assert.deepEqual(
      drift.unexpectedHistory,
      [],
    );
  },
);

test("la huella de esquema no reporta deriva si todo coincide", () => {
  const rows = [
    { kind: "policy", name: "public.budgets.budgets_select_access", hash: "a" },
    { kind: "index", name: "public.budgets_pkey", hash: "b" },
  ];
  const drift = diffSchemaFingerprints(rows, [...rows].reverse());

  assert.equal(drift.hasDrift, false);
  assert.equal(formatSchemaDrift(drift), "");
});

test("la huella de esquema separa objetos faltantes, sobrantes y cambiados", () => {
  const reference = [
    { kind: "policy", name: "public.budgets.budgets_select_access", hash: "a" },
    { kind: "index", name: "public.budgets_pkey", hash: "b" },
    { kind: "relation", name: "private.account_deletion_records", hash: "rls=true" },
  ];
  const actual = [
    { kind: "index", name: "public.budgets_pkey", hash: "b" },
    { kind: "relation", name: "private.account_deletion_records", hash: "rls=false", definition: "rls=false" },
    { kind: "index", name: "public.manual_idx", hash: "c" },
  ];
  const drift = diffSchemaFingerprints(reference, actual);

  assert.equal(drift.hasDrift, true);
  assert.deepEqual(drift.missing.map((row) => row.name), ["public.budgets.budgets_select_access"]);
  assert.deepEqual(drift.unexpected.map((row) => row.name), ["public.manual_idx"]);
  assert.deepEqual(drift.changed.map((row) => row.name), ["private.account_deletion_records"]);
  assert.equal(drift.changed[0].actualDefinition, "rls=false");

  const report = formatSchemaDrift(drift);
  assert.match(report, /Faltan en la base revisada .*\(1\)/u);
  assert.match(report, /Sobran en la base revisada .*\(1\)/u);
  assert.match(report, /Definición distinta \(1\):\n  relation private.account_deletion_records/u);
});

test("el informe de deriva recorta listas largas", () => {
  const reference = Array.from({ length: 60 }, (_, index) => ({
    kind: "index",
    name: `public.idx_${String(index).padStart(2, "0")}`,
    hash: "x",
  }));
  const report = formatSchemaDrift(diffSchemaFingerprints(reference, []), { limit: 3 });

  assert.match(report, /\(60\):/u);
  assert.match(report, /… y 57 más/u);
});
