import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, radius } from "@/constants/theme";

export type FilterOption<T extends string> = { value: T; label: string; count?: number };

type FilterBarProps<T extends string> = {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
};

/** Búsqueda + chips de estado para las listas del portal del cliente. */
export function FilterBar<T extends string>({
  options,
  value,
  onChange,
  search,
  onSearchChange,
  searchPlaceholder = "Buscar…",
}: FilterBarProps<T>) {
  return (
    <View style={styles.container}>
      {onSearchChange ? (
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={searchPlaceholder}
          />
          {search ? (
            <Pressable onPress={() => onSearchChange("")} hitSlop={10} accessibilityLabel="Limpiar búsqueda">
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
              {typeof option.count === "number" ? (
                <View style={[styles.count, selected && styles.countSelected]}>
                  <Text style={[styles.countText, selected && styles.countTextSelected]}>{option.count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, marginBottom: 16 },
  searchBox: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, height: "100%", color: colors.text, fontSize: 14 },
  chips: { gap: 8, paddingRight: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 12, fontWeight: "800" },
  chipTextSelected: { color: colors.textLight },
  count: { minWidth: 20, paddingHorizontal: 6, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.steelSoft },
  countSelected: { backgroundColor: colors.surfaceDarkRaised },
  countText: { fontSize: 10, fontWeight: "900", color: colors.textSecondary },
  countTextSelected: { color: colors.textLight },
  pressed: { opacity: 0.8 },
});
