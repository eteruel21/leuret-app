import { drenajePluvialConfig } from "@/calculators/configs/drenaje-pluvial";
import { CalculatorScreen } from "@/components/calculators/CalculatorScreen";

export default function DrenajePluvialScreen() {
  return <CalculatorScreen config={drenajePluvialConfig} />;
}
