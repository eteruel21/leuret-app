import { type Href, router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChoiceChips } from "@/components/job-requests/ChoiceChips";
import { PhotoStrip, type StripPhoto } from "@/components/job-requests/PhotoStrip";
import { LeuretButton } from "@/components/LeuretButton";
import { LeuretFeedback } from "@/components/LeuretFeedback";
import { CONTRACTOR_CATEGORIES } from "@/constants/contractor-categories";
import { PANAMA_PROVINCES } from "@/constants/panama-provinces";
import { colors, radius } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { createJobRequest, uploadJobRequestPhoto } from "@/services/job-request-service";
import type { JobRequestTiming } from "@/types/job-request";
import { showAlert } from "@/utils/alert";
import { JOB_REQUEST_TIMINGS, parseAmount, validateJobRequestForm } from "@/utils/job-requests";
import { prepareProjectPhoto, type ProjectPhotoSource } from "@/utils/project-photo-picker";

type LocalPhoto = StripPhoto & { fileData: string; mimeType: string };

const MAX_PHOTOS = 8;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export default function NewJobRequestScreen() {
  const { profile } = useAuth();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [province, setProvince] = useState<string | null>(profile?.province ?? null);
  const [district, setDistrict] = useState(profile?.district ?? "");
  const [corregimiento, setCorregimiento] = useState(profile?.corregimiento ?? "");
  const [addressLine, setAddressLine] = useState("");
  const [reference, setReference] = useState("");
  const [timing, setTiming] = useState<JobRequestTiming>("flexible");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const addPhoto = async (source: ProjectPhotoSource) => {
    try {
      const photo = await prepareProjectPhoto(source);
      if (!photo) return;
      setPhotos((current) =>
        current.length >= MAX_PHOTOS
          ? current
          : [...current, { id: `${Date.now()}`, uri: photo.previewUri, fileData: photo.fileData, mimeType: photo.mimeType }],
      );
    } catch (error) {
      showAlert("No se pudo agregar la foto", error instanceof Error ? error.message : "Inténtalo de nuevo.");
    }
  };

  const choosePhotoSource = () => {
    if (Platform.OS === "web") {
      void addPhoto("library");
      return;
    }
    showAlert("Agregar foto", "Las fotos ayudan a que te coticen con más precisión.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Galería", onPress: () => void addPhoto("library") },
      { text: "Cámara", onPress: () => void addPhoto("camera") },
    ]);
  };

  const submit = async () => {
    const problem = validateJobRequestForm({ title, description, category, province, addressLine, budgetMin, budgetMax });
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    setProgress("Publicando…");

    let requestId: string;
    try {
      requestId = await createJobRequest({
        title: title.trim(),
        description: description.trim(),
        category: category!,
        province: province!,
        district: district.trim() || null,
        corregimiento: corregimiento.trim() || null,
        addressLine: addressLine.trim(),
        reference: reference.trim() || null,
        timing,
        budgetMin: parseAmount(budgetMin),
        budgetMax: parseAmount(budgetMax),
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo publicar la petición.");
      setSubmitting(false);
      setProgress(null);
      return;
    }

    // Las fotos se suben después; si alguna falla, la petición ya existe y
    // se pueden agregar desde el detalle.
    let failed = 0;
    for (const [index, photo] of photos.entries()) {
      setProgress(`Subiendo foto ${index + 1} de ${photos.length}…`);
      try {
        await uploadJobRequestPhoto(requestId, { fileData: photo.fileData, mimeType: photo.mimeType });
      } catch {
        failed += 1;
      }
    }

    setSubmitting(false);
    setProgress(null);
    router.replace({ pathname: "/cliente-peticiones/[id]", params: { id: requestId } } as Href);
    if (failed > 0) {
      showAlert(
        "Petición publicada",
        `No se pudo${failed === 1 ? "" : "ieron"} subir ${failed} foto${failed === 1 ? "" : "s"}. Puedes agregarla${failed === 1 ? "" : "s"} desde el detalle.`,
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            Los contratistas de tu zona verán el trabajo, las fotos y tu nombre de pila. Tu dirección exacta, teléfono y
            correo solo los recibe la empresa que te envíe un presupuesto.
          </Text>

          <Field label="¿Qué necesitas?">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Ej. Instalar 6 tomacorrientes en la sala"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              maxLength={120}
              accessibilityLabel="Título de la petición"
            />
          </Field>

          <Field label="Tipo de trabajo">
            <ChoiceChips options={CONTRACTOR_CATEGORIES} value={category} onChange={setCategory} accessibilityLabel="Tipo de trabajo" />
          </Field>

          <Field label="Describe el trabajo" hint="Medidas, materiales, qué está dañado, si hay que comprar el material…">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Ej. Son 6 tomacorrientes dobles en pared de bloque. Hay que pasar tubería desde el panel…"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.textarea]}
              multiline
              maxLength={4000}
              textAlignVertical="top"
              accessibilityLabel="Descripción del trabajo"
            />
            <Text style={styles.counter}>{description.trim().length}/4000</Text>
          </Field>

          <Field label="Fotos (opcional)" hint={`Hasta ${MAX_PHOTOS}. Muestra el área y el problema.`}>
            <PhotoStrip
              photos={photos}
              onAdd={choosePhotoSource}
              onRemove={(photo) => setPhotos((current) => current.filter((item) => item.id !== photo.id))}
              max={MAX_PHOTOS}
            />
          </Field>

          <Field label="Provincia">
            <ChoiceChips options={PANAMA_PROVINCES} value={province} onChange={setProvince} accessibilityLabel="Provincia" />
          </Field>

          <View style={styles.row}>
            <View style={styles.half}>
              <Field label="Distrito">
                <TextInput
                  value={district}
                  onChangeText={setDistrict}
                  placeholder="Ej. San Miguelito"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  maxLength={80}
                />
              </Field>
            </View>
            <View style={styles.half}>
              <Field label="Corregimiento">
                <TextInput
                  value={corregimiento}
                  onChangeText={setCorregimiento}
                  placeholder="Ej. Belisario Porras"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  maxLength={80}
                />
              </Field>
            </View>
          </View>

          <Field label="Dirección exacta" hint="Privada: solo la ve quien te envíe un presupuesto.">
            <TextInput
              value={addressLine}
              onChangeText={setAddressLine}
              placeholder="Calle, casa o edificio y apartamento"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              maxLength={300}
            />
            <TextInput
              value={reference}
              onChangeText={setReference}
              placeholder="Punto de referencia (opcional)"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.stacked]}
              maxLength={300}
            />
          </Field>

          <Field label="¿Para cuándo?">
            <ChoiceChips
              options={JOB_REQUEST_TIMINGS}
              value={timing}
              onChange={(value) => value && setTiming(value as JobRequestTiming)}
              accessibilityLabel="Plazo"
            />
          </Field>

          <Field label="Presupuesto aproximado (opcional)" hint="Ayuda a que te coticen opciones acordes.">
            <View style={styles.row}>
              <TextInput
                value={budgetMin}
                onChangeText={setBudgetMin}
                placeholder="Desde $"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.half]}
                keyboardType="decimal-pad"
              />
              <TextInput
                value={budgetMax}
                onChangeText={setBudgetMax}
                placeholder="Hasta $"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.half]}
                keyboardType="decimal-pad"
              />
            </View>
          </Field>

          {formError ? <LeuretFeedback tone="error" title="Revisa la petición" message={formError} style={styles.feedback} /> : null}

          <LeuretButton
            label={progress ?? "Publicar petición"}
            icon="megaphone-outline"
            onPress={() => void submit()}
            loading={submitting}
            disabled={submitting}
            fullWidth
          />
          <Text style={styles.footnote}>La petición queda abierta 30 días o hasta recibir 5 presupuestos.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  intro: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    backgroundColor: colors.infoSoft,
    padding: 12,
    borderRadius: radius.md,
    marginBottom: 8,
  },
  field: { marginTop: 18 },
  label: { color: colors.text, fontSize: 14, fontWeight: "900", marginBottom: 6 },
  hint: { color: colors.textSecondary, fontSize: 12, fontWeight: "600", marginTop: -2, marginBottom: 8 },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
  },
  textarea: { minHeight: 130 },
  stacked: { marginTop: 8 },
  counter: { alignSelf: "flex-end", marginTop: 4, color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  feedback: { marginTop: 18 },
  footnote: { marginTop: 10, color: colors.textMuted, fontSize: 12, fontWeight: "600", textAlign: "center" },
});
