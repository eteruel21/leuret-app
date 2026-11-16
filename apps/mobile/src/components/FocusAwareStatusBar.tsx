import { useFocusEffect } from "expo-router";
import { StatusBar, type StatusBarStyle } from "expo-status-bar";
import { useCallback, useState } from "react";

/**
 * Cambia el color de la barra de estado solo mientras la pantalla está
 * visible. Las pestañas siguen montadas al cambiar de pestaña, así que un
 * <StatusBar> normal quedaría activo también en las demás.
 */
export function FocusAwareStatusBar({ style }: { style: StatusBarStyle }) {
  const [focused, setFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return focused ? <StatusBar style={style} /> : null;
}
