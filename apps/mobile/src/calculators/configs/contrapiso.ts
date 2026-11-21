import {
  compactMaterials,
  makeLine,
  material,
  type CalculatorConfig,
  type ResultRow,
  type Values,
} from "@/components/calculators/CalculatorScreen";
import {
  calculateSubfloor,
  type SubfloorInput,
  type SubfloorPrices,
  type SubfloorResult,
} from "@/utils/finishing-calculations";

function inputFrom(v: Values): SubfloorInput {
  const n = v.n;
  const zocalo = Boolean(v.flags.includeBaseboard);
  return {
    area: n("area"),
    thickness: n("thickness"),
    mixCement: n("mixCement"),
    mixSand: n("mixSand"),
    cementBagWeight: n("cementBagWeight"),
    wastePercentage: n("wastePercentage"),
    perimeter: zocalo ? n("perimeter") : 0,
    doorWidths: n("doorWidths"),
    baseboardPieceLength: n("baseboardPieceLength"),
    baseboardWastePercentage: n("baseboardWastePercentage"),
    adhesiveKgPerMeter: n("adhesiveKgPerMeter"),
    adhesiveBagWeight: n("adhesiveBagWeight"),
  };
}

function pricesFrom(v: Values): SubfloorPrices {
  const n = v.n;
  return {
    cementBag: n("cementPrice"),
    sandCubicMeter: n("sandPrice"),
    baseboardPiece: n("baseboardPrice"),
    adhesiveBag: n("adhesivePrice"),
    laborSubfloorSquareMeter: n("laborSubfloorPrice"),
    laborBaseboardMeter: n("laborBaseboardPrice"),
  };
}

const compute = (v: Values) => calculateSubfloor(inputFrom(v), pricesFrom(v));

export const contrapisoConfig: CalculatorConfig<SubfloorResult> = {
  id: "subfloor",
  settingsKey: "calculator.contrapiso",
  title: "Contrapiso y zócalo",
  subtitle: "Mortero de nivelación, zócalo, adhesivo y mano de obra.",
  icon: "reorder-four-outline",
  calculateLabel: "Calcular contrapiso",
  defaults: {
    area: "", thickness: "0.05", mixCement: "1", mixSand: "4", cementBagWeight: "42.5",
    wastePercentage: "8", perimeter: "", doorWidths: "0", baseboardPieceLength: "0.60",
    baseboardWastePercentage: "10", adhesiveKgPerMeter: "0.3", adhesiveBagWeight: "5",
    cementPrice: "", sandPrice: "", baseboardPrice: "", adhesivePrice: "",
    laborSubfloorPrice: "", laborBaseboardPrice: "",
  },
  flagDefaults: { includeBaseboard: true },
  sections: [
    {
      title: "Contrapiso",
      description: "Deja el área en blanco si solo vas a poner zócalo.",
      fields: [
        { key: "area", label: "Área del piso", unit: "m²" },
        { key: "thickness", label: "Espesor", unit: "m", persist: true },
        { key: "mixCement", label: "Mezcla: cemento", unit: "parte", persist: true },
        { key: "mixSand", label: "Mezcla: arena", unit: "partes", persist: true },
        { key: "cementBagWeight", label: "Peso del saco de cemento", unit: "kg", persist: true },
        { key: "wastePercentage", label: "Desperdicio", unit: "%", persist: true },
      ],
    },
    {
      title: "Zócalo",
      fields: [
        { key: "perimeter", label: "Perímetro de los cuartos", unit: "m" },
        { key: "doorWidths", label: "Ancho de puertas (sin zócalo)", unit: "m" },
        { key: "baseboardPieceLength", label: "Largo de la pieza de zócalo", unit: "m", persist: true },
        { key: "baseboardWastePercentage", label: "Desperdicio de zócalo", unit: "%", persist: true },
        { key: "adhesiveKgPerMeter", label: "Adhesivo por metro de zócalo", unit: "kg", persist: true },
        { key: "adhesiveBagWeight", label: "Peso del saco de adhesivo", unit: "kg", persist: true },
      ],
      toggles: [{ key: "includeBaseboard", title: "Incluir zócalo" }],
      info: (v) => {
        const r = compute(v);
        return r && r.baseboardLength > 0 ? `Zócalo a instalar: ${r.baseboardLength.toFixed(2)} m.` : null;
      },
    },
  ],
  prices: [
    { key: "cementPrice", label: "Cemento", unit: "por saco", kind: "material", keywords: /cemento/, showWhen: (v) => v.n("area") > 0 },
    { key: "sandPrice", label: "Arena", unit: "por m³", kind: "material", keywords: /arena/, showWhen: (v) => v.n("area") > 0 },
    { key: "baseboardPrice", label: "Zócalo", unit: "por pieza", kind: "material", keywords: /zocalo|rodapie/, showWhen: (v) => Boolean(v.flags.includeBaseboard) },
    { key: "adhesivePrice", label: "Adhesivo para zócalo", unit: "por saco", kind: "material", keywords: /adhesivo|pegamento/, showWhen: (v) => Boolean(v.flags.includeBaseboard) },
    { key: "laborSubfloorPrice", label: "Contrapiso", unit: "por m²", kind: "labor", keywords: /contrapiso|nivelacion/, showWhen: (v) => v.n("area") > 0 },
    { key: "laborBaseboardPrice", label: "Instalación de zócalo", unit: "por metro", kind: "labor", keywords: /zocalo|rodapie/, showWhen: (v) => Boolean(v.flags.includeBaseboard) },
  ],
  validate: (v) => {
    if (v.n("area") <= 0 && !(v.flags.includeBaseboard && v.n("perimeter") > 0)) {
      return "Escribe el área del piso o el perímetro para el zócalo.";
    }
    if (v.n("area") > 0 && (v.n("thickness") <= 0 || v.n("mixCement") <= 0 || v.n("mixSand") <= 0)) {
      return "Revisa el espesor y la mezcla: deben ser mayores que 0.";
    }
    if (v.flags.includeBaseboard && v.n("perimeter") > 0 && v.n("baseboardPieceLength") <= 0) {
      return "Escribe el largo de la pieza de zócalo.";
    }
    return null;
  },
  compute: (v) => {
    const result = compute(v);
    if (!result) throw new Error("Contrapiso sin medidas");
    return result;
  },
  resultRows: (r) => {
    const rows: ResultRow[] = [];
    if (r.area > 0) {
      rows.push({ label: "Mortero", value: `${r.mortar.volumeWithWaste.toFixed(2)} m³`, strong: true });
      rows.push({ label: "Cemento", value: `${r.mortar.cementBagsToBuy} sacos` });
      rows.push({ label: "Arena", value: `${r.mortar.sandVolume.toFixed(2)} m³` });
    }
    if (r.baseboardLength > 0) {
      rows.push({ label: "Zócalo", value: `${r.baseboardLength.toFixed(2)} m · ${r.baseboardPieces} piezas`, strong: r.area <= 0 });
      rows.push({ label: "Adhesivo", value: `${r.adhesiveBags} sacos` });
    }
    return rows;
  },
  buildLine: (r, c) =>
    makeLine({
      description: r.area > 0 ? "Contrapiso con zócalo" : "Zócalo",
      unit: r.area > 0 ? "m²" : "m",
      quantity: r.area > 0 ? r.area : Number(r.baseboardLength.toFixed(2)),
      total: r.totalCost,
      costTotal: c.totalCost,
      materials: compactMaterials([
        material("Cemento", r.mortar.cementBagsToBuy, "saco", c.mortar.cementCost),
        material("Arena", Number(r.mortar.sandVolume.toFixed(2)), "m³", c.mortar.sandCost),
        material("Zócalo", r.baseboardPieces, "und.", c.baseboardCost),
        material("Adhesivo para zócalo", r.adhesiveBags, "saco", c.adhesiveCost),
      ]),
      notes: r.area > 0 ? `${r.mortar.volumeWithWaste.toFixed(2)} m³ de mortero` : `${r.baseboardPieces} piezas de zócalo`,
    }),
};
