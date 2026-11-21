import type { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

export type CalculatorRoute =
  | "/calculos/concreto"
  | "/calculos/bloques-repello"
  | "/calculos/gypsum"
  | "/calculos/cielo-raso-pvc"
  | "/calculos/pintura"
  | "/calculos/pisos"
  | "/calculos/electricidad"
  | "/calculos/sistemas-especiales"
  | "/calculos/aire-acondicionado"
  | "/calculos/muebles-mdf"
  | "/calculos/acero"
  | "/calculos/techos"
  | "/calculos/plomeria"
  | "/calculos/impermeabilizacion"
  | "/calculos/excavacion"
  | "/calculos/encofrado"
  | "/calculos/estructura"
  | "/calculos/cercas"
  | "/calculos/puertas-ventanas"
  | "/calculos/premezclado"
  | "/calculos/contrapiso";

export type CalculationCategory = {
  id: string;
  title: string;
  description: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  enabled: boolean;
  route?: CalculatorRoute;
};

/** Las calculadoras: pestaña Cálculos y botón «Calculadoras» del presupuesto. */
export const CALCULATORS: CalculationCategory[] = [
  {
    id: "concrete",
    title: "Concreto",
    description:
      "Volumen, cemento, arena, piedra y mano de obra.",
    icon: "cube-outline",
    enabled: true,
    route: "/calculos/concreto",
  },
  {
    id: "blocks",
    title: "Bloques y repello",
    description:
      "Muros, bloques, mortero, repello y desperdicio.",
    icon: "grid-outline",
    enabled: true,
    route: "/calculos/bloques-repello",
  },
  {
    id: "gypsum",
    title: "Gypsum",
    description:
      "Láminas, perfiles, tornillos y compuesto.",
    icon: "layers-outline",
    enabled: true,
    route: "/calculos/gypsum",
  },
  {
    id: "pvc",
    title: "Cielo raso PVC",
    description:
      "Láminas, tracks, studs, cargadores y accesorios.",
    icon: "apps-outline",
    enabled: true,
    route: "/calculos/cielo-raso-pvc",
  },
  {
    id: "paint",
    title: "Pintura",
    description:
      "Área, galones, manos de pintura y mano de obra.",
    icon: "color-palette-outline",
    enabled: true,
    route: "/calculos/pintura",
  },
  {
    id: "flooring",
    title: "Pisos",
    description:
      "Cerámica, porcelanato, adhesivo y boquilla.",
    icon: "square-outline",
    enabled: true,
    route: "/calculos/pisos",
  },
  {
    id: "electricity",
    title: "Electricidad",
    description:
      "Puntos, cables, tuberías, breakers y accesorios.",
    icon: "flash-outline",
    enabled: true,
    route: "/calculos/electricidad",
  },
  {
    id: "special-systems",
    title: "Sistemas especiales",
    description:
      "Cámaras, alarmas, incendio y control de acceso.",
    icon: "videocam-outline",
    enabled: true,
    route: "/calculos/sistemas-especiales",
  },
  {
    id: "air-conditioning",
    title: "Aire acondicionado",
    description:
      "BTU, tuberías, cableado, drenaje e instalación.",
    icon: "snow-outline",
    enabled: true,
    route: "/calculos/aire-acondicionado",
  },
  {
    id: "mdf",
    title: "Muebles MDF",
    description:
      "Tableros, cortes, cantos, herrajes y fabricación.",
    icon: "file-tray-full-outline",
    enabled: true,
    route: "/calculos/muebles-mdf",
  },
  {
    id: "rebar",
    title: "Acero de refuerzo",
    description:
      "Varillas, estribos, malla, alambre de amarre y armado.",
    icon: "construct-outline",
    enabled: true,
    route: "/calculos/acero",
  },
  {
    id: "roofing",
    title: "Techos y cubiertas",
    description:
      "Láminas, carriolas, tornillos, cumbrera y canal.",
    icon: "home-outline",
    enabled: true,
    route: "/calculos/techos",
  },
  {
    id: "plumbing",
    title: "Plomería",
    description:
      "Tubería de agua y drenaje, accesorios y aparatos.",
    icon: "water-outline",
    enabled: true,
    route: "/calculos/plomeria",
  },
  {
    id: "waterproofing",
    title: "Impermeabilización",
    description:
      "Galones, imprimante, malla y mano de obra.",
    icon: "umbrella-outline",
    enabled: true,
    route: "/calculos/impermeabilizacion",
  },
  {
    id: "earthwork",
    title: "Excavación y relleno",
    description:
      "Volumen, viajes de volquete y relleno compactado.",
    icon: "layers-outline",
    enabled: true,
    route: "/calculos/excavacion",
  },
  {
    id: "formwork",
    title: "Encofrado",
    description:
      "Plywood, madera y clavos según los usos.",
    icon: "albums-outline",
    enabled: true,
    route: "/calculos/encofrado",
  },
  {
    id: "structure",
    title: "Estructura",
    description:
      "Zapatas, columnas, vigas y losa: concreto, acero y encofrado.",
    icon: "business-outline",
    enabled: true,
    route: "/calculos/estructura",
  },
  {
    id: "fence",
    title: "Cercas",
    description:
      "Malla ciclón: postes, malla, púas y portones.",
    icon: "git-network-outline",
    enabled: true,
    route: "/calculos/cercas",
  },
  {
    id: "openings",
    title: "Puertas y ventanas",
    description:
      "Unidades, herrajes, vidrio, sellador e instalación.",
    icon: "enter-outline",
    enabled: true,
    route: "/calculos/puertas-ventanas",
  },
  {
    id: "ready-mix",
    title: "Concreto premezclado",
    description:
      "Pedido a la planta: m³, camiones, carga corta y bomba.",
    icon: "car-outline",
    enabled: true,
    route: "/calculos/premezclado",
  },
  {
    id: "subfloor",
    title: "Contrapiso y zócalo",
    description:
      "Mortero de nivelación, zócalo, adhesivo y mano de obra.",
    icon: "reorder-four-outline",
    enabled: true,
    route: "/calculos/contrapiso",
  },
];

export type CalculatorId =
  | "concrete"
  | "blocks"
  | "gypsum"
  | "pvc"
  | "paint"
  | "flooring"
  | "electricity"
  | "special-systems"
  | "air-conditioning"
  | "mdf"
  | "rebar"
  | "roofing"
  | "plumbing"
  | "waterproofing"
  | "earthwork"
  | "formwork"
  | "structure"
  | "fence"
  | "openings"
  | "ready-mix"
  | "subfloor";

/** Calculadora por su código (el `formula_code` de un cálculo guardado). */
export function calculatorById(id: string | null | undefined): CalculationCategory | null {
  return CALCULATORS.find((calculator) => calculator.id === id) ?? null;
}
