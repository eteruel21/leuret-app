import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { MotionPressable } from "@/components/MotionPressable";
import { CALCULATORS as categories, type CalculationCategory } from "@/constants/calculators";

import {
  colors,
  layout,
  radius,
  shadows,
  typography,
} from "@/constants/theme";

export default function CalculationsScreen() {
  function openCategory(category: CalculationCategory) {
    if (!category.enabled || !category.route) {
      return;
    }

    router.push(category.route);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerOrb} />
          <View style={styles.headerIcon}>
            <Ionicons
              name="calculator-outline"
              size={28}
              color={colors.textLight}
            />
          </View>

          <View style={styles.headerText}>
            <Text style={styles.headerEyebrow}>HERRAMIENTAS DE OBRA</Text>
            <Text style={styles.title}>Calculadoras</Text>

            <Text style={styles.subtitle}>
              Estimaciones rápidas con los datos de tu empresa.
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countValue}>10</Text>
            <Text style={styles.countLabel}>tipos</Text>
          </View>
        </View>

        <View style={styles.notice}>
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={colors.info}
          />

          <Text style={styles.noticeText}>
            Los resultados son estimaciones. Rendimientos,
            precios y desperdicios se pueden ajustar en cada
            calculadora; los precios salen del catálogo.
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEyebrow}>CALCULADORAS DISPONIBLES</Text>
          <Text style={styles.sectionMeta}>10 herramientas técnicas</Text>
        </View>

        <View style={styles.grid}>
          {categories.map((category, index) => (
            <MotionPressable
              key={category.id}
              entering={FadeInUp.delay(index * 45).duration(320)}
              disabled={!category.enabled}
              onPress={() => openCategory(category)}
              style={({ pressed }) => [
                styles.card,
                !category.enabled && styles.disabledCard,
                pressed && category.enabled && styles.pressedCard,
              ]}
            >
              <View style={styles.cardTop}>
                <View
                  style={[
                    styles.categoryIcon,
                    !category.enabled &&
                      styles.disabledCategoryIcon,
                  ]}
                >
                  <Ionicons
                    name={category.icon}
                    size={24}
                    color={
                      category.enabled
                        ? colors.primary
                        : colors.textMuted
                    }
                  />
                </View>

                {!category.enabled && (
                  <View style={styles.comingSoon}>
                    <Text style={styles.comingSoonText}>
                      Próximamente
                    </Text>
                  </View>
                )}
              </View>

              <Text
                style={[
                  styles.cardTitle,
                  !category.enabled &&
                    styles.disabledCardText,
                ]}
              >
                {category.title}
              </Text>

              <Text style={styles.cardDescription}>
                {category.description}
              </Text>

              {category.enabled && (
                <View style={styles.openRow}>
                  <Text style={styles.openText}>Abrir</Text>

                  <Ionicons
                    name="arrow-forward-outline"
                    size={18}
                    color={colors.accent}
                  />
                </View>
              )}
            </MotionPressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surfaceDark,
  },

  content: {
    flexGrow: 1,
    paddingBottom: 34,
    backgroundColor: colors.background,
  },

  header: {
    minHeight: 178,
    paddingHorizontal: layout.screenPadding,
    paddingTop: 24,
    paddingBottom: 32,
    backgroundColor: colors.surfaceDark,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },

  headerOrb: {
    position: "absolute",
    width: 190,
    height: 190,
    top: -90,
    right: -80,
    borderRadius: 95,
    borderWidth: 32,
    borderColor: "rgba(255,255,255,0.035)",
  },

  headerIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.glow,
  },

  headerText: {
    flex: 1,
    marginLeft: 15,
  },

  headerEyebrow: {
    marginBottom: 5,
    color: colors.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  title: {
    color: colors.textLight,
    ...typography.title,
  },

  subtitle: {
    marginTop: 4,
    color: colors.textLightMuted,
    fontSize: 12,
    lineHeight: 18,
  },

  countBadge: {
    minWidth: 52,
    marginLeft: 10,
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
  },

  countValue: {
    color: colors.textLight,
    fontSize: 17,
    fontWeight: "900",
  },

  countLabel: {
    marginTop: 1,
    color: colors.textLightMuted,
    fontSize: 9,
    fontWeight: "700",
  },

  notice: {
    marginHorizontal: 20,
    marginTop: 22,
    marginBottom: 20,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    ...shadows.soft,
  },

  noticeText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },

  sectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },

  sectionEyebrow: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  sectionMeta: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
  },

  grid: {
    paddingHorizontal: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  card: {
    width: "48%",
    minWidth: 155,
    maxWidth: 340,
    flexGrow: 1,
    minHeight: 202,
    padding: 17,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },

  disabledCard: {
    opacity: 0.68,
  },

  pressedCard: {
    opacity: 0.8,
  },

  cardTop: {
    minHeight: 47,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  disabledCategoryIcon: {
    backgroundColor: colors.steelSoft,
  },

  comingSoon: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: colors.primaryWash,
  },

  comingSoonText: {
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: "800",
  },

  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },

  disabledCardText: {
    color: colors.textSecondary,
  },

  cardDescription: {
    marginTop: 7,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },

  openRow: {
    marginTop: "auto",
    paddingTop: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  openText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "900",
  },
});

