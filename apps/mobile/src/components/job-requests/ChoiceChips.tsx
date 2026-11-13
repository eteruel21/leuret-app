import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/constants/theme";

type ChoiceOption = { value: string; label: string };

type ChoiceChipsProps = {
  options: readonly string[] | readonly ChoiceOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Permite tocar de nuevo la opción elegida para quitarla. */
  allowClear?: boolean;
  accessibilityLabel?: string;
};

/** Opciones en fichas que se acomodan en varias líneas (funciona igual en web). */
export function ChoiceChips({
  options,
  value,
  onChange,
  allowClear = false,
  accessibilityLabel,
}: ChoiceChipsProps) {
  const normalized: ChoiceOption[] = (options as readonly (string | ChoiceOption)[]).map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );

  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {normalized.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(selected && allowClear ? null : option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.85 },
  label: { color: colors.text, fontSize: 13, fontWeight: "700" },
  labelSelected: { color: colors.textInverse },
});
