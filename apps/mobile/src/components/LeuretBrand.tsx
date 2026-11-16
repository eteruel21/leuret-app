import { Image, StyleSheet, View } from "react-native";

import { colors, radius } from "@/constants/theme";

export function LeuretBrand({ width = 68 }: { width?: number }) {
  return (
    <View style={[styles.background, { width }]}>
      <Image
        source={require("../../assets/images/leuret-logo-header.png")}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel="LEURET"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    aspectRatio: 600 / 422,
    borderRadius: radius.md,
    backgroundColor: colors.cream,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
});
