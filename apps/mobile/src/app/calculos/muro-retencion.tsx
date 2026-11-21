import { muroRetencionConfig } from "@/calculators/configs/muro-retencion";
import { CalculatorScreen } from "@/components/calculators/CalculatorScreen";

export default function MuroRetencionScreen() {
  return <CalculatorScreen config={muroRetencionConfig} />;
}
