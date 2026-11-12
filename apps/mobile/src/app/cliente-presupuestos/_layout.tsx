import { ClientDetailStack } from "@/components/client/ClientDetailStack";

export default function ClientBudgetLayout() {
  return <ClientDetailStack title="Presupuesto" fallback="/(client-tabs)/presupuestos" />;
}
