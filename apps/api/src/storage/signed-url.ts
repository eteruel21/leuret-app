import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export type SignedPhotoPayload = {
  photoId: string;
  storagePath: string;
};

export async function generateSignedPhotoUrl(
  photoId: string,
  storagePath: string,
  expiresInMinutes: number = 60
): Promise<string> {
  const token = await new SignJWT({
    kind: "project_photo",
    photoId,
    storagePath
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${expiresInMinutes}m`)
    .sign(secret);

  return `/storage/files/${photoId}?token=${token}`;
}

export async function generateSignedProfileDocumentUrl(
  userId: string,
  documentType: string,
  expiresInMinutes: number = 10
): Promise<string> {
  const token = await new SignJWT({
    kind: "profile_document",
    userId,
    documentType
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${expiresInMinutes}m`)
    .sign(secret);

  return `/storage/profile-documents/${encodeURIComponent(userId)}/${encodeURIComponent(documentType)}?token=${token}`;
}

export async function verifyPhotoToken(token: string): Promise<SignedPhotoPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (
      payload.kind !== "project_photo" ||
      typeof payload.photoId !== "string" ||
      typeof payload.storagePath !== "string"
    ) {
      return null;
    }

    return {
      photoId: payload.photoId,
      storagePath: payload.storagePath
    };
  } catch {
    return null;
  }
}

export async function verifyProfileDocumentToken(
  token: string,
  userId: string,
  documentType: string
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret);

    return (
      payload.kind === "profile_document" &&
      payload.userId === userId &&
      payload.documentType === documentType
    );
  } catch {
    return false;
  }
}

/**
 * Enlace breve para descargar la exportación de datos desde el navegador del
 * teléfono (la app nativa no puede guardar el JSON como archivo). Solo
 * identifica al usuario; la descarga vuelve a leer los datos con RLS.
 */
export async function generateAccountExportToken(
  userId: string,
  expiresInMinutes: number = 10
): Promise<string> {
  return new SignJWT({
    kind: "account_export",
    userId
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${expiresInMinutes}m`)
    .sign(secret);
}

export async function verifyAccountExportToken(
  token: string
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);

    return payload.kind === "account_export" &&
      typeof payload.userId === "string" &&
      /^[0-9a-f-]{36}$/i.test(payload.userId)
      ? payload.userId
      : null;
  } catch {
    return null;
  }
}
