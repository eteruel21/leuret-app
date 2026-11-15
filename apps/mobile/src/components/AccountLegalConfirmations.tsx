import { Link, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { LegalConfirmationRow } from "@/components/LegalConfirmationRow";
import { LeuretButton } from "@/components/LeuretButton";
import { colors } from "@/constants/theme";
import {
  type AccountLegalStatus,
  ApiError,
  confirmAccountLegalDocuments,
  getAccountLegalStatus,
  type LegalConfirmations,
} from "@/services/api";

const publicDocuments = [
  { title: "Términos y Condiciones de Uso", url: "https://admin.leurettech.com/legal/terms" },
  { title: "Política de Privacidad", url: "https://admin.leurettech.com/legal/privacy" },
];

export function AccountLegalConfirmations() {
  const [status, setStatus] = useState<AccountLegalStatus | null>(null);
  const [loadingError, setLoadingError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getAccountLegalStatus(controller.signal).then(
      (current) => {
        if (!controller.signal.aborted) setStatus(current);
      },
      () => {
        if (!controller.signal.aborted) setLoadingError(true);
      },
    );
    return () => controller.abort();
  }, [attempt]);

  function reload() {
    setStatus(null);
    setLoadingError(false);
    setTermsAccepted(false);
    setPrivacyAcknowledged(false);
    setAttempt((previous) => previous + 1);
  }

  async function save() {
    if (!status || saving) return;
    const selected: LegalConfirmations = {};
    if (termsAccepted && !status.terms.confirmedAt) {
      selected.terms = { accepted: true, version: status.terms.version };
    }
    if (privacyAcknowledged && !status.privacy.confirmedAt) {
      selected.privacy = { acknowledged: true, version: status.privacy.version };
    }
    if (!selected.terms && !selected.privacy) return;

    setSaving(true);
    setMessage(null);
    try {
      setStatus(await confirmAccountLegalDocuments(selected));
      setTermsAccepted(false);
      setPrivacyAcknowledged(false);
      setMessage("Constancia guardada.");
    } catch (error) {
      if (error instanceof ApiError && error.code === "LEGAL_DOCUMENTS_CHANGED") {
        reload();
      }
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la constancia.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      {status ? (
        <>
          <LegalConfirmationRow
            type="terms"
            document={status.terms}
            confirmedAt={status.terms.confirmedAt}
            checked={termsAccepted}
            disabled={saving}
            onChange={setTermsAccepted}
          />
          <LegalConfirmationRow
            type="privacy"
            document={status.privacy}
            confirmedAt={status.privacy.confirmedAt}
            checked={privacyAcknowledged}
            disabled={saving}
            onChange={setPrivacyAcknowledged}
          />
          {!status.terms.confirmedAt || !status.privacy.confirmedAt ? (
            <LeuretButton
              accessibilityRole="button"
              label="Guardar confirmaciones"
              variant="secondary"
              loading={saving}
              disabled={!termsAccepted && !privacyAcknowledged}
              onPress={() => void save()}
            />
          ) : null}
        </>
      ) : loadingError ? (
        <>
          {publicDocuments.map(({ title, url }) => (
            <Link
              key={url}
              href={url as Href}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.link}
            >
              {title}
            </Link>
          ))}
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            No se pudieron consultar tus confirmaciones.
          </Text>
          <LeuretButton label="Reintentar" variant="secondary" onPress={reload} />
        </>
      ) : (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          Cargando documentos legales…
        </Text>
      )}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.status}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  status: {
    color: colors.textSecondary,
    fontSize: 13,
    paddingVertical: 8,
  },
  link: {
    color: colors.primary,
    fontWeight: "800",
    paddingVertical: 10,
    textDecorationLine: "underline",
  },
});
