import { useCallback, useEffect, useState } from "react";
import { Loader2, LogOut, MonitorSmartphone } from "lucide-react";

import { type UserSession, dateTime, describeUserAgent, loadUserSessions, revokeUserSessions } from "../../operations-data";
import { errorMessage } from "../../utils/helpers";
import { AlertBanner, EmptyState, SuccessBanner } from "../CommonUI";

/** Sesiones abiertas de un usuario y cierre forzado (queda en la auditoría). */
export function UserSessionsPanel({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSessions(await loadUserSessions(userId));
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke() {
    if (reason.trim().length < 5) {
      setError("Indica el motivo (mínimo 5 caracteres). Queda registrado en la auditoría.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const count = await revokeUserSessions(userId, reason.trim());
      setSuccess(count ? `Se cerraron ${count} sesión${count === 1 ? "" : "es"}. El usuario deberá iniciar sesión de nuevo.` : "No había sesiones activas.");
      setFormOpen(false);
      setReason("");
      await load();
    } catch (revokeError) {
      setError(errorMessage(revokeError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="review-section">
      <div className="profile-section-heading">
        <MonitorSmartphone size={18} />
        <h3>Sesiones activas {sessions ? `(${sessions.length})` : ""}</h3>
      </div>
      {error && <AlertBanner message={error} onClose={() => setError(null)} />}
      {success && <SuccessBanner message={success} />}
      {!sessions && !error && (
        <div className="review-loading">
          <Loader2 className="spin" size={18} />
          <span>Cargando sesiones...</span>
        </div>
      )}
      {sessions && sessions.length === 0 && <EmptyState label="No tiene sesiones abiertas." />}
      {sessions && sessions.length > 0 && (
        <ul className="drawer-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <div>
                <strong>{describeUserAgent(session.userAgent)}</strong>
                <small>{[session.ipAddress, `Inició ${dateTime(session.createdAt)}`].filter(Boolean).join(" · ")}</small>
              </div>
              <span className="muted-text">Último uso {dateTime(session.lastUsedAt ?? session.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}

      {sessions && sessions.length > 0 && !isSelf && (
        formOpen ? (
          <div className="company-status-form">
            <label className="field">
              <span>Motivo para cerrar todas las sesiones (queda en la auditoría)</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Ej.: El usuario reportó la pérdida de su teléfono."
              />
            </label>
            <div className="actions">
              <button className="button button-secondary" type="button" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="button button-danger" type="button" onClick={() => void revoke()} disabled={saving}>
                {saving ? <Loader2 className="spin" size={16} /> : <LogOut size={16} />}
                Cerrar todas las sesiones
              </button>
            </div>
          </div>
        ) : (
          <button className="button button-danger" type="button" onClick={() => setFormOpen(true)}>
            <LogOut size={16} />
            Cerrar sesiones del usuario
          </button>
        )
      )}
    </section>
  );
}
