import { useCallback } from "react";

import { useCompany } from "@/contexts/CompanyContext";
import { can as canRole, type Capability } from "@/permissions/permissions";
import type { CompanyRole } from "@/types/company";

export function usePermissions(): {
  role: CompanyRole | null;
  loading: boolean;
  can: (capability: Capability) => boolean;
} {
  const { activeMembership, loading } = useCompany();
  const role = activeMembership?.active === false ? null : activeMembership?.role ?? null;

  const can = useCallback(
    (capability: Capability) => canRole(role, capability),
    [role]
  );

  return { role, loading, can };
}
