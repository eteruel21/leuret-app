import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeuretFeedback } from "@/components/LeuretFeedback";
import { LeuretLoading } from "@/components/LeuretLoading";
import { colors, radius } from "@/constants/theme";
import { getJobRequestConversation, sendJobRequestMessage } from "@/services/job-request-service";
import type { JobRequestConversation, JobRequestMessage } from "@/types/job-request";
import { showAlert } from "@/utils/alert";
import { timeAgo } from "@/utils/job-requests";
import { prepareProjectPhoto, type ProjectPhotoSource } from "@/utils/project-photo-picker";

import { absolutePhotoUrl } from "./PhotoStrip";

const POLL_MS = 15_000;

type ConversationViewProps = {
  requestId: string;
  companyId: string;
  /** Texto de ayuda cuando todavía no hay mensajes. */
  emptyHint: string;
};

/**
 * Conversación privada entre el cliente y una empresa sobre una petición.
 * Se actualiza cada 15 s mientras la pantalla está abierta.
 */
export function ConversationView({ requestId, companyId, emptyHint }: ConversationViewProps) {
  const [conversation, setConversation] = useState<JobRequestConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    const result = await getJobRequestConversation(requestId, companyId);
    if (result.conversation) setConversation(result.conversation);
    setError(result.error);
    setLoading(false);
  }, [requestId, companyId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), POLL_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  const append = (message: JobRequestMessage) =>
    setConversation((current) =>
      current ? { ...current, messages: [...current.messages.filter((m) => m.id !== message.id), message] } : current,
    );

  const send = async (photo?: { fileData: string; mimeType: string }) => {
    const body = text.trim();
    if (!body && !photo) return;
    setSending(true);
    try {
      const message = await sendJobRequestMessage(requestId, companyId, {
        body: body || null,
        fileData: photo?.fileData ?? null,
        mimeType: photo?.mimeType ?? null,
      });
      append(message);
      if (!photo) setText("");
      setError(null);
    } catch (sendError) {
      showAlert("No se envió el mensaje", sendError instanceof Error ? sendError.message : "Inténtalo de nuevo.");
    } finally {
      setSending(false);
    }
  };

  const pickPhoto = async (source: ProjectPhotoSource) => {
    try {
      const photo = await prepareProjectPhoto(source);
      if (photo) await send({ fileData: photo.fileData, mimeType: photo.mimeType });
    } catch (pickError) {
      showAlert("No se pudo adjuntar la foto", pickError instanceof Error ? pickError.message : "Inténtalo de nuevo.");
    }
  };

  const attach = () => {
    if (Platform.OS === "web") {
      void pickPhoto("library");
      return;
    }
    showAlert("Adjuntar foto", "¿De dónde quieres tomarla?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Galería", onPress: () => void pickPhoto("library") },
      { text: "Cámara", onPress: () => void pickPhoto("camera") },
    ]);
  };

  if (loading) return <LeuretLoading fullScreen message="Cargando conversación…" />;

  if (!conversation) {
    return (
      <View style={styles.center}>
        <LeuretFeedback
          tone="error"
          title="No pudimos abrir la conversación"
          message={error ?? "Inténtalo de nuevo."}
          actionLabel="Reintentar"
          onAction={() => void load()}
        />
      </View>
    );
  }

  const open = conversation.request.effective_status === "open" || conversation.request.effective_status === "full";
  // Tras adjudicarse, solo la empresa elegida sigue la conversación (la API lo valida).
  const canWrite = open || conversation.request.effective_status === "awarded";
  const mySide = conversation.side;
  const otherName = mySide === "client" ? conversation.companyName ?? "La empresa" : conversation.request.requester_first_name;

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.header}>
          <Text style={styles.headerEyebrow}>{mySide === "client" ? "Conversación con" : "Cliente"}</Text>
          <Text style={styles.headerName} numberOfLines={1}>
            {otherName}
          </Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {conversation.request.title}
          </Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
        >
          {conversation.messages.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="chatbubbles-outline" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>{emptyHint}</Text>
            </View>
          ) : (
            conversation.messages.map((message) => {
              const mine = message.sender_side === mySide;
              return (
                <View key={message.id} style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    {!mine && message.sender_name ? (
                      <Text style={styles.sender}>{message.sender_name}</Text>
                    ) : null}
                    {message.photoUrl ? (
                      <Image source={{ uri: absolutePhotoUrl(message.photoUrl) }} style={styles.photo} resizeMode="cover" />
                    ) : null}
                    {message.body ? (
                      <Text style={[styles.body, mine && styles.bodyMine]}>{message.body}</Text>
                    ) : null}
                    <Text style={[styles.time, mine && styles.timeMine]}>{timeAgo(message.created_at)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {canWrite ? (
          <View style={styles.composer}>
            <Pressable
              onPress={attach}
              disabled={sending}
              accessibilityLabel="Adjuntar foto"
              hitSlop={8}
              style={styles.iconButton}
            >
              <Ionicons name="camera-outline" size={22} color={colors.primary} />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Escribe un mensaje…"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline
              maxLength={2000}
              accessibilityLabel="Mensaje"
            />
            <Pressable
              onPress={() => void send()}
              disabled={sending || !text.trim()}
              accessibilityLabel="Enviar mensaje"
              style={[styles.sendButton, (sending || !text.trim()) && styles.sendDisabled]}
            >
              {sending ? (
                <ActivityIndicator color={colors.textInverse} size="small" />
              ) : (
                <Ionicons name="send" size={18} color={colors.textInverse} />
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.closedBar}>
            <Text style={styles.closedText}>La petición está cerrada. Ya no se pueden enviar mensajes.</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, padding: 20, justifyContent: "center", backgroundColor: colors.background },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerEyebrow: { color: colors.textMuted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  headerName: { color: colors.text, fontSize: 17, fontWeight: "900", marginTop: 2 },
  headerTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "600", marginTop: 2 },
  messages: { padding: 16, gap: 8, flexGrow: 1 },
  emptyBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  emptyText: { color: colors.textSecondary, fontSize: 14, fontWeight: "600", textAlign: "center", lineHeight: 20 },
  bubbleRow: { flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "82%", paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.lg },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
  sender: { color: colors.accent, fontSize: 11, fontWeight: "900", marginBottom: 3 },
  photo: { width: 200, height: 200, borderRadius: radius.md, marginBottom: 6, backgroundColor: colors.surfaceAlt },
  body: { color: colors.text, fontSize: 15, lineHeight: 21 },
  bodyMine: { color: colors.textInverse },
  time: { color: colors.textMuted, fontSize: 10, fontWeight: "700", marginTop: 4, alignSelf: "flex-end" },
  timeMine: { color: colors.textLightMuted },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  iconButton: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.45 },
  closedBar: { padding: 16, backgroundColor: colors.surfaceAlt },
  closedText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700", textAlign: "center" },
});
