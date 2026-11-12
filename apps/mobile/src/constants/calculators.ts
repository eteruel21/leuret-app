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
  | "/calculos/muebles-mdf";

export type CalculationCategory = {
  id: string;
  title: string;
  description: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  enabled: boolean;
  route?: CalculatorRoute;
};

/** Las 10 calculadoras: pestaña Cálculos y botón «Calculadoras» del presupuesto. */
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
];
