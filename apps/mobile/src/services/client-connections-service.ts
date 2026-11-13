import { authenticatedRequest } from "@/services/api";

export type ConnectionOutcome = "sent" | "pending" | "linked" | "not_found" | "ambiguous" | "ambiguous_company"
  | "ambiguous_record" | "unavailable_record" | "forbidden";

export type ConnectionAction = "accept" | "reject" | "cancel";

export type ClientConnection = {
  id: string;
  company_id: string;
  client_id: string | null;
  name: string;
  incoming: boolean;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  requires_phone_code: boolean;
  phone_code: string | null;
  phone_to_confirm: string | null;
  created_at: string;
};

export function listClientConnections(pendingOnly = false) {
  return authenticatedRequest<{ requests: ClientConnection[] }>(
    pendingOnly ? "/client-connections?pending=true" : "/client-connections",
  );
}

export function requestClientConnection(input: { companyId?: string; clientId?: string; email?: string; phone?: string }) {
  return authenticatedRequest<{ outcome: ConnectionOutcome }>("/client-connections", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function respondToClientConnection(id: string, action: ConnectionAction, phoneCode?: string) {
  return authenticatedRequest(`/client-connections/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ action, phoneCode }),
  });
}
