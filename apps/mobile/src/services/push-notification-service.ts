import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { authenticatedRequest } from "./api";

/** Canal de los avisos del servidor. Debe coincidir con `channelId` de la API y `defaultChannel` de app.json. */
export const PUSH_CHANNEL_ID = "default";
/** Canal de los recordatorios locales de la agenda. */
export const APPOINTMENTS_CHANNEL_ID = "appointments";

const LAST_TOKEN_KEY = "leuret.push.last-registered-token";

// Un solo manejador para toda la app (push del servidor y recordatorios locales).
// Debe responder en menos de 3 s o el sistema descarta el aviso.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export type PushPermissionState =
  | "granted"
  | "denied"
  | "undetermined"
  | "unavailable";

function pushSupported(): boolean {
  return Platform.OS !== "web" && Device.isDevice;
}

function expoProjectId(): string | null {
  const configuredId: unknown = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return process.env.EXPO_PUBLIC_PROJECT_ID?.trim()
    || (typeof configuredId === "string" ? configuredId.trim() : null)
    || null;
}

/**
 * Crea los canales de Android. En Android 13+ el aviso de permiso no aparece
 * hasta que existe al menos un canal, y el token requiere el canal creado.
 */
export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: "Avisos de Leuret",
    description: "Presupuestos, facturas, solicitudes y mensajes.",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#1E2A3A"
  });

  await Notifications.setNotificationChannelAsync(APPOINTMENTS_CHANNEL_ID, {
    name: "Citas y trabajos",
    description: "Recordatorios de la agenda.",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default"
  });
}

/** Estado del permiso de avisos del sistema, sin preguntar al usuario. */
export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (!pushSupported()) return "unavailable";
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status === "granted") return "granted";
    return permission.canAskAgain === false || permission.status === "denied"
      ? "denied"
      : "undetermined";
  } catch {
    return "unavailable";
  }
}

/**
 * Pide (si hace falta) el permiso de avisos del sistema.
 * Devuelve true si quedó concedido.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  // Los recordatorios locales también funcionan en simuladores: solo se excluye la web.
  if (Platform.OS === "web") return false;
  await ensureNotificationChannels();

  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === "granted") return true;
  if (existing.canAskAgain === false) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === "granted";
}

async function currentExpoPushToken(): Promise<string | null> {
  if (!pushSupported()) return null;

  const projectId = expoProjectId();
  if (!projectId) return null;

  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== "granted") return null;

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data?.trim() || null;
}

async function rememberToken(token: string | null): Promise<void> {
  try {
    if (token) await AsyncStorage.setItem(LAST_TOKEN_KEY, token);
    else await AsyncStorage.removeItem(LAST_TOKEN_KEY);
  } catch {
    // Solo es una ayuda para desregistrar; no bloquea.
  }
}

async function lastRegisteredToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Registra el dispositivo en la API para recibir avisos.
 * `prompt: false` solo registra si el permiso ya estaba concedido
 * (p. ej. cuando el sistema rota el token).
 */
export async function registerForPushNotificationsAsync(
  { prompt = true }: { prompt?: boolean } = {}
): Promise<string | null> {
  try {
    if (!pushSupported()) return null;

    const projectId = expoProjectId();
    if (!projectId) return null;

    const granted = prompt
      ? await ensureNotificationPermission()
      : (await getPushPermissionState()) === "granted";
    if (!granted) return null;

    if (!prompt) await ensureNotificationChannels();

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const pushToken = tokenData.data?.trim();
    if (!pushToken) return null;

    await authenticatedRequest("/push-tokens", {
      method: "POST",
      body: JSON.stringify({
        expoPushToken: pushToken,
        devicePlatform: Platform.OS
      })
    });

    const previous = await lastRegisteredToken();
    if (previous && previous !== pushToken) {
      // El token anterior ya no sirve: se retira para no enviarle avisos.
      void unregisterPushTokenAsync(previous);
    }
    await rememberToken(pushToken);

    return pushToken;
  } catch (error) {
    console.error("Error al registrar notificaciones push:", error);
    return null;
  }
}

export async function unregisterPushTokenAsync(pushToken: string): Promise<boolean> {
  try {
    await authenticatedRequest("/push-tokens", {
      method: "DELETE",
      body: JSON.stringify({ expoPushToken: pushToken })
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Retira el token de este dispositivo. Usa el último token registrado, así
 * funciona aunque el usuario haya quitado el permiso en los ajustes.
 */
export async function unregisterCurrentPushTokenAsync(): Promise<boolean> {
  try {
    const pushToken = (await lastRegisteredToken()) ?? (await currentExpoPushToken());
    if (!pushToken) return true;

    const removed = await unregisterPushTokenAsync(pushToken);
    if (removed) await rememberToken(null);
    return removed;
  } catch {
    return false;
  }
}

/** Vuelve a registrar el token cuando el sistema lo rota. */
export function subscribeToPushTokenChanges(): () => void {
  if (!pushSupported()) return () => undefined;
  try {
    const subscription = Notifications.addPushTokenListener(() => {
      void registerForPushNotificationsAsync({ prompt: false });
    });
    return () => subscription.remove();
  } catch {
    return () => undefined;
  }
}

/**
 * Al cerrar sesión: borra los recordatorios programados y los avisos
 * mostrados, para que la siguiente cuenta en el teléfono no los vea.
 */
export async function clearDeviceNotificationsAsync(): Promise<void> {
  if (Platform.OS === "web") return;
  await Promise.allSettled([
    Notifications.cancelAllScheduledNotificationsAsync(),
    Notifications.dismissAllNotificationsAsync(),
    Notifications.setBadgeCountAsync(0)
  ]);
}
