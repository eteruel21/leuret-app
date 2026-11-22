import { barandaConfig } from "@/calculators/configs/baranda";
import { CalculatorScreen } from "@/components/calculators/CalculatorScreen";

export default function BarandaScreen() {
  return <CalculatorScreen config={barandaConfig} />;
}
