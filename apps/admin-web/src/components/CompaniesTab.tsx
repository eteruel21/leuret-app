import { Building2, Eye, Loader2, RefreshCw, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PlatformUser } from "../admin-data";
import {
  COMPANY_ROLE_LABELS,
  PROJECT_STATUS_LABELS,
  filterCompanies,
  isIdle,
  isNew,
  loadAdminCompanies,
  loadAdminCompanyDetail,
  relativeDays,
  type AdminCompany,
  type AdminCompanyDetail,
  type CompanyFilter,
  type CompanySort,
} from "../companies-data";
import { errorMessage, formatDate } from "../utils/helpers";
import { AlertBanner, EmptyState, SectionHeader, Table } from "./CommonUI";

interface CompaniesTabProps {
  users: PlatformUser[];
  onViewProfile: (user: PlatformUser) => void;
}

const FILTERS: Array<{ value: CompanyFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "active", label: "Activas" },
  { value: "inactive", label: "Inactivas" },
  { value: "new", label: "Nuevas (30 días)" },
  { value: "idle", label: "Sin actividad (30 días)" },
];

const SORTS: Array<{ value: CompanySort; label: string }> = [
  { value: "recent", label: "Más recientes" },
  { value: "activity", label: "Última actividad" },
  { value: "projects", label: "Más obras activas" },
  { value: "name", label: "Nombre (A-Z)" },
];

export function CompaniesTab({ users, onViewProfile }: CompaniesTabProps) {
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CompanyFilter>("all");
  const [sort, setSort] = useState<CompanySort>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCompanies(await loadAdminCompanies());
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => filterCompanies(companies, search, filter, sort), [companies, search, filter, sort]);

  const stats = useMemo(
    () => ({
      total: companies.length,
      active: companies.filter((company) => company.active).length,
      working: companies.filter((company) => company.activeProjectCount > 0).length,
      fresh: companies.filter((company) => isNew(company)).length,
    }),
    [companies]
  );

  return (
    <>
      {error && <AlertBanner message={error} onClose={() => setError(null)} />}

      <div className="stats-grid">
        <div className="stat-card">
          <span>Empresas</span>
          <strong>{stats.total}</strong>
          <small>{stats.active} activas</small>
        </div>
        <div className="stat-card">
          <span>Con obras activas</span>
          <strong>{stats.working}</strong>
          <small>{stats.total ? Math.round((stats.working / stats.total) * 100) : 0}% del total</small>
        </div>
        <div className="stat-card">
          <span>Nuevas</span>
          <strong>{stats.fresh}</strong>
          <small>Últimos 30 días</small>
        </div>
        <div className="stat-card">
          <span>Sin actividad</span>
          <strong>{companies.filter((company) => isIdle(company)).length}</strong>
          <small>Más de 30 días</small>
        </div>
      </div>

      <section className="data-card">
        <div className="card-toolbar companies-toolbar">
          <SectionHeader title="Empresas registradas" subtitle={`${visible.length} de ${companies.length} empresas`} />
          <div className="toolbar-actions companies-controls">
            <input
              className="search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, RUC, propietario o correo..."
              aria-label="Buscar empresas"
            />
            <select value={filter} onChange={(event) => setFilter(event.target.value as CompanyFilter)} aria-label="Filtrar empresas">
              {FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select value={sort} onChange={(event) => setSort(event.target.value as CompanySort)} aria-label="Ordenar empresas">
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button className="icon-button" onClick={() => void load()} disabled={loading} aria-label="Actualizar" title="Actualizar">
              <RefreshCw size={17} className={loading ? "spin" : undefined} />
            </button>
          </div>
        </div>

        {loading && companies.length === 0 ? (
          <div className="review-loading">
            <Loader2 className="spin" size={22} />
            <span>Cargando empresas...</span>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState label={companies.length ? "Ninguna empresa coincide con la búsqueda." : "Todavía no hay empresas registradas."} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Propietario</th>
                <th>Equipo</th>
                <th>Obras</th>
                <th>Clientes</th>
                <th>Última actividad</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((company) => (
                <tr key={company.id} className="clickable-row" onClick={() => setSelectedId(company.id)}>
                  <td>
                    <strong>{company.name}</strong>
                    <small>{[company.legalName, company.taxId && `RUC ${company.taxId}`].filter(Boolean).join(" · ") || `Desde ${formatDate(company.createdAt)}`}</small>
                  </td>
                  <td>
                    <strong>{company.ownerName || "—"}</strong>
                    <small>{company.ownerEmail || ""}</small>
                  </td>
                  <td>
                    {company.activeMemberCount}
                    <small>de {company.memberCount}</small>
                  </td>
                  <td>
                    {company.activeProjectCount} activas
                    <small>{company.projectCount} en total</small>
                  </td>
                  <td>{company.clientCount}</td>
                  <td>
                    <span className={isIdle(company) ? "muted-warning" : undefined}>{relativeDays(company.lastActivityAt)}</span>
                  </td>
                  <td>
                    <span className={`badge ${company.active ? "badge-active" : "badge-suspended"}`}>
                      {company.active ? "Activa" : "Inactiva"}
                    </span>
                    {isNew(company) && <span className="badge badge-pending companies-new-badge">Nueva</span>}
                  </td>
                  <td>
                    <button
                      className="button button-secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(company.id);
                      }}
                    >
                      <Eye size={15} />
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {selectedId && (
        <CompanyDetailModal
          companyId={selectedId}
          users={users}
          onClose={() => setSelectedId(null)}
          onViewProfile={(user) => {
            setSelectedId(null);
            onViewProfile(user);
          }}
        />
      )}
    </>
  );
}

function CompanyDetailModal({
  companyId,
  users,
  onClose,
  onViewProfile,
}: {
  companyId: string;
  users: PlatformUser[];
  onClose: () => void;
  onViewProfile: (user: PlatformUser) => void;
}) {
  const [detail, setDetail] = useState<AdminCompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadAdminCompanyDetail(companyId)
      .then((result) => active && setDetail(result))
      .catch((loadError) => active && setError(errorMessage(loadError)));
    return () => {
      active = false;
    };
  }, [companyId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const company = detail?.company;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="company-detail-title">
        <div className="modal-header">
          <div>
            <h2 id="company-detail-title">{company?.name ?? "Empresa"}</h2>
            <p>{company ? `${company.active ? "Activa" : "Inactiva"} · registrada el ${formatDate(company.createdAt)}` : "Cargando..."}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={19} />
          </button>
        </div>

        <div className="modal-body">
          {error && <AlertBanner message={error} />}
          {!detail && !error && (
            <div className="review-loading">
              <Loader2 className="spin" size={22} />
              <span>Cargando detalle...</span>
            </div>
          )}

          {detail && company && (
            <>
              <section className="review-section">
                <div className="profile-section-heading">
                  <Building2 size={18} />
                  <h3>Datos de la empresa</h3>
                </div>
                <div className="review-grid">
                  <Value label="Razón social" value={company.legalName} />
                  <Value label="RUC" value={company.taxId} />
                  <Value label="Correo" value={company.email} />
                  <Value label="Teléfono" value={company.phone} />
                  <Value label="Dirección" value={company.address} />
                  <Value label="Moneda / zona" value={`${company.currencyCode} · ${company.timezone ?? "—"}`} />
                </div>
              </section>

              <section className="review-section">
                <div className="profile-section-heading">
                  <UserRound size={18} />
                  <h3>Equipo ({detail.members.filter((member) => member.active).length} activos)</h3>
                </div>
                {detail.members.length === 0 ? (
                  <EmptyState label="Esta empresa no tiene miembros." />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <th>Persona</th>
                        <th>Rol</th>
                        <th>Desde</th>
                        <th>Estado</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.members.map((member) => {
                        const platformUser = usersById.get(member.userId);
                        return (
                          <tr key={member.id}>
                            <td>
                              <strong>{member.fullName || member.email}</strong>
                              <small>{member.email}{member.phone ? ` · ${member.phone}` : ""}</small>
                            </td>
                            <td>{COMPANY_ROLE_LABELS[member.role] ?? member.role}</td>
                            <td>{formatDate(member.joinedAt)}</td>
                            <td>
                              <span className={`badge ${member.active ? "badge-active" : "badge-suspended"}`}>
                                {member.active ? "Activo" : "Inactivo"}
                              </span>
                            </td>
                            <td>
                              {platformUser && (
                                <button className="button button-ghost" onClick={() => onViewProfile(platformUser)}>
                                  <Eye size={15} />
                                  Perfil
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </section>

              <section className="review-section">
                <div className="profile-section-heading">
                  <Building2 size={18} />
                  <h3>Obras recientes</h3>
                </div>
                {detail.recentProjects.length === 0 ? (
                  <EmptyState label="Todavía no tiene obras registradas." />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <th>Obra</th>
                        <th>Estado</th>
                        <th>Avance</th>
                        <th>Actualizada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.recentProjects.map((project) => (
                        <tr key={project.id}>
                          <td>
                            <strong>{project.name}</strong>
                            <small>{project.projectCode ?? ""}</small>
                          </td>
                          <td>{PROJECT_STATUS_LABELS[project.status] ?? project.status}</td>
                          <td>
                            <div className="progress-bar" aria-label={`${Math.round(project.progressPercentage)}%`}>
                              <span style={{ width: `${Math.min(100, Math.max(0, project.progressPercentage))}%` }} />
                            </div>
                            <small>{Math.round(project.progressPercentage)}%</small>
                          </td>
                          <td>{relativeDays(project.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </section>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="button button-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Value({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="review-value">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}
