import { ventilacionConfig } from "@/calculators/configs/ventilacion";
import { CalculatorScreen } from "@/components/calculators/CalculatorScreen";

export default function VentilacionScreen() {
  return <CalculatorScreen config={ventilacionConfig} />;
}
