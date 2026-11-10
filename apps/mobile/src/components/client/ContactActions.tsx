import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/constants/theme";
import { showAlert } from "@/utils/alert";
import { mapsUrl, telUrl, whatsappNumber } from "@/utils/client-portal";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type ContactActionsProps = {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  /** Texto inicial del mensaje de WhatsApp. */
  whatsappMessage?: string;
  emailSubject?: string;
  compact?: boolean;
};

async function open(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    showAlert("No se pudo abrir", "Este dispositivo no tiene una app para esta acción.");
  }
}

/** Llamar, WhatsApp, correo y mapa con un toque. Solo muestra lo disponible. */
export function ContactActions({ phone, email, address, whatsappMessage, emailSubject, compact = false }: ContactActionsProps) {
  const actions: { key: string; label: string; icon: IconName; url: string; color: string }[] = [];

  const tel = telUrl(phone);
  if (tel) actions.push({ key: "call", label: "Llamar", icon: "call-outline", url: tel, color: colors.primary });

  const wa = whatsappNumber(phone);
  if (wa) {
    const text = whatsappMessage ? `?text=${encodeURIComponent(whatsappMessage)}` : "";
    actions.push({ key: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp", url: `https://wa.me/${wa}${text}`, color: "#1F9D55" });
  }

  if (email) {
    const subject = emailSubject ? `?subject=${encodeURIComponent(emailSubject)}` : "";
    actions.push({ key: "email", label: "Correo", icon: "mail-outline", url: `mailto:${email}${subject}`, color: colors.primary });
  }

  const map = mapsUrl(address);
  if (map) actions.push({ key: "map", label: "Mapa", icon: "map-outline", url: map, color: colors.primary });

  if (actions.length === 0) return null;

  return (
    <View style={styles.row}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          onPress={() => void open(action.url)}
          accessibilityRole="link"
          accessibilityLabel={action.label}
          style={({ pressed }) => [styles.button, compact && styles.compact, pressed && styles.pressed]}
        >
          <Ionicons name={action.icon} size={18} color={action.color} />
          {compact ? null : <Text style={styles.label}>{action.label}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    flexGrow: 1,
    minWidth: 72,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  compact: { flexGrow: 0, minWidth: 40, width: 40, paddingHorizontal: 0 },
  label: { color: colors.text, fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.75 },
});
