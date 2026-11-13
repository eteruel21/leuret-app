import { Ionicons } from "@expo/vector-icons";
import { type Href, router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeuretButton } from "@/components/LeuretButton";
import { colors, radius } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { UserAvatar } from "@/components/UserAvatar";
import { confirmAction, showAlert } from "@/utils/alert";
import { formatDate } from "@/utils/format";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TERMS_URL = "https://admin.leurettech.com/legal/terms";
const PRIVACY_URL = "https://admin.leurettech.com/legal/privacy";

function initials(name: string | null | undefined): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "C";
}

export default function ClientAccountScreen() {
  const { profile, user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    const confirmed = await confirmAction({
      title: "Cerrar sesión",
      message: "¿Seguro que deseas salir?",
      confirmText: "Salir",
      destructive: true,
    });
    if (!confirmed) return;

    setSigningOut(true);
    const { error } = await signOut();
    setSigningOut(false);
    if (error) showAlert("No se pudo cerrar sesión", error.message);
  }

  async function openUrl(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      showAlert("No se pudo abrir el enlace", url);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Mi cuenta</Text>

        <View style={styles.profileCard}>
          <UserAvatar
            fallback={initials(profile?.full_name)}
            size={64}
            style={styles.avatar}
            textStyle={styles.avatarText}
            uri={profile?.avatar_url}
          />
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{profile?.full_name || "Cliente"}</Text>
            <Text style={styles.email}>{user?.email || "Sin correo"}</Text>
            <Text style={styles.roleBadge}>Cliente</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <InfoRow icon="call-outline" label="Teléfono" value={profile?.phone || "Sin teléfono registrado"} />
          <View style={styles.divider} />
          <InfoRow
            icon="notifications-outline"
            label="Avisos en el teléfono"
            value={profile?.notifications_opt_in ? "Activados" : "Desactivados"}
          />
          <View style={styles.divider} />
          <InfoRow
            icon="calendar-outline"
            label="Cliente desde"
            value={profile?.created_at ? formatDate(profile.created_at) : "—"}
          />
        </View>

        <View style={styles.menu}>
          <MenuRow
            icon="swap-horizontal-outline"
            label="Espacios de trabajo"
            onPress={() => router.push("/espacios")}
          />
          <MenuRow
            icon="create-outline"
            label="Editar mis datos y avisos"
            onPress={() => router.push("/perfil" as Href)}
          />
          <MenuRow
            icon="shield-checkmark-outline"
            label="Privacidad, exportar o eliminar mis datos"
            onPress={() => router.push("/perfil" as Href)}
          />
          <MenuRow icon="document-text-outline" label="Términos de uso" onPress={() => void openUrl(TERMS_URL)} external />
          <MenuRow icon="lock-closed-outline" label="Política de privacidad" onPress={() => void openUrl(PRIVACY_URL)} external last />
        </View>

        <LeuretButton
          label="Cerrar sesión"
          icon="log-out-outline"
          variant="danger"
          loading={signingOut}
          onPress={() => void handleSignOut()}
          style={styles.logout}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={20} color={colors.textSecondary} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  external = false,
  last = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  external?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={external ? "link" : "button"}
      style={({ pressed }) => [styles.menuRow, !last && styles.menuRowBorder, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name={external ? "open-outline" : "chevron-forward"} size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  title: { fontSize: 28, fontWeight: "900", color: colors.text },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceDark,
  },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.textInverse, fontSize: 22, fontWeight: "900" },
  profileInfo: { flex: 1 },
  name: { fontSize: 18, fontWeight: "900", color: colors.textLight },
  email: { marginTop: 2, fontSize: 13, color: colors.textLightMuted },
  roleBadge: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
    overflow: "hidden",
    backgroundColor: colors.surfaceDarkRaised,
    color: colors.textLight,
    fontSize: 11,
    fontWeight: "800",
  },
  infoCard: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 16 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  infoText: { flex: 1 },
  iconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.steelSoft, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: "700" },
  infoValue: { fontSize: 14, color: colors.text, fontWeight: "800", marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 12 },
  menu: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 54 },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  menuLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "700" },
  pressed: { backgroundColor: colors.surfaceAlt },
  logout: { marginTop: 8 },
});
