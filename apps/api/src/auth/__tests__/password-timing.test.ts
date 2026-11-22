import assert from "node:assert/strict";
import { test } from "vitest";
import { comparePasswordAgainstDummy } from "../services.js";

test("comparePasswordAgainstDummy: nunca acepta una contraseña y ejecuta la comparación completa", async () => {
  const started = Date.now();
  assert.equal(await comparePasswordAgainstDummy("Cualquier-clave-1"), false);
  assert.equal(await comparePasswordAgainstDummy(""), false);
  // bcrypt con coste 12 no puede resolverse de forma instantánea.
  assert.ok(Date.now() - started >= 20);
});
