import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import { useAuth } from "@/contexts/AuthContext";
import {
  createCompanyRecord,
  listCompanyMemberships
} from "@/services/company-service";
import type {
  Company,
  CompanyMembership
} from "@/types/company";

const ACTIVE_COMPANY_KEY =
  "@contractor-pro:active-company-id";
const CLIENT_SPACE = "client";

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
  const {
    user,
    profile,
    loading: authLoading
  } = useAuth();

  const userId = user?.id ?? null;
  const canLoadCompanies = Boolean(profile?.active);
  const hasClientSpace = profile?.role === "client";

  const [memberships, setMemberships] =
    useState<CompanyMembership[]>([]);

  const [
    activeCompanyId,
    setActiveCompanyIdState
  ] = useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const companies = useMemo(
    () =>
      memberships
        .map(
          (membership) =>
            membership.company
        )
        .filter(Boolean),
    [memberships]
  );

  const activeCompany = useMemo(
    () =>
      companies.find(
        (company) =>
          company.id === activeCompanyId
      ) ?? null,
    [
      activeCompanyId,
      companies
    ]
  );

  const activeMembership = useMemo(
    () =>
      memberships.find(
        (membership) =>
          membership.company_id ===
          activeCompanyId
      ) ?? null,
    [
      activeCompanyId,
      memberships
    ]
  );

  const refreshCompanies =
    useCallback(async (preferredCompanyId?: string) => {
      if (!userId) {
        setMemberships([]);
        setActiveCompanyIdState(null);
        setLoading(false);
        setRefreshing(false);

        await AsyncStorage.removeItem(
          ACTIVE_COMPANY_KEY
        );

        return false;
      }

      setRefreshing(true);

      try {
        const result =
          await listCompanyMemberships();

        if (result.error) {
          throw new Error(result.error);
        }

        setMemberships(
          result.memberships
        );

        if (
          preferredCompanyId &&
          result.memberships.some(
            (membership) =>
              membership.company_id ===
              preferredCompanyId
          )
        ) {
          await AsyncStorage.setItem(
            ACTIVE_COMPANY_KEY,
            preferredCompanyId
          );
        }

        const storedCompanyId =
          await AsyncStorage.getItem(
            ACTIVE_COMPANY_KEY
          );

        const storedCompanyExists =
          result.memberships.some(
            (membership) =>
              membership.company_id ===
              storedCompanyId
          );

        if (
          storedCompanyId &&
          storedCompanyExists
        ) {
          setActiveCompanyIdState(
            storedCompanyId
          );

          return !preferredCompanyId || storedCompanyId === preferredCompanyId;
        }

        if (hasClientSpace && storedCompanyId === CLIENT_SPACE) {
          setActiveCompanyIdState(null);
          return !preferredCompanyId;
        }

        const firstCompanyId = hasClientSpace ? null : result.memberships[0]?.company_id ?? null;

        setActiveCompanyIdState(
          firstCompanyId
        );

        if (firstCompanyId) {
          await AsyncStorage.setItem(
            ACTIVE_COMPANY_KEY,
            firstCompanyId
          );
        } else {
          await AsyncStorage.removeItem(
            ACTIVE_COMPANY_KEY
          );
        }
        return !preferredCompanyId || firstCompanyId === preferredCompanyId;
      } catch (error) {
        console.error(
          "Error cargando empresas:",
          error
        );

        return false;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }, [hasClientSpace, userId]);

  useEffect(() => {
    if (authLoading) return;

    let active = true;

    void Promise.resolve().then(() => {
      if (!active) return;

      if (userId && !canLoadCompanies) {
        setMemberships([]);
        setActiveCompanyIdState(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      void refreshCompanies();
    });

    return () => {
      active = false;
    };
  }, [
    authLoading,
    canLoadCompanies,
    userId,
    refreshCompanies
  ]);

  const setActiveCompanyId =
    useCallback(
      async (companyId: string) => {
        const exists =
          memberships.some(
            (membership) =>
              membership.company_id ===
              companyId
          );

        if (!exists) {
          throw new Error(
            "No tienes acceso a esta empresa."
          );
        }

        setActiveCompanyIdState(
          companyId
        );

        await AsyncStorage.setItem(
          ACTIVE_COMPANY_KEY,
          companyId
        );
      },
      [memberships]
    );

  const useClientSpace = useCallback(async () => {
    if (!hasClientSpace) return;
    await AsyncStorage.setItem(ACTIVE_COMPANY_KEY, CLIENT_SPACE);
    setActiveCompanyIdState(null);
  }, [hasClientSpace]);

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
