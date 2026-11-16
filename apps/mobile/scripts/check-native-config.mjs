// Revisa que la configuración nativa (app.json + eas.json) esté lista para
// compilar Android e iOS: identidad, íconos reales, permisos, notificaciones
// y perfiles de EAS. No necesita dependencias: corre en CI y en local.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8")).expo;
const eas = JSON.parse(readFileSync(path.join(root, "eas.json"), "utf8"));
const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

/** Ancho, alto y si tiene canal alfa, leyendo la cabecera IHDR del PNG. */
function pngInfo(relativePath) {
  const file = path.join(root, relativePath);
  if (!existsSync(file)) return null;
  const buffer = readFileSync(file);
  if (buffer.toString("ascii", 1, 4) !== "PNG") return null;
  const colorType = buffer[25];
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    alpha: colorType === 4 || colorType === 6,
  };
}

function checkPng(relativePath, { size, square = true, opaque = false }, label) {
  const info = pngInfo(relativePath);
  check(info, `${label}: no existe o no es PNG (${relativePath}).`);
  if (!info) return;
  if (square) check(info.width === info.height, `${label}: debe ser cuadrado (${info.width}x${info.height}).`);
  if (size) check(info.width >= size, `${label}: mínimo ${size}px (tiene ${info.width}px).`);
  if (opaque) check(!info.alpha, `${label}: no debe tener transparencia (App Store la rechaza).`);
}

// Identidad
check(app.name === "Leuret", "El nombre de la app debe ser «Leuret».");
check(app.ios?.bundleIdentifier === "com.leuret.app", "ios.bundleIdentifier debe ser com.leuret.app.");
check(app.android?.package === "com.leuret.app", "android.package debe ser com.leuret.app.");
check(app.scheme === "leuret", "El esquema de enlaces debe ser «leuret».");
check(typeof app.extra?.eas?.projectId === "string", "Falta extra.eas.projectId (lo necesitan los tokens push).");
check(app.updates?.url?.includes(app.extra?.eas?.projectId ?? "-"), "updates.url debe usar el projectId de EAS.");
check(Boolean(app.runtimeVersion), "Falta runtimeVersion (protege las actualizaciones OTA).");

// Íconos: nada de la plantilla de Expo.
check(!app.ios?.icon, "ios.icon no debe definirse: iOS usa icon.png (el .icon anterior era el de la plantilla de Expo).");
checkPng(app.icon, { size: 1024, opaque: true }, "Ícono de la app");
const adaptive = app.android?.adaptiveIcon ?? {};
checkPng(adaptive.foregroundImage, { size: 432 }, "Ícono adaptativo Android (frente)");
if (adaptive.backgroundImage) checkPng(adaptive.backgroundImage, { size: 432 }, "Ícono adaptativo Android (fondo)");
checkPng(adaptive.monochromeImage, { size: 432 }, "Ícono monocromo Android");
for (const template of ["expo.icon", "react-logo", "expo-logo", "splash-icon"]) {
  check(!JSON.stringify(app).includes(template), `app.json todavía usa un recurso de la plantilla: ${template}.`);
}

// Apariencia: la app solo tiene tema claro.
check(app.userInterfaceStyle === "light", "userInterfaceStyle debe ser «light» (la app no tiene tema oscuro).");

// iOS
check(app.ios?.config?.usesNonExemptEncryption === false, "Declara ios.config.usesNonExemptEncryption = false (cumplimiento de exportación).");

// Plugins
const plugin = (name) => app.plugins?.find((entry) => (Array.isArray(entry) ? entry[0] : entry) === name);
const options = (name) => {
  const entry = plugin(name);
  return Array.isArray(entry) ? entry[1] ?? {} : {};
};
check(plugin("expo-notifications"), "Falta el plugin expo-notifications.");
const notifications = options("expo-notifications");
check(notifications.defaultChannel === "default", "expo-notifications.defaultChannel debe ser «default» (el canal que usa la API).");
if (notifications.icon) {
  const icon = pngInfo(notifications.icon);
  check(icon && icon.alpha && icon.width === 96, "El ícono de notificación debe ser PNG 96x96 blanco con transparencia.");
} else {
  check(false, "Falta el ícono de notificación de Android (expo-notifications.icon).");
}
const picker = options("expo-image-picker");
check(typeof picker.cameraPermission === "string", "Falta el texto del permiso de cámara (iOS).");
check(typeof picker.photosPermission === "string", "Falta el texto del permiso de fotos (iOS).");
check(picker.microphonePermission === false, "La app no graba audio: microphonePermission debe ser false.");

// Permisos de Android que la app no usa.
const blocked = new Set(app.android?.blockedPermissions ?? []);
for (const permission of ["RECORD_AUDIO", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE", "READ_MEDIA_IMAGES", "READ_MEDIA_VIDEO"]) {
  check(blocked.has(`android.permission.${permission}`), `Bloquea android.permission.${permission} (Play exige justificarlo y la app no lo usa).`);
}

// Perfiles de EAS
check(!existsSync(path.join(root, "..", "..", "eas.json")), "Solo debe existir apps/mobile/eas.json (el de la raíz no se usa y confunde).");
check(eas.cli?.appVersionSource === "remote", "eas.json debe usar appVersionSource «remote».");
for (const profile of ["development", "preview", "pilot", "production"]) {
  const build = eas.build?.[profile];
  check(build, `Falta el perfil de EAS «${profile}».`);
  if (!build) continue;
  check(Boolean(build.channel), `El perfil «${profile}» necesita channel (EAS Update).`);
  check(Boolean(build.environment), `El perfil «${profile}» necesita environment (variables de EAS).`);
  if (profile !== "development") {
    check(build.env?.EXPO_PUBLIC_API_URL?.startsWith("https://"), `El perfil «${profile}» debe usar la API por HTTPS.`);
    check(Boolean(build.env?.EXPO_PUBLIC_TURNSTILE_SITE_KEY), `El perfil «${profile}» necesita EXPO_PUBLIC_TURNSTILE_SITE_KEY.`);
  }
}
check(eas.build?.production?.autoIncrement === true, "production debe tener autoIncrement (cada envío a las tiendas necesita un número de build nuevo).");
check(eas.build?.production?.android?.buildType === "app-bundle", "production debe generar un AAB para Google Play.");

if (errors.length > 0) {
  console.error("Configuración nativa con problemas:\n" + errors.map((error) => `  • ${error}`).join("\n"));
  process.exit(1);
}

console.log("Configuración nativa lista para Android e iOS.");
