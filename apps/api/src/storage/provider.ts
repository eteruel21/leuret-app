import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { env } from "../config/env.js";
import { generateSignedPhotoUrl } from "./signed-url.js";

type UploadInput = {
  storagePath: string;
  buffer: Buffer;
  mimeType: string;
};

type R2ObjectBodyLike = {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: {
    contentType?: string;
  };
};

export type R2BucketBinding = {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
    }
  ): Promise<unknown>;

  get(key: string): Promise<R2ObjectBodyLike | null>;

  delete(key: string | string[]): Promise<void>;
};

let r2Bucket: R2BucketBinding | null = null;

type StorageRuntimeEnvironment =
  | "development"
  | "test"
  | "staging"
  | "production";

const uploadsLocalDir = path.join(
  process.cwd(),
  "storage",
  "uploads"
);

export function normalizeStorageKey(storagePath: string): string {
  if (
    typeof storagePath !== "string" ||
    storagePath.length === 0 ||
    storagePath.length > 1024 ||
    storagePath !== storagePath.trim() ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(storagePath)
  ) {
    throw new Error("La clave de almacenamiento no es válida.");
  }

  const segments = storagePath.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".."
    ) ||
    path.posix.normalize(storagePath) !== storagePath
  ) {
    throw new Error("La clave de almacenamiento no es válida.");
  }

  return storagePath;
}

function resolveLocalStoragePath(storagePath: string): string {
  const normalizedKey = normalizeStorageKey(storagePath);
  const resolvedPath = path.resolve(
    uploadsLocalDir,
    normalizedKey
  );
  const relativePath = path.relative(
    uploadsLocalDir,
    resolvedPath
  );

  if (
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === ".." ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("La clave de almacenamiento no es válida.");
  }

  return resolvedPath;
}

export function isLocalStorageFallbackAllowed(
  runtimeEnvironment: StorageRuntimeEnvironment = env.NODE_ENV
): boolean {
  return (
    runtimeEnvironment === "development" ||
    runtimeEnvironment === "test"
  );
}

export function assertStorageConfigured(
  bucket: R2BucketBinding | null | undefined = r2Bucket,
  runtimeEnvironment: StorageRuntimeEnvironment = env.NODE_ENV
): void {
  if (!bucket && !isLocalStorageFallbackAllowed(runtimeEnvironment)) {
    throw new Error(
      "R2_STORAGE es obligatorio en staging y producción."
    );
  }
}

export function configureR2Storage(
  bucket: R2BucketBinding | null | undefined
): void {
  r2Bucket = bucket ?? null;
  assertStorageConfigured();
}

export function isObjectStorageConfigured(): boolean {
  return r2Bucket !== null;
}

export function sanitizeExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();

  const allowed = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".pdf"
  ];

  return allowed.includes(ext) ? ext : ".jpg";
}

export function buildSecureStorageKey(
  companyId: string,
  projectId: string,
  originalFileName: string
): string {
  const safeExt = sanitizeExtension(originalFileName);
  const fileUuid = crypto.randomUUID();

  return `projects/${companyId}/${projectId}/${fileUuid}${safeExt}`;
}

export async function uploadStorageFile({
  storagePath,
  buffer,
  mimeType
}: UploadInput): Promise<void> {
  const normalizedKey = normalizeStorageKey(storagePath);

  if (r2Bucket) {
    await r2Bucket.put(
      normalizedKey,
      buffer,
      {
        httpMetadata: {
          contentType: mimeType
        }
      }
    );

    return;
  }

  assertStorageConfigured();

  const fullPath = resolveLocalStoragePath(normalizedKey);

  await fs.mkdir(
    path.dirname(fullPath),
    { recursive: true }
  );

  await fs.writeFile(
    fullPath,
    buffer
  );
}

export async function downloadStorageFile(
  storagePath: string
): Promise<{
  buffer: Buffer;
  mimeType?: string | undefined;
}> {
  const normalizedKey = normalizeStorageKey(storagePath);

  if (r2Bucket) {
    const object = await r2Bucket.get(normalizedKey);

    if (!object) {
      throw new Error(
        "Archivo no encontrado en R2."
      );
    }

    const arrayBuffer =
      await object.arrayBuffer();

    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType:
        object.httpMetadata?.contentType
    };
  }

  assertStorageConfigured();

  const fullPath = resolveLocalStoragePath(normalizedKey);

  const buffer = await fs.readFile(fullPath);

  return { buffer };
}

export async function deleteStorageFile(
  storagePath: string
): Promise<void> {
  const normalizedKey = normalizeStorageKey(storagePath);

  if (r2Bucket) {
    await r2Bucket.delete(normalizedKey);
    return;
  }

  assertStorageConfigured();

  try {
    const fullPath = resolveLocalStoragePath(normalizedKey);

    await fs.unlink(fullPath);
  } catch {
    // El archivo local puede haber sido eliminado previamente.
  }
}

export async function getStorageSignedUrl(
  photoId: string,
  storagePath: string,
  expiresInMinutes: number = 60
): Promise<string> {
  normalizeStorageKey(storagePath);

  return generateSignedPhotoUrl(
    photoId,
    storagePath,
    expiresInMinutes
  );
}
