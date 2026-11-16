import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import {
  APPOINTMENTS_CHANNEL_ID,
  ensureNotificationChannels,
  ensureNotificationPermission,
} from "@/services/push-notification-service";

/** Prepara los canales de Android (el manejador de avisos vive en push-notification-service). */
export async function configureLocalNotifications(): Promise<void> {
  await ensureNotificationChannels();
}

export async function scheduleAppointmentNotification({
  title,
  body,
  date,
  reminderMinutes,
}: {
  title: string;
  body: string;
  date: Date;
  reminderMinutes: number;
}): Promise<string> {
  if (Platform.OS === "web") return "";

  // En Android 13+ el canal debe existir antes de pedir el permiso.
  const granted = await ensureNotificationPermission();
  if (!granted) return "";

  const triggerDate = new Date(
    date.getTime() - reminderMinutes * 60_000,
  );

  if (triggerDate.getTime() <= Date.now()) return "";

  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
      data: {
        type: "appointment.reminder",
        url: "/agenda",
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId:
        Platform.OS === "android"
          ? APPOINTMENTS_CHANNEL_ID
          : undefined,
    },
  });
}

export async function cancelScheduledNotification(
  notificationId: string,
): Promise<void> {
  if (Platform.OS === "web" || !notificationId) return;

  await Notifications.cancelScheduledNotificationAsync(
    notificationId,
  );
}
