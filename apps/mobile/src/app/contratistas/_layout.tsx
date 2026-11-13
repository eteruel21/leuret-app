import { ClientDetailStack } from "@/components/client/ClientDetailStack";

export default function ContractorDetailsLayout() {
  return <ClientDetailStack title="Contratista" fallback="/(client-tabs)" />;
}
