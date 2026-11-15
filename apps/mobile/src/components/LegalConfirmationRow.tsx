import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import {
  getVersionedLegalUrl,
  type LegalDocumentSummary,
  type LegalDocumentType,
} from "@/services/api";
import { showAlert } from "@/utils/alert";

const confirmationLabels = {
  terms: "Acepto los",
  privacy: "Confirmo que leí la",
};

type Props = {
  type: LegalDocumentType;
  document: LegalDocumentSummary;
  checked: boolean;
  confirmedAt?: string | null;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

export function LegalConfirmationRow({
  type,
  document,
  checked,
  confirmedAt,
  disabled,
  onChange,
}: Props) {
  const confirmation = confirmationLabels[type];

  function openDocument() {
    void Linking.openURL(getVersionedLegalUrl(type, document.version)).catch(() => {
      showAlert("No se pudo abrir el documento", "Verifica tu conexión e intenta nuevamente.");
    });
  }

  return (
    <View style={styles.row}>
      {confirmedAt ? (
        <Ionicons name="checkmark-circle-outline" size={22} color={colors.primary} />
      ) : (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={confirmation + " " + document.title}
          accessibilityState={{ checked, disabled }}
          disabled={disabled}
          onPress={() => onChange(!checked)}
          style={styles.checkbox}
        >
          <Ionicons
            name={checked ? "checkbox" : "square-outline"}
            size={22}
            color={checked ? colors.primary : colors.textSecondary}
          />
          <Text style={styles.label}>{confirmation}</Text>
        </Pressable>
      )}
      <Text
        accessibilityRole="link"
        onPress={openDocument}
        style={styles.link}
      >
        {document.title}
      </Text>
      {confirmedAt ? <Text style={styles.label}>Confirmado</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 5,
  },
  checkbox: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  link: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
    paddingVertical: 10,
    textDecorationLine: "underline",
  },
});
