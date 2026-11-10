import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius } from "@/constants/theme";
import { useCompany } from "@/contexts/CompanyContext";
import { updateCompanyBillingDetails } from "@/services/company-service";
import { uploadCompanyLogo } from "@/services/media-upload-service";
import { prepareProjectPhoto } from "@/utils/project-photo-picker";
import { RequirePermission } from "@/components/RequirePermission";

function InvoiceSettingsScreenContent() {
  const { activeCompany, refreshCompanies } = useCompany();

  const [legalName, setLegalName] = useState(activeCompany?.legal_name ?? "");
  const [taxId, setTaxId] = useState(activeCompany?.tax_id ?? "");
  const [phone, setPhone] = useState(activeCompany?.phone ?? "");
  const [email, setEmail] = useState(activeCompany?.email ?? "");
  const [address, setAddress] = useState(activeCompany?.address ?? "");
  const [logoUrl, setLogoUrl] = useState(activeCompany?.logo_url ?? "");
  const [invoicePrefix, setInvoicePrefix] = useState(
    activeCompany?.invoice_prefix ?? "FAC",
  );
  const [taxRate, setTaxRate] = useState(
    String(activeCompany?.tax_rate ?? 0),
  );
  const [remindersEnabled, setRemindersEnabled] = useState(activeCompany?.payment_reminders_enabled !== false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleSelectLogoFile = async () => {
    if (!activeCompany) return;

    try {
      setUploadingLogo(true);
      const image = await prepareProjectPhoto("library");
      if (!image) return;
      const url = await uploadCompanyLogo(activeCompany.id, {
        fileData: image.fileData,
        mimeType: image.mimeType
      });
      setLogoUrl(url);
    } catch (error: unknown) {
      Alert.alert(
        "No se pudo subir el logotipo",
        error instanceof Error ? error.message : "Inténtalo nuevamente."
      );
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!activeCompany) return;

    if (!invoicePrefix.trim()) {
      Alert.alert("Prefijo requerido", "Introduce un prefijo para las facturas (ej. FAC).");
      return;
    }

    try {
      setSaving(true);
      const rate = Number(taxRate.replace(",", "."));

      const { error } = await updateCompanyBillingDetails({
        companyId: activeCompany.id,
        legalName: legalName.trim() || null,
        taxId: taxId.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        logoUrl: logoUrl.trim() || null,
        invoicePrefix: invoicePrefix.trim().toUpperCase(),
        taxRate: Number.isFinite(rate) ? rate : 0,
        paymentRemindersEnabled: remindersEnabled,
      });

      if (error) {
        Alert.alert("No fue posible guardar los cambios", error);
        return;
      }

      await refreshCompanies();
      Alert.alert("Cambios guardados", "El formato de tu factura ha sido actualizado con éxito.", [
        { text: "Aceptar", onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Ocurrió un error inesperado.");
    } finally {
      setSaving(false);
    }
  };

  if (!activeCompany) {
    return (
      <View style={styles.loader}>
        <Text style={styles.loaderText}>Empresa no disponible</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "Diseño de Factura",
        }}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={20} color={colors.info} />
            <Text style={styles.infoText}>
              Completa estos campos para personalizar el encabezado y detalles del PDF de tus facturas.
            </Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Razón Social / Nombre Comercial</Text>
            <TextInput
              value={legalName}
              onChangeText={setLegalName}
              placeholder="Ej. Soluciones Constructivas S.A."
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Identificación Tributaria (RUC / NIT)</Text>
            <TextInput
              value={taxId}
              onChangeText={setTaxId}
              placeholder="Ej. 155-224-899 DV 20"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Dirección física</Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Ej. Calle 50, Edificio Pro, Ciudad de Panamá"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.formGroup, styles.col]}>
              <Text style={styles.label}>Teléfono de contacto</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="Ej. +507 399-2811"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>

            <View style={[styles.formGroup, styles.col]}>
              <Text style={styles.label}>Correo electrónico</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="Ej. facturas@empresa.com"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Logotipo de la empresa</Text>
            
            {logoUrl ? (
              <View style={styles.logoPreviewContainer}>
                <Image
                  source={{ uri: logoUrl }}
                  style={styles.logoPreview}
                  resizeMode="contain"
                />
                <Pressable
                  onPress={() => setLogoUrl("")}
                  style={styles.removeLogoButton}
                >
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  <Text style={styles.removeLogoText}>Quitar logotipo</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.noLogoBox}>
                <Ionicons name="image-outline" size={32} color={colors.steel} />
                <Text style={styles.noLogoText}>Sin logotipo seleccionado</Text>
              </View>
            )}

            <View style={styles.logoUploadActions}>
              <Pressable
                onPress={handleSelectLogoFile}
                disabled={uploadingLogo}
                style={({ pressed }) => [
                  styles.uploadFileButton,
                  pressed && styles.pressed,
                ]}
              >
                {uploadingLogo ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                )}
                <Text style={styles.uploadFileButtonText}>
                  {uploadingLogo ? "Subiendo..." : "Cargar archivo de imagen"}
                </Text>
              </Pressable>

              <TextInput
                value={logoUrl}
                onChangeText={setLogoUrl}
                autoCapitalize="none"
                placeholder="O pega la URL de la imagen aquí..."
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.logoUrlInput]}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.formGroup, styles.col]}>
              <Text style={styles.label}>Prefijo de factura</Text>
              <TextInput
                value={invoicePrefix}
                onChangeText={setInvoicePrefix}
                autoCapitalize="characters"
                placeholder="Ej. FAC"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>

            <View style={[styles.formGroup, styles.col]}>
              <Text style={styles.label}>Tasa de ITBMS / Impuesto (%)</Text>
              <TextInput
                value={taxRate}
                onChangeText={setTaxRate}
                keyboardType="numeric"
                placeholder="Ej. 7"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.reminderCard}>
            <View style={styles.reminderCopy}>
              <Text style={styles.label}>Recordatorios de cobro automáticos</Text>
              <Text style={styles.reminderHelp}>
                Enviamos un correo al cliente 3 días antes de que venza la factura, al día siguiente de vencer y una semana después, solo si tiene saldo pendiente y correo registrado.
              </Text>
            </View>
            <Switch
              value={remindersEnabled}
              onValueChange={setRemindersEnabled}
              trackColor={{ true: colors.success, false: colors.border }}
              accessibilityLabel="Recordatorios de cobro automáticos"
            />
          </View>

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              saving && styles.disabledButton,
              pressed && styles.pressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.textLight} />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color={colors.textLight} />
                <Text style={styles.saveButtonText}>Guardar cambios</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  reminderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    marginBottom: 16,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reminderCopy: { flex: 1 },
  reminderHelp: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },

  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  flex: {
    flex: 1,
  },

  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },

  loaderText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  infoBox: {
    marginBottom: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.steelSoft,
    borderRadius: radius.md,
    backgroundColor: colors.steelSoft,
    flexDirection: "row",
    gap: 8,
  },

  infoText: {
    flex: 1,
    color: colors.primary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "bold",
  },

  formGroup: {
    marginBottom: 15,
  },

  row: {
    flexDirection: "row",
    gap: 12,
  },

  col: {
    flex: 1,
  },

  label: {
    marginBottom: 7,
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },

  input: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 13,
  },

  saveButton: {
    minHeight: 52,
    marginTop: 15,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  saveButtonText: {
    color: colors.textLight,
    fontSize: 14,
    fontWeight: "900",
  },

  disabledButton: {
    opacity: 0.65,
  },

  pressed: {
    opacity: 0.78,
  },

  logoPreviewContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },

  logoPreview: {
    width: 100,
    height: 50,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
  },

  removeLogoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.dangerSoft,
    backgroundColor: colors.dangerSoft,
  },

  removeLogoText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "800",
  },

  noLogoBox: {
    minHeight: 80,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 10,
    backgroundColor: colors.surfaceAlt,
  },

  noLogoText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },

  logoUploadActions: {
    flexDirection: "column",
    gap: 8,
  },

  uploadFileButton: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.steel,
    backgroundColor: colors.steelSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  uploadFileButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },

  logoUrlInput: {
    minHeight: 40,
    fontSize: 12,
  },
});

export default function InvoiceSettingsScreen() {
  return (
    <RequirePermission capability="company.manage" section="Datos de facturación">
      <InvoiceSettingsScreenContent />
    </RequirePermission>
  );
}
