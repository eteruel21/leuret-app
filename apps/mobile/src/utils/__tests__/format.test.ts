import { describe, expect, it } from "vitest";

import { formatDateTime, formatShortDate } from "../format";

describe("fechas en formato de Panamá", () => {
  it("las fechas cortas van día/mes/año", () => {
    expect(formatShortDate("2026-11-16")).toBe("16/11/2026");
    expect(formatShortDate("2026-03-05")).toBe("05/03/2026");
    expect(formatShortDate("2026-11-16T22:30:00Z", "America/Panama")).toBe("16/11/2026");
  });

  it("fecha y hora con el mes en letras", () => {
    const text = formatDateTime("2026-11-16T22:37:00Z", "America/Panama");
    expect(text).toMatch(/^16 nov(\.)? 2026/);
    expect(text).toMatch(/5:37/);
  });
});
