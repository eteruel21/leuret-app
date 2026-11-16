import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { AppState, Platform } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import {
  createCompanyRecord,
  listCompanyMemberships
} from "@/services/company-service";
import type {
  Company,
  CompanyMembership
} from "@/types/company";
import { changesMembership } from "@/utils/notifications-inbox";

/** Al volver a la app, las empresas se recargan como máximo cada minuto. */
const FOREGROUND_REFRESH_MS = 60_000;

const ACTIVE_COMPANY_KEY =
  "@contractor-pro:active-company-id";
const CLIENT_SPACE = "client";
const NO_MEMBERSHIPS: CompanyMembership[] = [];

type WorkspaceSnapshot = {
  scope: string;
  memberships: CompanyMembership[];
  activeCompanyId: string | null;
};

type WorkspaceRequest = {
  scope: string;
  refreshing: boolean;
  error: string | null;
};

type CreateCompanyInput = {
  name: string;
  phone?: string;
  email?: string;
};

type CompanyContextValue = {
  memberships: CompanyMembership[];
  companies: Company[];
  activeCompany: Company | null;
  activeMembership:
    | CompanyMembership
    | null;
  loading: boolean;
  refreshing: boolean;
  initialError: string | null;

  /** Recarga las empresas. Si se indica `preferredCompanyId` y existe, la activa. */
  refreshCompanies: (preferredCompanyId?: string) => Promise<boolean>;

  setActiveCompanyId: (
    companyId: string
  ) => Promise<void>;
  useClientSpace: () => Promise<void>;

  createCompany: (
    input: CreateCompanyInput
  ) => Promise<{
    companyId: string | null;
    error: string | null;
  }>;
};

const CompanyContext =
  createContext<CompanyContextValue | null>(
    null
  );

export function CompanyProvider({
  children
}: PropsWithChildren) {
  const { session, profile, loading: authLoading } = useAuth();
  const userId = profile?.id;
  const hasClientSpace = profile?.role === "client";
  const canLoadCompanies = Boolean(profile?.active);
  const scope = session?.sessionId && userId
    ? JSON.stringify([session.sessionId, userId, profile.role])
    : null;
  const preferenceKey = userId ? `${ACTIVE_COMPANY_KEY}:${userId}` : null;

  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [request, setRequest] = useState<WorkspaceRequest | null>(null);
  const currentScope = useRef(scope);
  const sequence = useRef(0);
  const pending = useRef<{ scope: string; preferred?: string; promise: Promise<boolean> } | null>(null);
  const preference = useRef<{ scope: string; value: string | null } | null>(null);

  useLayoutEffect(() => {
    currentScope.current = scope;
    return () => { currentScope.current = null; };
  }, [scope]);

  const visible = scope && snapshot?.scope === scope ? snapshot : null;
  const memberships = visible?.memberships ?? NO_MEMBERSHIPS;
  const activeCompanyId = visible?.activeCompanyId ?? null;
  const initialError = scope && request?.scope === scope && !visible ? request.error : null;
  const loading = authLoading || Boolean(canLoadCompanies && scope && !visible && !initialError);
  const refreshing = Boolean(scope && request?.scope === scope && request.refreshing);

  const companies = useMemo(() => memberships.map(({ company }) => company).filter(Boolean), [memberships]);
  const activeMembership = memberships.find(({ company_id }) => company_id === activeCompanyId) ?? null;
  const activeCompany = activeMembership?.company ?? null;

  const refreshCompanies = useCallback(async (preferredCompanyId?: string) => {
    // Accepting an invitation can activate a membership before the profile is refreshed.
    if (!scope || !preferenceKey || currentScope.current !== scope) return false;
    if (pending.current?.scope === scope && (!preferredCompanyId || pending.current.preferred === preferredCompanyId)) {
      return pending.current.promise;
    }

    const requestId = ++sequence.current;
    const isCurrent = () => currentScope.current === scope && requestId === sequence.current;
    const preferenceAtStart = preference.current;
    setRequest({ scope, refreshing: true, error: null });

    const promise = (async () => {
      try {
        const [result, storedPreference] = await Promise.all([
          listCompanyMemberships(),
          preferenceAtStart?.scope === scope
            ? Promise.resolve(preferenceAtStart.value)
            : AsyncStorage.getItem(preferenceKey)
                .then((stored) => stored ?? AsyncStorage.getItem(ACTIVE_COMPANY_KEY))
                .catch(() => null),
        ]);
        if (!isCurrent()) return false;
        if (result.error) {
          setRequest({ scope, refreshing: false, error: result.error });
          return false;
        }

        const selected = preference.current?.scope === scope ? preference.current.value : storedPreference;
        const preferred = preference.current === preferenceAtStart ? preferredCompanyId : undefined;
        const canSelect = (id?: string | null) => result.memberships.some(({ company_id }) => company_id === id);
        let companyId = hasClientSpace ? null : result.memberships[0]?.company_id ?? null;
        if (preferred && canSelect(preferred)) {
          companyId = preferred;
        } else if (canSelect(selected)) {
          companyId = selected;
        }

        const value = companyId ?? (hasClientSpace ? CLIENT_SPACE : null);
        preference.current = { scope, value };
        setSnapshot({ scope, memberships: result.memberships, activeCompanyId: companyId });
        setRequest({ scope, refreshing: false, error: null });
        if (value) void AsyncStorage.setItem(preferenceKey, value).catch(() => undefined);

        return !preferredCompanyId || companyId === preferredCompanyId;
      } catch {
        if (isCurrent()) {
          setRequest({ scope, refreshing: false, error: "Revisa tu conexión e intenta cargar tu espacio de nuevo." });
        }
        return false;
      } finally {
        if (isCurrent()) pending.current = null;
      }
    })();
    pending.current = { scope, preferred: preferredCompanyId, promise };
    return promise;
  }, [hasClientSpace, preferenceKey, scope]);

  useEffect(() => {
    if (!scope) {
      setSnapshot(null);
      setRequest(null);
      preference.current = null;
      pending.current = null;
    } else if (canLoadCompanies) {
      void refreshCompanies();
    }
  }, [canLoadCompanies, refreshCompanies, scope]);

  // Un rol cambiado o un acceso retirado por otra persona se refleja al volver
  // a la app o al recibir el aviso, sin esperar a que la API responda 403.
  useEffect(() => {
    if (!scope || !canLoadCompanies) return;
    let lastForegroundRefresh = Date.now();
    const appState = AppState.addEventListener("change", (state) => {
      if (state !== "active" || Date.now() - lastForegroundRefresh < FOREGROUND_REFRESH_MS) return;
      lastForegroundRefresh = Date.now();
      void refreshCompanies();
    });
    const push = Platform.OS === "web" ? null : Notifications.addNotificationReceivedListener((notification) => {
      if (changesMembership(notification.request.content.data?.type)) void refreshCompanies();
    });
    return () => {
      appState.remove();
      push?.remove();
    };
  }, [canLoadCompanies, refreshCompanies, scope]);

  const selectSpace = useCallback(async (companyId: string | null) => {
    if (!scope || !preferenceKey || currentScope.current !== scope) return;
    const value = companyId ?? CLIENT_SPACE;
    preference.current = { scope, value };
    setSnapshot((current) => current?.scope === scope ? { ...current, activeCompanyId: companyId } : current);
    await AsyncStorage.setItem(preferenceKey, value).catch(() => undefined);
  }, [preferenceKey, scope]);

  const setActiveCompanyId = useCallback(async (companyId: string) => {
    if (!memberships.some(({ company_id }) => company_id === companyId)) {
      throw new Error("No tienes acceso a esta empresa.");
    }
    await selectSpace(companyId);
  }, [memberships, selectSpace]);

  const useClientSpace = useCallback(async () => {
    if (hasClientSpace) await selectSpace(null);
  }, [hasClientSpace, selectSpace]);

  const createCompany =
    useCallback(
      async ({
        name,
        phone = "",
        email = ""
      }: CreateCompanyInput) => {
        const cleanName = name.trim();

        if (cleanName.length < 2) {
          return {
            companyId: null,
            error:
              "El nombre de la empresa es obligatorio."
          };
        }

        const result =
          await createCompanyRecord({
            name: cleanName,
            phone,
            email
          });

        if (
          result.error ||
          !result.companyId
        ) {
          return result;
        }

        if (!await refreshCompanies(result.companyId)) {
          return { ...result, error: "La empresa fue creada. Vuelve al inicio para cargar tu espacio de trabajo." };
        }

        return result;
      },
      [refreshCompanies]
    );

  const value =
    useMemo<CompanyContextValue>(
      () => ({
        memberships,
        companies,
        activeCompany,
        activeMembership,
        loading,
        refreshing,
        initialError,
        refreshCompanies,
        setActiveCompanyId,
        useClientSpace,
        createCompany
      }),
      [
        memberships,
        companies,
        activeCompany,
        activeMembership,
        loading,
        refreshing,
        initialError,
        refreshCompanies,
        setActiveCompanyId,
        useClientSpace,
        createCompany
      ]
    );

  return (
    <CompanyContext.Provider
      value={value}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany():
CompanyContextValue {
  const context =
    useContext(CompanyContext);

  if (!context) {
    throw new Error(
      "useCompany debe utilizarse dentro de CompanyProvider."
    );
  }

  return context;
}
