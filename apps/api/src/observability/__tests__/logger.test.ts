import { describe, expect, test } from "vitest";

import { createAppLogger, defaultLogLevel } from "../logger.js";

function capture(level = "info") {
  const lines: Array<{ level: string; entry: Record<string, unknown> }> = [];
  const logger = createAppLogger({
    level,
    now: () => new Date("2026-11-09T12:00:00.000Z"),
    write: (eventLevel, line) => lines.push({ level: eventLevel, entry: JSON.parse(line) })
  });
  return { logger, lines };
}

describe("logger de la API", () => {
  test("escribe una línea JSON con nivel, hora y mensaje", () => {
    const { logger, lines } = capture();
    logger.error({ route: "/budgets" }, "Error no controlado en la API.");
    expect(lines).toEqual([
      {
        level: "error",
        entry: {
          level: "error",
          time: "2026-11-09T12:00:00.000Z",
          route: "/budgets",
          msg: "Error no controlado en la API."
        }
      }
    ]);
  });

  test("oculta secretos en campos y en el texto", () => {
    const { logger, lines } = capture();
    logger.error(
      { password: "Secreta123", headers: { authorization: "Bearer abc.def.ghi" }, detail: "postgres://u:p@host/db" },
      "token=xyz123 falló"
    );
    const serialized = JSON.stringify(lines[0]?.entry);
    expect(serialized).not.toContain("Secreta123");
    expect(serialized).not.toContain("abc.def.ghi");
    expect(serialized).not.toContain("u:p@host");
    expect(serialized).not.toContain("xyz123");
  });

  test("respeta el nivel configurado", () => {
    const { logger, lines } = capture("warn");
    logger.info("no se escribe");
    logger.debug("tampoco");
    logger.warn("sí se escribe");
    expect(lines.map((line) => line.entry.msg)).toEqual(["sí se escribe"]);
  });

  test("los loggers hijos conservan el contexto de la petición sin copiar la petición entera", () => {
    const { logger, lines } = capture();
    const child = logger.child({ reqId: "r-1", req: { method: "GET", url: "/clients?token=abc", headers: { cookie: "x" } } });
    child.error("falló");
    expect(lines[0]?.entry).toMatchObject({ reqId: "r-1", method: "GET", url: "/clients", msg: "falló" });
    expect(JSON.stringify(lines[0]?.entry)).not.toContain("cookie");
  });

  test("un error al escribir no rompe la aplicación", () => {
    const logger = createAppLogger({
      write: () => {
        throw new Error("disco lleno");
      }
    });
    expect(() => logger.error("x")).not.toThrow();
  });

  test("en tests no registra nada salvo que se configure", () => {
    expect(defaultLogLevel("test")).toBe("silent");
    expect(defaultLogLevel("production")).toBe("info");
    expect(defaultLogLevel("production", "warn")).toBe("warn");
    expect(defaultLogLevel("production", "inventado")).toBe("info");
  });
});
