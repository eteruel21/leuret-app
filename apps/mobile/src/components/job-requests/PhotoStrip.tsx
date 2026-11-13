import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/constants/theme";
import { API_URL } from "@/services/api";

export function absolutePhotoUrl(url: string): string {
  return url.startsWith("http") || url.startsWith("file:") || url.startsWith("data:") || url.startsWith("blob:")
    ? url
    : `${API_URL}${url}`;
}

export type StripPhoto = { id: string; uri: string };

type PhotoStripProps = {
  photos: StripPhoto[];
  /** Muestra el botón para agregar (con el límite de fotos). */
  onAdd?: () => void;
  onRemove?: (photo: StripPhoto) => void;
  max?: number;
  busy?: boolean;
  emptyText?: string;
};

/** Fila de miniaturas con visor a pantalla completa. */
export function PhotoStrip({ photos, onAdd, onRemove, max = 8, busy = false, emptyText }: PhotoStripProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const viewerPhoto = viewerIndex === null ? null : photos[viewerIndex] ?? null;
  const canAdd = Boolean(onAdd) && photos.length < max;

  if (photos.length === 0 && !canAdd) {
    return emptyText ? <Text style={styles.empty}>{emptyText}</Text> : null;
  }

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {photos.map((photo, index) => (
          <View key={photo.id} style={styles.thumbWrap}>
            <Pressable
              onPress={() => setViewerIndex(index)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Foto ${index + 1}`}
            >
              <Image source={{ uri: absolutePhotoUrl(photo.uri) }} style={styles.thumb} resizeMode="cover" />
            </Pressable>
            {onRemove ? (
              <Pressable
                onPress={() => onRemove(photo)}
                accessibilityLabel={`Quitar foto ${index + 1}`}
                hitSlop={8}
                style={styles.remove}
              >
                <Ionicons name="close" size={14} color={colors.textInverse} />
              </Pressable>
            ) : null}
          </View>
        ))}

        {canAdd ? (
          <Pressable
            onPress={onAdd}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Agregar foto"
            style={({ pressed }) => [styles.addTile, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={24} color={colors.primary} />
                <Text style={styles.addText}>
                  {photos.length}/{max}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal visible={viewerPhoto !== null} transparent animationType="fade" onRequestClose={() => setViewerIndex(null)}>
        <View style={styles.viewer}>
          <Pressable style={styles.viewerClose} onPress={() => setViewerIndex(null)} accessibilityLabel="Cerrar foto" hitSlop={12}>
            <Ionicons name="close" size={28} color={colors.textInverse} />
          </Pressable>
          {viewerPhoto ? (
            <Image source={{ uri: absolutePhotoUrl(viewerPhoto.uri) }} style={styles.viewerImage} resizeMode="contain" />
          ) : null}
          {photos.length > 1 ? (
            <View style={styles.viewerNav}>
              <Pressable
                disabled={viewerIndex === 0}
                onPress={() => setViewerIndex((index) => (index === null ? null : Math.max(0, index - 1)))}
                accessibilityLabel="Foto anterior"
                style={[styles.viewerButton, viewerIndex === 0 && styles.disabled]}
              >
                <Ionicons name="chevron-back" size={24} color={colors.textInverse} />
              </Pressable>
              <Text style={styles.viewerCount}>
                {(viewerIndex ?? 0) + 1} / {photos.length}
              </Text>
              <Pressable
                disabled={viewerIndex === photos.length - 1}
                onPress={() => setViewerIndex((index) => (index === null ? null : Math.min(photos.length - 1, index + 1)))}
                accessibilityLabel="Foto siguiente"
                style={[styles.viewerButton, viewerIndex === photos.length - 1 && styles.disabled]}
              >
                <Ionicons name="chevron-forward" size={24} color={colors.textInverse} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingVertical: 4 },
  thumbWrap: { position: "relative" },
  thumb: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  remove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  addTile: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addText: { color: colors.textSecondary, fontSize: 11, fontWeight: "800" },
  pressed: { opacity: 0.8 },
  empty: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  viewer: { flex: 1, backgroundColor: "rgba(10, 14, 20, 0.94)", justifyContent: "center", alignItems: "center", padding: 16 },
  viewerClose: { position: "absolute", top: 48, right: 20, zIndex: 2 },
  viewerImage: { width: "100%", height: "75%" },
  viewerNav: { flexDirection: "row", alignItems: "center", gap: 24, marginTop: 16 },
  viewerButton: { padding: 10 },
  viewerCount: { color: colors.textInverse, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.3 },
});
