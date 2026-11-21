import { cisternaConfig } from "@/calculators/configs/cisterna";
import { CalculatorScreen } from "@/components/calculators/CalculatorScreen";

export default function CisternaScreen() {
  return <CalculatorScreen config={cisternaConfig} />;
}
