import type { PropsWithChildren } from "react";

import { AdminPlaceholder } from "@/components/AdminPlaceholder";
import { LeuretLoading } from "@/components/LeuretLoading";
import { usePermissions } from "@/hooks/usePermissions";
import { ROLE_LABELS, type Capability } from "@/permissions/permissions";

type RequirePermissionProps = PropsWithChildren<{
  capability: Capability;
  /** Nombre de la sección, por ejemplo "Presupuestos". */
  section: string;
}>;

/**
 * Muestra el contenido solo si el rol activo tiene la capacidad.
 * Si no, explica el motivo en vez de dejar que la API responda 403.
 */
export function RequirePermission({
  capability,
  section,
  children,
}: RequirePermissionProps) {
  const { role, loading, can } = usePermissions();

  if (loading) {
    return <LeuretLoading fullScreen message="Verificando acceso…" />;
  }

  if (!can(capability)) {
    const roleText = role ? `Tu rol (${ROLE_LABELS[role]})` : "Tu cuenta";

    return (
      <AdminPlaceholder
        title={section}
        icon="lock-closed-outline"
        description={`${roleText} no tiene acceso a esta sección. Si lo necesitas, pide al propietario o a un administrador de la empresa que cambie tu rol.`}
      />
    );
  }

  return <>{children}</>;
}
