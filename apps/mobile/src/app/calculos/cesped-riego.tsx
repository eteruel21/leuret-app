import { cespedRiegoConfig } from "@/calculators/configs/cesped-riego";
import { CalculatorScreen } from "@/components/calculators/CalculatorScreen";

export default function CespedRiegoScreen() {
  return <CalculatorScreen config={cespedRiegoConfig} />;
}
