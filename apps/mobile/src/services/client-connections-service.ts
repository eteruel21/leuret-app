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
  /** "ended": se aceptó y después una de las partes terminó la vinculación. */
  status: "pending" | "accepted" | "rejected" | "cancelled" | "ended";
  requires_phone_code: boolean;
  phone_code: string | null;
  phone_to_confirm: string | null;
  created_at: string;
};

export function listClientConnections(pendingOnly = false, space?: "client" | "company") {
  const query = new URLSearchParams();
  if (pendingOnly) query.set("pending", "true");
  if (space) query.set("space", space);
  const suffix = query.toString();
  return authenticatedRequest<{ requests: ClientConnection[] }>(
    suffix ? `/client-connections?${suffix}` : "/client-connections",
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

/**
 * Termina una vinculación aceptada. Desde el cliente basta la empresa; desde
 * la empresa se indica la ficha del cliente.
 */
export function endClientConnection(input: { companyId: string; clientId?: string }) {
  return authenticatedRequest<{ outcome: "ended" }>("/client-connections/end", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
