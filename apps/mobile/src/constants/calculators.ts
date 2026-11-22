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
  | "/calculos/contrapiso"
  | "/calculos/cielo-falso-gypsum"
  | "/calculos/centro-carga"
  | "/calculos/escalera"
  | "/calculos/muro-retencion"
  | "/calculos/cisterna"
  | "/calculos/enchape"
  | "/calculos/estructura-metalica"
  | "/calculos/muro-bloques-reforzado"
  | "/calculos/paredes-gypsum"
  | "/calculos/baranda"
  | "/calculos/acera"
  | "/calculos/tragaluz";

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
  {
    id: "gypsum-ceiling",
    title: "Cielo falso de gypsum",
    description:
      "Láminas, canales, colgantes, tornillos y acabado.",
    icon: "remove-outline",
    enabled: true,
    route: "/calculos/cielo-falso-gypsum",
  },
  {
    id: "panel-grounding",
    title: "Centro de carga y tierra",
    description:
      "Tamaño del centro de carga, breakers y puesta a tierra.",
    icon: "flash-outline",
    enabled: true,
    route: "/calculos/centro-carga",
  },
  {
    id: "stairs",
    title: "Escalera de concreto",
    description:
      "Escalones, concreto, acero y encofrado de un tramo.",
    icon: "trending-up-outline",
    enabled: true,
    route: "/calculos/escalera",
  },
  {
    id: "retaining-wall",
    title: "Muro de retención",
    description:
      "Muro y zapata con barbacanas y grava de drenaje.",
    icon: "git-merge-outline",
    enabled: true,
    route: "/calculos/muro-retencion",
  },
  {
    id: "tank",
    title: "Cisterna",
    description:
      "Capacidad, concreto, acero e impermeabilización.",
    icon: "water-outline",
    enabled: true,
    route: "/calculos/cisterna",
  },
  {
    id: "wall-tiling",
    title: "Enchape de paredes",
    description:
      "Azulejo, pegamento, boquilla, crucetas y esquineros.",
    icon: "grid-outline",
    enabled: true,
    route: "/calculos/enchape",
  },
  {
    id: "steel-frame",
    title: "Estructura metálica",
    description:
      "Columnas, vigas y correas en kilos, soldadura y pintura.",
    icon: "construct-outline",
    enabled: true,
    route: "/calculos/estructura-metalica",
  },
  {
    id: "reinforced-masonry",
    title: "Muro de bloques reforzado",
    description:
      "Bloques por tamaño, mortero, celdas rellenas y varillas.",
    icon: "apps-outline",
    enabled: true,
    route: "/calculos/muro-bloques-reforzado",
  },
  {
    id: "gypsum-walls",
    title: "Paredes de gypsum completas",
    description:
      "Doble capa, marcos de puerta, aislante y esquineros.",
    icon: "reader-outline",
    enabled: true,
    route: "/calculos/paredes-gypsum",
  },
  {
    id: "railing",
    title: "Barandas y pasamanos",
    description:
      "Postes, rieles, barrotes, soldadura y pintura.",
    icon: "remove-outline",
    enabled: true,
    route: "/calculos/baranda",
  },
  {
    id: "walkway",
    title: "Aceras y pisos exteriores",
    description:
      "Concreto, base, malla, juntas y sellador.",
    icon: "footsteps-outline",
    enabled: true,
    route: "/calculos/acera",
  },
  {
    id: "skylight",
    title: "Tragaluces y claraboyas",
    description:
      "Policarbonato, marco de aluminio, sellador y botaguas.",
    icon: "sunny-outline",
    enabled: true,
    route: "/calculos/tragaluz",
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
  | "subfloor"
  | "gypsum-ceiling"
  | "panel-grounding"
  | "stairs"
  | "retaining-wall"
  | "tank"
  | "wall-tiling"
  | "steel-frame"
  | "reinforced-masonry"
  | "gypsum-walls"
  | "railing"
  | "walkway"
  | "skylight";

/** Calculadora por su código (el `formula_code` de un cálculo guardado). */
export function calculatorById(id: string | null | undefined): CalculationCategory | null {
  return CALCULATORS.find((calculator) => calculator.id === id) ?? null;
}
