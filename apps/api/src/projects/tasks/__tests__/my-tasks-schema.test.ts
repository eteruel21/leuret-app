import assert from "node:assert/strict";
import { test } from "vitest";

import { myTasksQuerySchema } from "../schemas.js";

test("Mis tareas: por defecto solo muestra tareas abiertas", () => {
  const parsed = myTasksQuerySchema.safeParse({});
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.status, "open");
});

test("Mis tareas: acepta 'all' para incluir completadas", () => {
  const parsed = myTasksQuerySchema.safeParse({ status: "all" });
  assert.equal(parsed.success && parsed.data.status, "all");
});

test("Mis tareas: rechaza filtros desconocidos", () => {
  assert.equal(myTasksQuerySchema.safeParse({ status: "completed" }).success, false);
});
