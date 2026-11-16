import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

/**
 * Carga la pantalla al abrirla y la vuelve a leer del servidor cada vez que
 * recupera el foco (al volver de una calculadora, de la agenda, de una
 * factura…) o cuando cambia la función de carga (otra empresa activa). La
 * primera carga recibe `refresh = false` (indicador de pantalla completa);
 * las siguientes, `refresh = true` (indicador de actualización).
 */
export function useRefreshOnFocus(load: (refresh: boolean) => unknown) {
  const loadedOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const refresh = loadedOnce.current;
      loadedOnce.current = true;
      void load(refresh);
    }, [load]),
  );
}
