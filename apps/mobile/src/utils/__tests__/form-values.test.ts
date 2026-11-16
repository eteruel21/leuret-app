import { describe, expect, it } from "vitest";

import { isDateKey, parseDecimal } from "../form-values";

describe("parseDecimal", () => {
  it("acepta coma o punto decimal", () => {
    expect(parseDecimal("12,5")).toBe(12.5);
    expect(parseDecimal(" 1 250.75 ")).toBe(1250.75);
  });

  it("devuelve NaN si está vacío o no es número", () => {
    expect(parseDecimal("")).toBeNaN();
    expect(parseDecimal("abc")).toBeNaN();
  });
});

describe("isDateKey", () => {
  it("valida fechas reales con formato AAAA-MM-DD", () => {
    expect(isDateKey("2026-11-16")).toBe(true);
    expect(isDateKey("2028-02-29")).toBe(true);
  });

  it("rechaza formatos y días que no existen", () => {
    expect(isDateKey("16/11/2026")).toBe(false);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
  });
});
