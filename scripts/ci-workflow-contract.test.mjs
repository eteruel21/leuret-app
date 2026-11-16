import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const workflowsDir = new URL("../.github/workflows/", import.meta.url);
const read = (name) => readFileSync(new URL(name, workflowsDir), "utf8");

const validate = read("validate.yml");
const deploy = read("deploy.yml");

// Texto del job `deploy` dentro de validate.yml (desde su cabecera hasta el final).
const deployJob = validate.slice(validate.search(/^  deploy:$/m));

test("producción solo se despliega desde main después de Validate", () => {
  assert.match(deploy, /^  workflow_call:/m, "deploy.yml debe ser reutilizable");
  assert.doesNotMatch(deploy, /^  (push|pull_request|pull_request_target|workflow_run|workflow_dispatch):/m,
    "deploy.yml no debe tener disparadores propios");
  assert.ok(
    deploy.includes("if: github.event_name == 'push' && github.ref == 'refs/heads/main'"),
    "deploy.yml debe exigir push a main"
  );
  assert.ok(deploy.includes("ref: ${{ github.sha }}"), "deploy.yml debe desplegar el commit validado");

  assert.ok(deployJob.startsWith("  deploy:"), "validate.yml debe tener el job deploy");
  assert.match(deployJob, /^    needs: validate$/m, "deploy debe esperar a validate");
  assert.match(deployJob, /^    uses: \.\/\.github\/workflows\/deploy\.yml$/m);
  assert.ok(
    deployJob.includes("if: github.event_name == 'push' && github.ref == 'refs/heads/main'"),
    "el job deploy no debe correr en PR ni en merge_group"
  );
});

test("CI es obligatorio, reproducible y ejecuta las pruebas críticas", () => {
  assert.match(validate, /^  pull_request:/m);
  assert.match(validate, /^  merge_group:/m);
  assert.match(validate, /^  push:/m);
  assert.match(validate, /^\s+run: npm ci\b/m);
  assert.doesNotMatch(validate, /npm ci[^\n]*\|\|/, "No permitir fallback a npm install");

  for (const command of [
    "node --test scripts/ci-workflow-contract.test.mjs",
    "scripts/check-dependency-advisories.mjs",
    "npm run typecheck",
    "npm run legal:check",
    "npm run test:unit -w apps/api",
    "npm run test:worker-runtime -w apps/api",
    "npm run test:workerd -w apps/api",
    "database/scripts/schema-lint.mjs",
    "verify-backup-restore.sh",
    "npm run test:database-tools",
    "npm run test:invoice-db",
    "npm run test:integration -w apps/api",
    "npm run test -w apps/mobile",
    "npm run check:native -w apps/mobile",
    "npm run build:api",
    "npm run build:admin",
    "npm run build:mobile",
    "npm run test:e2e"
  ]) {
    assert.ok(validate.includes(command), `CI debe ejecutar: ${command}`);
  }
});

test("los workflows usan permisos mínimos y no guardan credenciales de git", () => {
  for (const name of readdirSync(workflowsDir).filter((file) => /\.ya?ml$/.test(file))) {
    const workflow = read(name);
    assert.match(workflow, /^permissions:\n  contents: read$/m, `${name}: permisos por defecto de solo lectura`);

    const checkouts = workflow.match(/uses: actions\/checkout@[^\n]*/g) ?? [];
    for (const checkout of checkouts) {
      assert.match(checkout, /@[0-9a-f]{40}\b/, `${name}: actions/checkout fijado por SHA`);
    }
    const persistFalse = workflow.match(/persist-credentials: false/g) ?? [];
    assert.equal(persistFalse.length, checkouts.length, `${name}: cada checkout con persist-credentials: false`);
  }
});
