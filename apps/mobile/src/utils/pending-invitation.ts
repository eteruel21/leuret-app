import AsyncStorage from "@react-native-async-storage/async-storage";

import { extractInvitationCode, isValidInvitationCode } from "./team";

const PENDING_INVITATION_KEY = "@contractor-pro:pending-invitation";

/** Guarda el código de un enlace de invitación para aplicarlo después de iniciar sesión. */
export async function savePendingInvitation(raw: string | null | undefined): Promise<string | null> {
  const code = raw ? extractInvitationCode(raw) : "";
  if (!isValidInvitationCode(code)) return null;
  try {
    await AsyncStorage.setItem(PENDING_INVITATION_KEY, code);
  } catch {
    // Sin almacenamiento el usuario todavía puede pegar el código a mano.
  }
  return code;
}

export async function readPendingInvitation(): Promise<string | null> {
  try {
    const code = await AsyncStorage.getItem(PENDING_INVITATION_KEY);
    return code && isValidInvitationCode(code) ? code : null;
  } catch {
    return null;
  }
}

export async function clearPendingInvitation(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_INVITATION_KEY);
  } catch {
    // Nada que hacer.
  }
}
