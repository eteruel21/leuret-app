import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, layout, radius, shadows } from "@/constants/theme";
import { ProfileOverview } from "@/components/ProfileOverview";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/contexts/AuthContext";
import {
  deleteOwnAccount,
  exportAccountData,
  updateOwnAvatar,
} from "@/services/api";
import { uploadProfileMedia } from "@/services/media-upload-service";
import { confirmAction, showAlert } from "@/utils/alert";
import {
  prepareAvatarPhoto,
  type AvatarPhotoSource,
} from "@/utils/avatar-photo-picker";
import {
  loadOwnProfileDetails,
  type UserProfileDetails
} from "@/services/profile-details-service";

const TERMS_URL = "https://admin.leurettech.com/legal/terms";
const PRIVACY_URL = "https://admin.leurettech.com/legal/privacy";
const DATA_RIGHTS_EMAIL = "privacidad@leurettech.com";

export default function ProfileScreen() {
  const { profile, user, updateProfile, refreshProfile, signOut } = useAuth();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [accountAction, setAccountAction] = useState<"export" | "delete" | null>(null);
  const [details, setDetails] = useState<UserProfileDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const loadDetails = useCallback(async () => {
    setDetailsLoading(true);
    setDetailsError(null);

    try {
      setDetails(await loadOwnProfileDetails());
    } catch (error) {
      setDetails(null);
      setDetailsError(
        error instanceof Error
          ? error.message
          : "No fue posible cargar tu perfil completo."
      );
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(() => {
      if (active) void loadDetails();
    });

    return () => {
      active = false;
    };
  }, [loadDetails]);

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(() => {
      if (!active) return;
      setFullName(profile?.full_name ?? "");
      setPhone(profile?.phone ?? "");
    });

    return () => {
      active = false;
    };
  }, [profile?.id, profile?.updated_at, profile?.full_name, profile?.phone]);

  const initial = useMemo(
    () => (fullName.trim().charAt(0) || "P").toUpperCase(),
    [fullName],
  );

  const avatarUrl = profile?.avatar_url ?? null;

  const uploadAvatar = async (source: AvatarPhotoSource) => {
    let photo: Awaited<ReturnType<typeof prepareAvatarPhoto>>;
    try {
      photo = await prepareAvatarPhoto(source);
    } catch (error) {
      showAlert(
        "No se pudo abrir la foto",
        error instanceof Error ? error.message : "Inténtalo nuevamente."
      );
      return;
    }
    if (!photo) return;

    setAvatarBusy(true);
    try {
      const url = await uploadProfileMedia({
        mediaType: "avatar",
        fileData: photo.fileData,
        mimeType: photo.mimeType,
      });
      await updateOwnAvatar(url);
      await refreshProfile();
    } catch (error) {
      showAlert(
        "No se pudo actualizar la foto",
        error instanceof Error ? error.message : "Inténtalo nuevamente."
      );
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleChangeAvatar = () => {
    if (avatarBusy) return;

    if (Platform.OS === "web") {
      void uploadAvatar("library");
      return;
    }

    Alert.alert("Foto de perfil", "Elige de dónde tomar la foto.", [
      { text: "Galería", onPress: () => void uploadAvatar("library") },
      { text: "Cámara", onPress: () => void uploadAvatar("camera") },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  const handleRemoveAvatar = async () => {
    if (avatarBusy || !avatarUrl) return;

    const confirmed = await confirmAction({
      title: "Quitar foto de perfil",
      message: "Se mostrará la inicial de tu nombre en su lugar.",
      confirmText: "Quitar",
      destructive: true,
    });
    if (!confirmed) return;

    setAvatarBusy(true);
    try {
      await updateOwnAvatar(null);
      await refreshProfile();
    } catch (error) {
      showAlert(
        "No se pudo quitar la foto",
        error instanceof Error ? error.message : "Inténtalo nuevamente."
      );
    } finally {
      setAvatarBusy(false);
    }
  };

  const hasChanges =
    fullName.trim() !== (profile?.full_name ?? "").trim() ||
    phone.trim() !== (profile?.phone ?? "").trim();

  const handleSave = async () => {
    if (saving || !hasChanges) return;

    setSaving(true);
    const { error } = await updateProfile({ fullName, phone });
    setSaving(false);

    if (error) {
      Alert.alert("No se pudo guardar", error);
      return;
    }

    await loadDetails();

    Alert.alert("Perfil actualizado", "Tus datos se guardaron correctamente.");
  };

  const openLegalDocument = async (url: string, title: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        throw new Error("El dispositivo no puede abrir este enlace.");
      }
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(
        `No se pudo abrir ${title}`,
        error instanceof Error ? error.message : "Intenta nuevamente."
      );
    }
  };

  const openDataRightsRequest = async () => {
    const subject = encodeURIComponent(
      "Solicitud de derechos sobre datos — Leuret App"
    );
    const body = encodeURIComponent(
      "Hola LEURET TECH,\n\nDeseo ejercer el siguiente derecho sobre mis datos en Leuret App:\n\n[ ] Acceso\n[ ] Rectificación\n[ ] Cancelación\n[ ] Oposición\n[ ] Portabilidad\n\nDescripción de la solicitud:\n"
    );

    try {
      await Linking.openURL(
        `mailto:${DATA_RIGHTS_EMAIL}?subject=${subject}&body=${body}`
      );
    } catch (error) {
      Alert.alert(
        "No se pudo abrir el correo",
        `Escríbenos a ${DATA_RIGHTS_EMAIL} para ejercer tus derechos.`
      );
    }
  };

  const handleExportData = async () => {
    if (accountAction) return;

    setAccountAction("export");
    try {
      const data = await exportAccountData();
      const json = JSON.stringify(data, null, 2);
      const date = new Date().toISOString().slice(0, 10);
      const fileName = `leuret-data-export-${date}.json`;

      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
      } else {
        await Share.share({
          title: "Exportación de datos de Leuret",
          message: json,
        });
      }

      Alert.alert(
        "Exportación lista",
        Platform.OS === "web"
          ? "Se descargó una copia JSON de tus datos."
          : "Se generó la copia JSON de tus datos para que puedas guardarla o compartirla."
      );
    } catch (error) {
      Alert.alert(
        "No se pudieron exportar los datos",
        error instanceof Error ? error.message : "Intenta nuevamente."
      );
    } finally {
      setAccountAction(null);
    }
  };

  const performDeleteAccount = async () => {
    if (accountAction) return;

    setAccountAction("delete");
    try {
      const result = await deleteOwnAccount();
      await signOut();
      router.replace("/login");

      if (result.storageCleanup.status === "queued_for_retry") {
        Alert.alert(
          "Cuenta eliminada",
          "Tu acceso fue deshabilitado y tus datos personales fueron anonimizados. Algunos documentos están pendientes y el sistema volverá a eliminarlos automáticamente."
        );
      } else {
        Alert.alert(
          "Cuenta eliminada",
          "Tu cuenta fue deshabilitada y tus datos personales fueron anonimizados correctamente."
        );
      }
    } catch (error) {
      Alert.alert(
        "No se pudo eliminar la cuenta",
        error instanceof Error ? error.message : "Intenta nuevamente."
      );
    } finally {
      setAccountAction(null);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Eliminar mi cuenta",
      "Esta acción deshabilitará tu acceso, anonimizará tus datos personales y eliminará los archivos asociados que no deban conservarse por obligación legal. No se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar definitivamente",
          style: "destructive",
          onPress: () => {
            void performDeleteAccount();
          },
        },
      ]
    );
  };
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Volver"
            hitSlop={8}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={22} color={colors.textLight} />
          </Pressable>
          <Text style={styles.headerTitle}>Mi perfil</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            accessibilityLabel={avatarUrl ? "Cambiar foto de perfil" : "Agregar foto de perfil"}
            accessibilityRole="button"
            disabled={avatarBusy}
            onPress={handleChangeAvatar}
            style={({ pressed }) => [styles.avatarButton, pressed && styles.avatarPressed]}
          >
            <UserAvatar
              fallback={initial}
              size={82}
              style={styles.avatar}
              textStyle={styles.avatarText}
              uri={avatarUrl}
            />
            {avatarBusy ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color={colors.textLight} />
              </View>
            ) : null}
            <View style={styles.avatarBadge}>
              <Ionicons name="camera" size={14} color={colors.textLight} />
            </View>
          </Pressable>
          <View style={styles.avatarActions}>
            <Pressable disabled={avatarBusy} hitSlop={6} onPress={handleChangeAvatar}>
              <Text style={styles.avatarActionText}>
                {avatarUrl ? "Cambiar foto" : "Agregar foto"}
              </Text>
            </Pressable>
            {avatarUrl ? (
              <>
                <Text style={styles.avatarActionDivider}>·</Text>
                <Pressable disabled={avatarBusy} hitSlop={6} onPress={() => void handleRemoveAvatar()}>
                  <Text style={[styles.avatarActionText, styles.avatarActionDanger]}>Quitar</Text>
                </Pressable>
              </>
            ) : null}
          </View>
          <Text style={styles.title}>Información personal</Text>
          <Text style={styles.subtitle}>
            Mantén tus datos actualizados para identificar tu cuenta.
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.label}>Nombre completo</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={19} color={colors.textMuted} />
              <TextInput
                autoCapitalize="words"
                autoComplete="name"
                maxLength={120}
                onChangeText={setFullName}
                placeholder="Tu nombre completo"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                value={fullName}
              />
            </View>

            <Text style={styles.label}>Teléfono</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="call-outline" size={19} color={colors.textMuted} />
              <TextInput
                autoComplete="tel"
                keyboardType="phone-pad"
                maxLength={30}
                onChangeText={setPhone}
                placeholder="Ej. 6000-0000"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                value={phone}
              />
            </View>

            <Text style={styles.label}>Correo electrónico</Text>
            <View style={[styles.inputContainer, styles.readOnlyInput]}>
              <Ionicons name="mail-outline" size={19} color={colors.textMuted} />
              <Text style={styles.readOnlyText}>{user?.email ?? "Sin correo"}</Text>
              <Ionicons name="lock-closed" size={15} color={colors.textMuted} />
            </View>
            <Text style={styles.helperText}>
              El correo de acceso no se modifica desde esta pantalla.
            </Text>
          </View>

          <Pressable
            disabled={saving || !hasChanges}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveButton,
              (saving || !hasChanges) && styles.saveButtonDisabled,
              pressed && styles.saveButtonPressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.textLight} size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.textLight} />
                <Text style={styles.saveButtonText}>Guardar cambios</Text>
              </>
            )}
          </Pressable>

          <ProfileOverview
            details={details}
            loading={detailsLoading}
            error={detailsError}
            onRetry={() => {
              void loadDetails();
            }}
          />

          <View style={styles.formCard}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: colors.text, marginBottom: 12 }}>
              Privacidad y Legal
            </Text>
            
            <Pressable
              disabled={accountAction !== null}
              onPress={() => {
                void handleExportData();
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="download-outline" size={20} color={colors.accent} />
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Exportar mis datos (JSON)</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                void openLegalDocument(TERMS_URL, "los Términos de Uso");
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Términos y Condiciones</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                void openLegalDocument(PRIVACY_URL, "la Política de Privacidad");
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.textSecondary} />
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Política de Privacidad</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                void openDataRightsRequest();
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Ejercer mis derechos sobre datos</Text>
            </Pressable>

            <Pressable
              disabled={accountAction !== null}
              onPress={handleDeleteAccount}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12 }}
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <Text style={{ color: colors.danger, fontSize: 14, fontWeight: "700" }}>Eliminar mi cuenta</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.surfaceDark },
  header: {
    height: 62,
    paddingHorizontal: layout.screenPadding,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.textLight, fontSize: 17, fontWeight: "900" },
  headerSpacer: { width: 42 },
  content: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: 30,
    paddingBottom: 40,
    backgroundColor: colors.background,
    alignItems: "center",
  },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.soft,
  },
  avatarText: { color: colors.textLight, fontSize: 30, fontWeight: "900" },
  avatarButton: { width: 82, height: 82 },
  avatarPressed: { opacity: 0.8 },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 41,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.background,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarActions: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  avatarActionText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  avatarActionDanger: { color: colors.danger },
  avatarActionDivider: { color: colors.textMuted, fontSize: 13 },
  title: { marginTop: 18, color: colors.text, fontSize: 24, fontWeight: "900" },
  subtitle: {
    maxWidth: 360,
    marginTop: 7,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  formCard: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    marginTop: 27,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  label: { marginTop: 14, marginBottom: 7, color: colors.text, fontSize: 12, fontWeight: "800" },
  inputContainer: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  readOnlyInput: { backgroundColor: colors.surfaceAlt },
  readOnlyText: { flex: 1, color: colors.textSecondary, fontSize: 14 },
  helperText: { marginTop: 7, color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  saveButton: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    minHeight: 54,
    marginTop: 20,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  saveButtonDisabled: { opacity: 0.45 },
  saveButtonPressed: { backgroundColor: colors.accentPressed, transform: [{ scale: 0.99 }] },
  saveButtonText: { color: colors.textLight, fontSize: 15, fontWeight: "900" },
});
