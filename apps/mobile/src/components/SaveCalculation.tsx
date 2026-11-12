import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { CalculatorId } from "@/constants/calculators";
import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import type { BudgetLineDraft } from "@/services/budget-service";
import { fetchCalculationDetail, saveCalculation, updateCalculation } from "@/services/calculation-service";
import { listProjectsByCompany, type ProjectSummary } from "@/services/project-service";
import { buildCalculationPayload, readCalculationState } from "@/utils/saved-calculation";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type UseSavedCalculationOptions<State extends object> = {
  formulaCode: CalculatorId;
  /** La pantalla ya cargó sus ajustes locales (para no pisar lo restaurado). */
  ready: boolean;
  /** Estado de la calculadora que permite reconstruir el cálculo. */
  snapshot: () => State;
  /** Aplica un estado guardado a la pantalla. */
  restore: (state: Partial<State>) => void;
  /** Se llama en el render siguiente a `restore`, con el estado ya aplicado. */
  onRestored: () => void;
  /** Partida que se guardará con el cálculo (la misma que va al presupuesto). */
  buildLine: () => BudgetLineDraft | null;
  totalCost: number | null | undefined;
};

/**
 * Guardar y reabrir cálculos de una calculadora.
 *
 * - Con `?calculationId=` en la ruta, carga ese cálculo guardado y lo aplica.
 * - Con `?projectId=` o `?clientId=`, el cálculo nuevo queda ligado a ellos.
 * - Devuelve el botón «Guardar cálculo» y su ventana para ponerlos en la
 *   pantalla.
 */
export function useSavedCalculation<State extends object>({
  formulaCode,
  ready,
  snapshot,
  restore,
  onRestored,
  buildLine,
  totalCost,
}: UseSavedCalculationOptions<State>) {
  const params = useLocalSearchParams<{
    calculationId?: string | string[];
    projectId?: string | string[];
    clientId?: string | string[];
  }>();
  const calculationId = firstParam(params.calculationId);
  const paramProjectId = firstParam(params.projectId);
  const paramClientId = firstParam(params.clientId);

  const { activeCompany } = useCompany();
  const [visible, setVisible] = useState(false);
  const [lineTitle, setLineTitle] = useState("");
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [loadedCalculation, setLoadedCalculation] = useState<{
    title: string;
    projectId: string | null;
    clientId: string | null;
  } | null>(null);
  const [restoredTick, setRestoredTick] = useState(0);
  /** Cálculo guardado que se está editando: el abierto por ruta o el último que se guardó aquí. */
  const [currentId, setCurrentId] = useState<string | null>(null);

  const restoreRef = useRef(restore);
  const onRestoredRef = useRef(onRestored);
  restoreRef.current = restore;
  onRestoredRef.current = onRestored;
  const appliedId = useRef<string | null>(null);

  useEffect(() => {
    const companyId = activeCompany?.id;
    if (!ready || !calculationId || !companyId || appliedId.current === calculationId) return;
    appliedId.current = calculationId;

    let cancelled = false;
    void (async () => {
      try {
        const calculation = await fetchCalculationDetail(calculationId, companyId);
        if (cancelled) return;
        if (calculation.formula_code !== formulaCode) {
          Alert.alert("Cálculo de otra calculadora", "Este cálculo guardado pertenece a otra calculadora.");
          return;
        }
        const state = readCalculationState<State>(calculation.input_data);
        if (!state) {
          Alert.alert("No se pudo abrir el cálculo", "El cálculo guardado no tiene datos para restaurar.");
          return;
        }
        restoreRef.current(state);
        setCurrentId(calculation.id);
        setLoadedCalculation({
          title: calculation.title,
          projectId: calculation.project_id,
          clientId: calculation.client_id,
        });
        setRestoredTick((tick) => tick + 1);
      } catch (error) {
        if (!cancelled) {
          Alert.alert(
            "No se pudo abrir el cálculo",
            error instanceof Error ? error.message : "Inténtalo de nuevo.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCompany?.id, calculationId, formulaCode, ready]);

  // El estado restaurado ya está aplicado en este render: recalcular.
  useEffect(() => {
    if (restoredTick > 0) onRestoredRef.current();
  }, [restoredTick]);

  const open = () => {
    const line = buildLine();
    if (!line) {
      Alert.alert("Primero calcula", "Calcula el resultado antes de guardarlo.");
      return;
    }
    setLineTitle(line.description);
    setVisible(true);
  };

  const saveModal = (
    <SaveCalculationModal
      visible={visible}
      defaultTitle={loadedCalculation?.title ?? lineTitle}
      defaultProjectId={paramProjectId ?? loadedCalculation?.projectId ?? null}
      defaultClientId={paramClientId ?? loadedCalculation?.clientId ?? null}
      canUpdate={Boolean(currentId)}
      onClose={() => setVisible(false)}
      onSave={async ({ title, projectId, clientId, mode }) => {
        const companyId = activeCompany?.id;
        const line = buildLine();
        if (!companyId || !line) return "Calcula el resultado antes de guardarlo.";
        try {
          const payload = {
            companyId,
            projectId,
            clientId,
            formulaCode,
            title,
            ...buildCalculationPayload({ state: snapshot(), line, totalCost: totalCost ?? 0 }),
          };
          const saved =
            mode === "update" && currentId
              ? await updateCalculation(currentId, payload)
              : await saveCalculation(payload);
          setCurrentId(saved.id);
          setLoadedCalculation({ title, projectId, clientId });
          setSavedTitle(mode === "update" ? `Actualizado «${title}».` : `Guardado como «${title}».`);
          setVisible(false);
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : "No se pudo guardar el cálculo.";
        }
      }}
    />
  );

  const saveButton = (
    <View style={styles.saveBlock}>
      <Pressable
        onPress={open}
        style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Ionicons name="bookmark-outline" size={18} color={colors.primary} />
        <Text style={styles.saveButtonText}>{currentId ? "Actualizar cálculo" : "Guardar cálculo"}</Text>
      </Pressable>
      {savedTitle ? (
        <Text style={styles.savedText}>
          {savedTitle} Lo encuentras en la obra, el cliente y en Cálculos.
        </Text>
      ) : loadedCalculation ? (
        <Text style={styles.savedText}>Abriste el cálculo guardado «{loadedCalculation.title}».</Text>
      ) : null}
    </View>
  );

  return { saveButton, saveModal };
}

type SaveMode = "update" | "new";
type SaveInput = { title: string; projectId: string | null; clientId: string | null; mode: SaveMode };

function SaveCalculationModal({
  visible,
  defaultTitle,
  defaultProjectId,
  defaultClientId,
  canUpdate,
  onClose,
  onSave,
}: {
  visible: boolean;
  defaultTitle: string;
  defaultProjectId: string | null;
  defaultClientId: string | null;
  /** Hay un cálculo guardado abierto: se puede actualizar o guardar como nuevo. */
  canUpdate: boolean;
  onClose: () => void;
  onSave: (input: SaveInput) => Promise<string | null>;
}) {
  const { activeCompany } = useCompany();
  const [title, setTitle] = useState(defaultTitle);
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<SaveMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(defaultTitle);
    setProjectId(defaultProjectId);
    setSearch("");
    setError(null);
    const companyId = activeCompany?.id;
    if (!companyId) return;
    setLoadingProjects(true);
    void listProjectsByCompany(companyId).then((response) => {
      setLoadingProjects(false);
      if (!response.error) setProjects(response.projects);
    });
  }, [visible, defaultTitle, defaultProjectId, activeCompany?.id]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? projects.filter((project) =>
          `${project.name} ${project.project_code ?? ""}`.toLowerCase().includes(term))
      : projects;
    return list.slice(0, 50);
  }, [projects, search]);

  const selectedProject = projects.find((project) => project.id === projectId) ?? null;

  const submit = async (mode: SaveMode) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Escribe un nombre para el cálculo.");
      return;
    }
    setSaving(mode);
    setError(null);
    const clientId = selectedProject?.client_id ?? (projectId ? null : defaultClientId);
    const message = await onSave({ title: cleanTitle.slice(0, 250), projectId, clientId, mode });
    setSaving(null);
    if (message) setError(message);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{canUpdate ? "Actualizar cálculo" : "Guardar cálculo"}</Text>
            <Text style={styles.subtitle}>
              {canUpdate
                ? "Actualiza el cálculo guardado con las medidas y precios actuales, o guárdalo como uno nuevo."
                : "Queda con sus medidas y precios para reabrirlo o pasarlo a un presupuesto más tarde."}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.label}>Nombre</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Ej. Losa de la terraza"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            maxLength={250}
          />

          <Text style={styles.label}>Obra (opcional)</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar obra"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCorrect={false}
          />
        </View>

        {loadingProjects ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : (
          <FlatList
            data={[null, ...filtered]}
            keyExtractor={(item) => item?.id ?? "none"}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const selected = (item?.id ?? null) === projectId;
              return (
                <Pressable
                  onPress={() => setProjectId(item?.id ?? null)}
                  style={[styles.option, selected && styles.optionSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Ionicons
                    name={selected ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={selected ? colors.primary : colors.textMuted}
                  />
                  <Text style={styles.optionText} numberOfLines={1}>
                    {item ? `${item.project_code ? `${item.project_code} · ` : ""}${item.name}` : "Sin obra"}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}

        <View style={styles.footer}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            onPress={() => void submit(canUpdate ? "update" : "new")}
            disabled={saving !== null}
            style={({ pressed }) => [styles.primary, (pressed || saving !== null) && styles.pressed]}
            accessibilityRole="button"
          >
            {saving === (canUpdate ? "update" : "new") ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.primaryText}>{canUpdate ? "Actualizar" : "Guardar"}</Text>
            )}
          </Pressable>
          {canUpdate ? (
            <Pressable
              onPress={() => void submit("new")}
              disabled={saving !== null}
              style={({ pressed }) => [styles.secondary, (pressed || saving !== null) && styles.pressed]}
              accessibilityRole="button"
            >
              {saving === "new" ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.secondaryText}>Guardar como nuevo</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  saveBlock: { gap: 6, marginTop: 12 },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  saveButtonText: { color: colors.primary, fontWeight: "800", fontSize: 15 },
  savedText: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, textAlign: "center" },
  pressed: { opacity: 0.7 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  headerCopy: { flex: 1, gap: 4 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  body: { paddingHorizontal: 20, gap: 6 },
  label: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.text,
  },
  loader: { marginTop: 24 },
  list: { paddingHorizontal: 20, paddingVertical: 10, gap: 8 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.primary },
  optionText: { flex: 1, fontSize: 15, color: colors.text },
  footer: { padding: 20, gap: 8, borderTopWidth: 1, borderTopColor: colors.divider },
  error: { color: colors.danger, fontSize: 14, textAlign: "center" },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: colors.surface, fontWeight: "800", fontSize: 16 },
  secondary: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  secondaryText: { color: colors.primary, fontWeight: "800", fontSize: 16 },
});
