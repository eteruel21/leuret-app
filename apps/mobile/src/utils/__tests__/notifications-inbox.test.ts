import { describe, expect, it } from "vitest";

import {
  badgeLabel,
  bellAccessibilityLabel,
  bellCount,
  inboxConversationRoute,
  inboxPreview,
  refreshesBell,
} from "../notifications-inbox";

describe("campana de notificaciones", () => {
  it("suma solicitudes pendientes y mensajes sin leer", () => {
    expect(bellCount(1, 3)).toBe(4);
    expect(bellCount(0, 0)).toBe(0);
    expect(bellCount(Number.NaN, -2)).toBe(0);
  });

  it("limita el globo a 9+", () => {
    expect(badgeLabel(4)).toBe("4");
    expect(badgeLabel(12)).toBe("9+");
  });

  it("describe la campana para lectores de pantalla", () => {
    expect(bellAccessibilityLabel(0)).toBe("Notificaciones");
    expect(bellAccessibilityLabel(1)).toBe("Notificaciones, 1 nueva");
    expect(bellAccessibilityLabel(3)).toBe("Notificaciones, 3 nuevas");
  });

  it("se actualiza con los avisos de mensajes y de solicitudes", () => {
    expect(refreshesBell("job_request.message")).toBe(true);
    expect(refreshesBell("client_connection.requested")).toBe(true);
    expect(refreshesBell("budget.sent")).toBe(false);
    expect(refreshesBell(undefined)).toBe(false);
  });
});

describe("vista previa y destino de cada conversación", () => {
  it("marca los mensajes propios y las fotos", () => {
    expect(inboxPreview({ side: "client", last_sender_side: "company", last_body: "¿Los llevo nuevos?", last_has_photo: false }))
      .toBe("¿Los llevo nuevos?");
    expect(inboxPreview({ side: "company", last_sender_side: "company", last_body: "Mañana paso", last_has_photo: false }))
      .toBe("Tú: Mañana paso");
    expect(inboxPreview({ side: "client", last_sender_side: "company", last_body: null, last_has_photo: true }))
      .toBe("Foto");
  });

  it("abre la conversación del lado que corresponde", () => {
    const ids = { request_id: "r1", company_id: "c1" };
    expect(inboxConversationRoute({ ...ids, side: "client" })).toEqual({
      pathname: "/cliente-peticiones/conversacion",
      params: { requestId: "r1", companyId: "c1" },
    });
    expect(inboxConversationRoute({ ...ids, side: "company" }).pathname).toBe("/peticiones/conversacion");
  });
});
