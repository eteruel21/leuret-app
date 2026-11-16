import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { AppState } from "react-native";

import {
  ApiError,
  type AppProfile,
  type AppRole,
  getCurrentUser,
  login,
  logout,
  onSessionEnded,
  requestPasswordReset,
  register,
  restoreStoredSession,
  type RegisterInput,
  type StoredSession,
  updateContractorProfile as updateContractorProfileRequest,
  updateOwnProfile
} from "@/services/api";

import {
  unregisterCurrentPushTokenAsync
} from "@/services/push-notification-service";

export type {
  AppProfile,
  AppRole
};

export type PublicAppRole =
  Exclude<AppRole, "super_admin">;

type SignUpInput = RegisterInput;

export type UpdateContractorProfileInput = {
  businessName: string | null;
  idDocument: string;
  taxId: string | null;
  taxDv: string | null;
  primaryCategory: string | null;
  specialties: string[] | null;
  experienceYears: number | null;
  workAreas: string[] | null;
  professionalDescription: string | null;
  avatarUrl: string | null;
  companyLogoUrl: string | null;
  portfolioUrls: string[] | null;
  certifications: string[] | null;
  availability: string | null;
  preferredContactMethod: string | null;
  emitsInvoice: boolean;
  hasTransport: boolean;
  workMode: string | null;
  docIdUrl: string | null;
  docOperationNoticeUrl: string | null;
  docTechnicalCertsUrls: string[] | null;
  docReferencesUrl: string | null;
  docAddressProofUrl: string | null;
};

type AuthError = {
  message: string;
  code?: string;
};

type AuthResult = {
  error: AuthError | null;
  requiresEmailConfirmation?: boolean;
  emailDeliverySucceeded?: boolean;
};

type UpdateProfileInput = {
  fullName: string;
  phone?: string;
  notificationsOptIn?: boolean;
};

type UpdateProfileResult = {
  error: string | null;
};

type AuthContextValue = {
  session: StoredSession | null;
  user: AppProfile | null;
  profile: AppProfile | null;
  loading: boolean;
  restoreError: string | null;
  sessionNotice: string | null;
  profileError: string | null;
  isAdmin: boolean;

  refreshProfile: () => Promise<void>;
  retryRestore: () => Promise<void>;

  updateProfile: (
    input: UpdateProfileInput
  ) => Promise<UpdateProfileResult>;

  signIn: (
    email: string,
    password: string,
    captchaToken: string
  ) => Promise<AuthResult>;

  signUp: (
    input: SignUpInput
  ) => Promise<AuthResult>;

  signOut: () => Promise<AuthResult>;

  resetPassword: (
    email: string,
    captchaToken: string
  ) => Promise<AuthResult>;

  updateContractorProfile: (
    input: UpdateContractorProfileInput
  ) => Promise<{
    error: string | null;
  }>;
};

const AuthContext =
  createContext<AuthContextValue | null>(
    null
  );

function errorMessage(
  error: unknown
): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrió un error inesperado.";
}

const SESSION_ENDED_MESSAGE = "Tu sesión terminó. Inicia sesión para continuar.";
const FOREGROUND_CHECK_MS = 60_000;

export function AuthProvider({
  children
}: PropsWithChildren) {
  const [session, setSession] =
    useState<StoredSession | null>(null);

  const [profile, setProfile] =
    useState<AppProfile | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [profileError, setProfileError] =
    useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const currentSessionId = useRef<string | null>(null);
  const restoring = useRef(false);

  const applySession = useCallback(
    (
      nextSession:
        | StoredSession
        | null
    ) => {
      currentSessionId.current = nextSession?.sessionId ?? null;
      setSession(nextSession);
      setProfile(
        nextSession?.user ?? null
      );
      setProfileError(null);
      setSessionNotice(null);
    },
    []
  );

  useEffect(() => {
    return onSessionEnded((sessionId) => {
      if (currentSessionId.current !== sessionId) return;
      applySession(null);
      setSessionNotice(SESSION_ENDED_MESSAGE);
    });
  }, [applySession]);

  const retryRestore = useCallback(async () => {
    if (restoring.current) return;
    restoring.current = true;
    setLoading(true);
    setRestoreError(null);
    try {
      applySession(await restoreStoredSession());
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        applySession(null);
        setSessionNotice(error.status === 403 ? error.message : SESSION_ENDED_MESSAGE);
      } else {
        setRestoreError(error instanceof ApiError
          ? error.message
          : "Revisa tu conexión e inténtalo de nuevo.");
      }
    } finally {
      restoring.current = false;
      setLoading(false);
    }
  }, [applySession]);

  useEffect(() => { void retryRestore(); }, [retryRestore]);

  const sessionId = session?.sessionId;
  const refreshProfile =
    useCallback(async () => {
      if (!sessionId) {
        setProfile(null);
        return;
      }

      try {
        const current =
          await getCurrentUser();

        if (currentSessionId.current !== sessionId) return;
        setSession((previous) => previous
          ? { ...previous, user: current.user, requiresApproval: current.requiresApproval }
          : null);
        setProfile(current.user);
        setProfileError(null);
      } catch (error) {
        if (currentSessionId.current !== sessionId) return;
        setProfileError(
          errorMessage(error)
        );
      }
    }, [sessionId]);

  useEffect(() => {
    if (!sessionId && !restoreError) return;

    let lastCheck = Date.now();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || Date.now() - lastCheck < FOREGROUND_CHECK_MS) return;
      lastCheck = Date.now();
      void (sessionId ? refreshProfile() : retryRestore());
    });
    return () => subscription.remove();
  }, [refreshProfile, restoreError, retryRestore, sessionId]);

  const signIn = useCallback(
    async (
      email: string,
      password: string,
      captchaToken: string
    ): Promise<AuthResult> => {
      try {
        const nextSession = await login(
          email.trim().toLowerCase(),
          password,
          captchaToken
        );

        applySession(nextSession);

        return {
          error: null
        };
      } catch (error) {
        return {
          error: {
            message: errorMessage(error)
          }
        };
      }
    },
    [applySession]
  );

  const signUp = useCallback(
    async (
      input: SignUpInput
    ): Promise<AuthResult> => {
      try {
        const nextSession =
          await register({
            fullName:
              input.fullName.trim(),
            firstName:
              input.firstName.trim(),
            lastName:
              input.lastName.trim(),
            phone:
              input.phone.trim(),
            email:
              input.email
                .trim()
                .toLowerCase(),
            password: input.password,
            captchaToken: input.captchaToken,
            role: input.role,
            province: input.province,
            district: input.district,
            corregimiento:
              input.corregimiento,
            legalConfirmations:
              input.legalConfirmations,
            notificationsOptIn:
              input.notificationsOptIn,
            registrationDevice:
              input.registrationDevice
          });

        if (nextSession.requiresEmailConfirmation) {
          applySession(null);
        } else {
          applySession(nextSession);
        }

        return {
          error: null,
          requiresEmailConfirmation:
            !!nextSession.requiresEmailConfirmation,
          emailDeliverySucceeded:
            nextSession.emailDeliverySucceeded
        };
      } catch (error) {
        return {
          error: {
            message: errorMessage(error),
            code: error instanceof ApiError ? error.code : undefined
          }
        };
      }
    },
    [applySession]
  );

  const signOut = useCallback(
    async (): Promise<AuthResult> => {
      try {
        await unregisterCurrentPushTokenAsync();
        await logout();
        applySession(null);

        return {
          error: null
        };
      } catch (error) {
        applySession(null);

        return {
          error: {
            message: errorMessage(error)
          }
        };
      }
    },
    [applySession]
  );

  const updateProfile = useCallback(
    async ({
      fullName,
      phone = "",
      notificationsOptIn
    }: UpdateProfileInput):
    Promise<UpdateProfileResult> => {
      try {
        await updateOwnProfile({
          fullName:
            fullName.trim(),
          phone:
            phone.trim() || null,
          notificationsOptIn
        });

        await refreshProfile();

        return {
          error: null
        };
      } catch (error) {
        return {
          error: errorMessage(error)
        };
      }
    },
    [refreshProfile]
  );

  const updateContractorProfile =
    useCallback(
      async (
        input:
          UpdateContractorProfileInput
      ): Promise<{
        error: string | null;
      }> => {
        try {
          await updateContractorProfileRequest(
            input
          );

          await refreshProfile();

          return {
            error: null
          };
        } catch (error) {
          return {
            error: errorMessage(error)
          };
        }
      },
      [refreshProfile]
    );

  const resetPassword = useCallback(
    async (
      email: string,
      captchaToken: string
    ): Promise<AuthResult> => {
      try {
        await requestPasswordReset(
          email.trim().toLowerCase(),
          captchaToken
        );

        return { error: null };
      } catch (error) {
        return {
          error: {
            message: errorMessage(error)
          }
        };
      }
    },
    []
  );

  const isAdmin = Boolean(
    profile?.active &&
    profile.role === "super_admin"
  );

  const value =
    useMemo<AuthContextValue>(
      () => ({
        session,
        user: profile,
        profile,
        loading,
        restoreError,
        sessionNotice,
        profileError,
        isAdmin,
        refreshProfile,
        retryRestore,
        updateProfile,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updateContractorProfile
      }),
      [
        session,
        profile,
        loading,
        restoreError,
        sessionNotice,
        profileError,
        isAdmin,
        refreshProfile,
        retryRestore,
        updateProfile,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updateContractorProfile
      ]
    );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth():
AuthContextValue {
  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth debe utilizarse dentro de AuthProvider."
    );
  }

  return context;
}
