import { Ionicons } from "@expo/vector-icons";
import { type Href, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { MotionPressable } from "@/components/MotionPressable";
import { colors, radius, shadows } from "@/constants/theme";
import { listJobRequestFeed } from "@/services/job-request-service";

/** Acceso desde el inicio del contratista con el número de peticiones para él. */
export function JobRequestsHomeCard({ companyId }: { companyId: string }) {
  const [matching, setMatching] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([
        listJobRequestFeed(companyId, { scope: "matching", limit: 1 }),
        listJobRequestFeed(companyId, { scope: "engaged", limit: 50 }),
      ]).then(([matchingResult, engagedResult]) => {
        if (!active) return;
        if (matchingResult.feed) setMatching(matchingResult.feed.counts.matching);
        if (engagedResult.feed) {
          setUnread(engagedResult.feed.requests.reduce((sum, request) => sum + request.unread_count, 0));
        }
      });
      return () => {
        active = false;
      };
    }, [companyId]),
  );

  const subtitle =
    unread > 0
      ? `${unread} mensaje${unread === 1 ? "" : "s"} nuevo${unread === 1 ? "" : "s"} de clientes`
      : matching === null
        ? "Trabajos publicados por clientes de tu zona"
        : matching === 0
          ? "No hay peticiones nuevas de tu categoría y zona"
          : `${matching} petici${matching === 1 ? "ón abierta" : "ones abiertas"} de tu categoría y zona`;

  return (
    <MotionPressable
      onPress={() => router.push("/peticiones" as Href)}
      pressedScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={`Peticiones de clientes. ${subtitle}`}
      style={styles.card}
    >
      <View style={styles.icon}>
        <Ionicons name="megaphone" size={22} color={colors.textInverse} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>Peticiones de clientes</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {matching || unread ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread || matching}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    marginTop: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  icon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  text: { flex: 1 },
  title: { color: colors.text, fontSize: 15, fontWeight: "900" },
  subtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  badgeText: { color: colors.textInverse, fontSize: 12, fontWeight: "900" },
});
