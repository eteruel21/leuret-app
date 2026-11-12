import { Ionicons } from "@expo/vector-icons";
import { type Href, router } from "expo-router";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CALCULATORS, type CalculatorRoute } from "@/constants/calculators";
import { colors, radius } from "@/constants/theme";

/**
 * Abre cualquiera de las 10 calculadoras con contexto: desde un presupuesto
 * (`budgetId`, la partida se guarda en él) o desde una obra o cliente
 * (`projectId`/`clientId`, el cálculo guardado queda ligado a ellos).
 */
export function CalculatorPickerModal({
  visible,
  params,
  title = "Agregar desde una calculadora",
  subtitle = "El resultado se guardará como partida de este presupuesto.",
  onClose,
}: {
  visible: boolean;
  params: { budgetId?: string; projectId?: string; clientId?: string };
  title?: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const open = (route: CalculatorRoute) => {
    onClose();
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, value]) => Boolean(value)),
    );
    router.push({ pathname: route, params: cleanParams } as Href);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {CALCULATORS.filter((calculator) => calculator.enabled && calculator.route).map((calculator) => (
            <Pressable
              key={calculator.id}
              onPress={() => calculator.route && open(calculator.route)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
            >
              <View style={styles.icon}>
                <Ionicons name={calculator.icon} size={22} color={colors.primary} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{calculator.title}</Text>
                <Text style={styles.rowText}>{calculator.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerCopy: { flex: 1, gap: 4 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  list: { paddingHorizontal: 20, paddingBottom: 32, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowPressed: { opacity: 0.75 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  rowText: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
});
