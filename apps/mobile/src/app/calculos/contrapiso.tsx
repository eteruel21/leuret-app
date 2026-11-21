import { contrapisoConfig } from "@/calculators/configs/contrapiso";
import { CalculatorScreen } from "@/components/calculators/CalculatorScreen";

export default function ContrapisoScreen() {
  return <CalculatorScreen config={contrapisoConfig} />;
}
