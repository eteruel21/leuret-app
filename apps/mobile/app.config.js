// Configuración dinámica de Expo. Parte de app.json y agrega lo que depende
// del entorno de compilación (EAS) sin guardar archivos secretos en el repo.
const fs = require("node:fs");
const path = require("node:path");

const PUSH_PROFILES = new Set(["preview", "pilot", "production"]);

/**
 * google-services.json (Firebase) es obligatorio para que Android reciba
 * notificaciones push (FCM v1). En EAS se carga como variable de entorno de
 * tipo archivo: `eas env:create --name GOOGLE_SERVICES_JSON --type file`.
 * En local basta con dejar el archivo en apps/mobile/google-services.json.
 */
function resolveGoogleServicesFile() {
  const fromEnv = process.env.GOOGLE_SERVICES_JSON?.trim();
  if (fromEnv) return fromEnv;
  const local = path.join(__dirname, "google-services.json");
  return fs.existsSync(local) ? "./google-services.json" : undefined;
}

module.exports = ({ config }) => {
  const googleServicesFile = resolveGoogleServicesFile();
  const buildPlatform = process.env.EAS_BUILD_PLATFORM;
  const buildProfile = process.env.EAS_BUILD_PROFILE;

  if (buildPlatform === "android" && PUSH_PROFILES.has(buildProfile ?? "") && !googleServicesFile) {
    const message =
      "Falta google-services.json: sin Firebase la app Android no recibe notificaciones push. " +
      "Créalo en Firebase (paquete com.leuret.app) y súbelo con " +
      "`eas env:create --name GOOGLE_SERVICES_JSON --type file --environment production`.";
    if (buildProfile === "production") throw new Error(message);
    console.warn(`⚠️  ${message}`);
  }

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
