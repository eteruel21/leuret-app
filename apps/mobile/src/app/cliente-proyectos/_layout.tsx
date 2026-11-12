import { ClientDetailStack } from "@/components/client/ClientDetailStack";

export default function ClientProjectLayout() {
  return <ClientDetailStack title="Proyecto" fallback="/(client-tabs)/proyectos" />;
}
