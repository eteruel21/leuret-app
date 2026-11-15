import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const validate = readFileSync(new URL("../.github/workflows/validate.yml", import.meta.url), "utf8");
const deploy = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");

test("despliegue de producción requiere Validate exitoso en main", () => {
  assert.match(deploy, /^  workflow_run:/m);
  assert.match(deploy, /^    workflows: \[Validate\]$/m);
  assert.doesNotMatch(deploy, /^  push:/m, "Deploy no debe activarse directamente por push");
  for (const invariant of [
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_repository.full_name == github.repository",
    "ref: ${{ github.event.workflow_run.head_sha }}",
    "git ls-remote origin refs/heads/main"
  ]) {
    assert.ok(deploy.includes(invariant), `Falta protección de despliegue: ${invariant}`);
  }
});

test("CI es obligatorio, reproducible y ejecuta pruebas críticas", () => {
  assert.match(validate, /^  pull_request:/m);
  assert.match(validate, /^  push:/m);
  assert.match(validate, /^\s+npm ci$/m);
  assert.doesNotMatch(validate, /npm ci\s*\|\|\s*npm install/, "No permitir fallback inseguro");
  for (const command of [
    "npm run typecheck",
    "npm run test:database-tools",
    "npm run test:invoice-db",
    "npm run legal:check",
    "npm audit --omit=dev --audit-level=high",
    "npm run test -w apps/mobile",
    "npm run build:api",
    "npm run build:admin",
    "npm run build:mobile",
    "npm run test:workerd -w apps/api"
  ]) {
    assert.ok(validate.includes(command), `CI debe ejecutar: ${command}`);
  }
});
