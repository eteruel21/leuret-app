import { ClientDetailStack } from "@/components/client/ClientDetailStack";

export default function ClientInvoiceLayout() {
  return <ClientDetailStack title="Factura" fallback="/(client-tabs)/facturas" />;
}
