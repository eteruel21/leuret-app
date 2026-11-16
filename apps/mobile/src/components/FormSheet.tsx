import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius } from "@/constants/theme";

type FormSheetProps = {
  visible: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSave: () => void;
  submitting: boolean;
  saveLabel?: string;
  /** Mensaje de error fijo sobre el botón (en la web `Alert` no siempre se ve). */
  error?: string | null;
};

/** Ventana de formulario (hoja) con Cancelar / Guardar, igual a las de clientes. */
export function FormSheet({
  visible,
  title,
  children,
  onClose,
  onSave,
  submitting,
  saveLabel = "Guardar",
  error,
}: FormSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.header}>
            <Pressable onPress={onClose} disabled={submitting} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={onSave} disabled={submitting} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.saveText}>{saveLabel}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}

            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            <Pressable
              onPress={onSave}
              disabled={submitting}
              accessibilityRole="button"
              style={({ pressed }) => [styles.saveButton, (pressed || submitting) && styles.pressed]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.textLight} />
              ) : (
                <Text style={styles.saveButtonText}>{saveLabel}</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

type SheetFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  helper?: string;
  maxLength?: number;
};

export function SheetField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline = false,
  helper,
  maxLength,
}: SheetFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        maxLength={maxLength}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

type SheetChoiceProps<T extends string> = {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function SheetChoice<T extends string>({ label, options, value, onChange }: SheetChoiceProps<T>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value || "none"}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export { isDateKey, parseDecimal } from "@/utils/form-values";

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 56,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { flex: 1, textAlign: "center", color: colors.text, fontSize: 16, fontWeight: "900" },
  cancelText: { color: colors.textSecondary, fontSize: 14, fontWeight: "800" },
  saveText: { color: colors.accent, fontSize: 14, fontWeight: "900" },
  content: { padding: 20, paddingBottom: 40 },
  field: { marginBottom: 15 },
  label: { marginBottom: 7, color: colors.text, fontSize: 12, fontWeight: "800" },
  input: {
    minHeight: 52,
    minWidth: 0,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 14,
  },
  inputMultiline: { minHeight: 90, paddingTop: 14, textAlignVertical: "top" },
  helper: { marginTop: 6, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  choiceText: { color: colors.text, fontSize: 13, fontWeight: "800" },
  choiceTextSelected: { color: colors.textLight },
  error: { marginBottom: 10, color: colors.danger, fontSize: 13, fontWeight: "700", textAlign: "center" },
  saveButton: {
    minHeight: 56,
    marginTop: 8,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: { color: colors.textLight, fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.75 },
});
