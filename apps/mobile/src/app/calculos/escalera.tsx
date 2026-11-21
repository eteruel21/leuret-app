import { escaleraConfig } from "@/calculators/configs/escalera";
import { CalculatorScreen } from "@/components/calculators/CalculatorScreen";

export default function EscaleraScreen() {
  return <CalculatorScreen config={escaleraConfig} />;
}
