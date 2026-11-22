import { describe, expect, it } from "vitest";

import { singularizeOne } from "../singular-text";

describe("singularizeOne", () => {
  it("deja en singular las unidades cuando la cantidad es 1", () => {
    expect(singularizeOne("1 sacos")).toBe("1 saco");
    expect(singularizeOne("1 galones")).toBe("1 galón");
    expect(singularizeOne("1 piezas · 3 soportes")).toBe("1 pieza · 3 soportes");
    expect(singularizeOne("1 octogonales · 2 rectangulares")).toBe("1 octogonal · 2 rectangulares");
    expect(singularizeOne("1 de luces · 1 de tomacorrientes")).toBe("1 de luces · 1 de tomacorrientes");
  });

  it("no toca otras cantidades ni números que terminan en 1", () => {
    expect(singularizeOne("11 sacos")).toBe("11 sacos");
    expect(singularizeOne("21 tubos")).toBe("21 tubos");
    expect(singularizeOne("1.5 sacos")).toBe("1.5 sacos");
    expect(singularizeOne("2,1 sacos")).toBe("2,1 sacos");
    expect(singularizeOne("3 sacos")).toBe("3 sacos");
  });

  it("no cambia palabras desconocidas ni unidades de medida", () => {
    expect(singularizeOne("1 m² por pintar")).toBe("1 m² por pintar");
    expect(singularizeOne("1 kWp")).toBe("1 kWp");
  });
});
