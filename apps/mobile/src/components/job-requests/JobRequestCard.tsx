import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { StatusPill } from "@/components/client/StatusPill";
import { colors, radius, shadows } from "@/constants/theme";
import type { JobRequestSummary } from "@/types/job-request";
import type { StatusTone } from "@/utils/client-portal";
import { budgetRangeLabel, locationLabel, timeAgo, timingLabel } from "@/utils/job-requests";

import { absolutePhotoUrl } from "./PhotoStrip";

type JobRequestCardProps = {
  request: JobRequestSummary;
  state: { label: string; tone: StatusTone };
  onPress: () => void;
  /** Mensajes sin leer de la otra parte. */
  unread?: number;
  /** Etiqueta extra, p. ej. «Para ti». */
  badge?: string | null;
  footer?: string | null;
};

export function JobRequestCard({ request, state, onPress, unread = 0, badge, footer }: JobRequestCardProps) {
  const budget = budgetRangeLabel(request.budget_min, request.budget_max);
  const urgent = request.desired_timing === "urgent";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${request.title}, ${state.label}${unread ? `, ${unread} mensajes sin leer` : ""}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.top}>
        {request.cover_photo_url ? (
          <Image source={{ uri: absolutePhotoUrl(request.cover_photo_url) }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={[styles.cover, styles.coverEmpty]}>
            <Ionicons name="construct-outline" size={22} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.info}>
          <View style={styles.tags}>
            <Text style={styles.category} numberOfLines={1}>
              {request.category}
            </Text>
            {badge ? <Text style={styles.badge}>{badge}</Text> : null}
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {request.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            <Ionicons name="location-outline" size={12} color={colors.textSecondary} /> {locationLabel(request)}
          </Text>
        </View>
        {unread > 0 ? (
          <View style={styles.unread} accessibilityElementsHidden>
            <Text style={styles.unreadText}>{unread > 9 ? "9+" : unread}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.chips}>
        <StatusPill label={state.label} tone={state.tone} />
        <Text style={[styles.chip, urgent && styles.chipUrgent]}>{timingLabel(request.desired_timing)}</Text>
        {budget ? <Text style={styles.chip}>{budget}</Text> : null}
        {request.photo_count > 0 ? (
          <Text style={styles.chip}>
            {request.photo_count} foto{request.photo_count === 1 ? "" : "s"}
          </Text>
        ) : null}
      </View>

      <View style={styles.divider} />
      <View style={styles.footer}>
        <Text style={styles.footerText} numberOfLines={1}>
          {footer ?? `${request.quotes_sent_count}/${request.max_quotes} presupuestos`}
        </Text>
        <Text style={styles.footerText}>{timeAgo(request.created_at)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    ...shadows.soft,
  },
  pressed: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, transform: [{ scale: 0.985 }] },
  top: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  cover: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  coverEmpty: { alignItems: "center", justifyContent: "center" },
  info: { flex: 1 },
  tags: { flexDirection: "row", alignItems: "center", gap: 6 },
  category: { color: colors.accent, fontSize: 12, fontWeight: "900", flexShrink: 1 },
  badge: {
    color: colors.success,
    backgroundColor: colors.successSoft,
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  title: { marginTop: 3, color: colors.text, fontSize: 15, fontWeight: "800" },
  meta: { marginTop: 4, color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  unread: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: { color: colors.textInverse, fontSize: 11, fontWeight: "900" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12, alignItems: "center" },
  chip: {
    color: colors.textSecondary,
    backgroundColor: colors.surfaceAlt,
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  chipUrgent: { color: colors.accent, backgroundColor: colors.accentSoft },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 10 },
  footer: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  footerText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600", flexShrink: 1 },
});
