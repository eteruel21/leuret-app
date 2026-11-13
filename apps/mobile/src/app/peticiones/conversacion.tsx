import { useLocalSearchParams } from "expo-router";

import { ConversationView } from "@/components/job-requests/ConversationView";
import { LeuretEmptyState } from "@/components/LeuretEmptyState";
import { useCompany } from "@/contexts/CompanyContext";

export default function ContractorJobRequestConversationScreen() {
  const { requestId, companyId } = useLocalSearchParams<{ requestId?: string; companyId?: string }>();
  const { activeCompany } = useCompany();
  // El aviso push trae la empresa; si no, se usa la empresa activa.
  const company = companyId || activeCompany?.id;

  if (!requestId || !company) {
    return <LeuretEmptyState icon="chatbubbles-outline" title="Conversación no encontrada" description="Vuelve a la petición y ábrela de nuevo." />;
  }

  return (
    <ConversationView
      requestId={requestId}
      companyId={company}
      emptyHint="Pregunta lo que necesites para cotizar: medidas, materiales, acceso, horarios… El cliente recibe un aviso."
    />
  );
}
