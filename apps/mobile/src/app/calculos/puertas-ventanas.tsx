import { puertasVentanasConfig } from "@/calculators/configs/puertas-ventanas";
import { CalculatorScreen } from "@/components/calculators/CalculatorScreen";

export default function PuertasVentanasScreen() {
  return <CalculatorScreen config={puertasVentanasConfig} />;
}
