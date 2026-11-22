import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text } from "react-native";

import { CreateClientBudgetModal } from "@/components/CreateClientBudgetModal";
import { colors, radius } from "@/constants/theme";
import type { BudgetLineDraft } from "@/services/budget-service";

/**
 * Botón «Crear presupuesto nuevo» para el resultado de una calculadora: la partida
 * se arma al tocarlo, se elige cliente y título, y se abre el presupuesto creado.
 */
export function CreateBudgetButton({
  buildLine,
  defaultTitle,
}: {
  buildLine: () => BudgetLineDraft | null;
  defaultTitle: string;
}) {
  const [item, setItem] = useState<BudgetLineDraft | null>(null);
  const [visible, setVisible] = useState(false);

  const open = () => {
    let line: BudgetLineDraft | null = null;
    try {
      line = buildLine();
    } catch {
      line = null;
    }
    if (!line) {
      Alert.alert("No hay partida para guardar", "Calcula de nuevo con medidas válidas y vuelve a intentarlo.");
      return;
    }
    setItem(line);
    setVisible(true);
  };

  return (
    <>
      <Pressable onPress={open} style={styles.button} accessibilityRole="button">
        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        <Text style={styles.text}>Crear presupuesto nuevo</Text>
      </Pressable>
      {item ? (
        <CreateClientBudgetModal
          visible={visible}
          onClose={() => setVisible(false)}
          defaultTitle={defaultTitle}
          item={item}
          onCreated={(id) => router.push({ pathname: "/presupuestos/[id]", params: { id } })}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  text: { color: colors.primary, fontWeight: "800", fontSize: 15 },
});
