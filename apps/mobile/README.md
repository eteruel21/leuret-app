# Leuret — app móvil y web (Expo)

App de Leuret para Android, iOS y web (app.leurettech.com), con Expo Router.

```bash
npm ci                       # en la raíz del repositorio
cd apps/mobile
npx expo start               # desarrollo (requiere un development build para avisos push)
npm test                     # pruebas
npm run typecheck
npm run check:native         # configuración nativa + paquetes Android/iOS
npm run build:web            # exportación web para Cloudflare Pages
```

Compilaciones con EAS, credenciales (Firebase / APNs), pruebas en teléfonos y actualizaciones OTA: [docs/native-testing-and-updates.md](../../docs/native-testing-and-updates.md).

Variables públicas: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_TURNSTILE_SITE_KEY`, `EXPO_PUBLIC_TURNSTILE_CHALLENGE_URL` (definidas por perfil en `eas.json`).
