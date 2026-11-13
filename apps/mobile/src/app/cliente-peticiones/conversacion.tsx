import { useLocalSearchParams } from "expo-router";

import { ConversationView } from "@/components/job-requests/ConversationView";
import { LeuretEmptyState } from "@/components/LeuretEmptyState";

export default function ClientJobRequestConversationScreen() {
  const { requestId, companyId } = useLocalSearchParams<{ requestId?: string; companyId?: string }>();

  if (!requestId || !companyId) {
    return <LeuretEmptyState icon="chatbubbles-outline" title="Conversación no encontrada" description="Vuelve a la petición y ábrela de nuevo." />;
  }

  return (
    <ConversationView
      requestId={requestId}
      companyId={companyId}
      emptyHint="Aquí verás las preguntas de la empresa sobre tu trabajo."
    />
  );
}
