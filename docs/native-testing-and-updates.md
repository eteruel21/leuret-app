# Compilaciones nativas, pruebas y publicación de LEURET

Guía para compilar **Leuret** para Android e iOS con EAS, probarla en teléfonos reales y publicarla. El workspace usa Expo SDK 57. Consulta [`app.json`](../apps/mobile/app.json), [`app.config.js`](../apps/mobile/app.config.js) y [`eas.json`](../apps/mobile/eas.json). Ejecuta los comandos de EAS desde `apps/mobile`.

`npm run check:native -w apps/mobile` revisa la configuración y exporta los paquetes JavaScript de Android e iOS. CI lo ejecuta en cada PR.

---

## 1. Identidad

| Campo | Valor |
|---|---|
| Nombre | Leuret |
| Paquete Android / Bundle ID iOS | `com.leuret.app` |
| Esquema de enlaces | `leuret://` |
| Proyecto EAS | `@leuret/contractor-pro` (`8eee9ec7-318c-407b-83b6-446d873e7209`) |
| Versión | `version` en app.json (1.0.0). El número de build lo lleva EAS (`appVersionSource: remote`, `autoIncrement` en production) |
| Actualizaciones OTA | EAS Update, `runtimeVersion: appVersion` (una OTA solo llega a builds con la misma `version`) |
| Apariencia | Solo tema claro (`userInterfaceStyle: light`) |
| iPad | No (`supportsTablet: false`): en iPad corre la versión de iPhone |

**Íconos** (`assets/images/`): `icon.png` 1024 px sin transparencia (iOS y general), `android-icon-foreground/background/monochrome.png` (ícono adaptativo y temático de Android 13+), `notification-icon.png` 96 px blanco (barra de estado de Android), `favicon.png` (web). Se generaron a partir de `leuret-logo-header.png`. Si hay un logo vectorial o de 1024 px, conviene regenerarlos con él.

## 2. Perfiles de EAS

| Perfil | Uso | Distribución | Canal / entorno |
|---|---|---|---|
| `development` | Cliente de desarrollo, API local `http://10.0.2.2:3001` (emulador Android) | interna | development |
| `preview` | Pruebas internas, APK / Ad Hoc | interna | preview |
| `pilot` | Piloto en teléfonos reales, API de producción | interna | pilot / preview |
| `production` | Tiendas: AAB para Google Play, IPA para App Store | store | production |

Los perfiles `preview`, `pilot` y `production` usan `https://api.leurettech.com` y el desafío `https://app.leurettech.com/turnstile`. Para compilar contra staging, configura la URL y el widget de ese entorno. Consulta [perfiles de EAS Build](https://docs.expo.dev/build/eas-json/).

## 3. Requisitos antes de la primera compilación con avisos

### Android: Firebase (FCM v1)
Sin esto el teléfono Android no obtiene token y **no recibe avisos push**.
1. En Firebase (console.firebase.google.com), crear o abrir el proyecto y agregar una app Android con paquete `com.leuret.app`. Descargar `google-services.json`.
2. Subirlo a EAS como variable de tipo archivo, en los entornos preview y production:
   ```bash
   cd apps/mobile
   npx --yes eas-cli@27.4.1 env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment preview --environment production --visibility secret
   ```
   (En local basta con dejar el archivo en `apps/mobile/google-services.json`.)
3. En Firebase → Configuración del proyecto → Cuentas de servicio, generar una clave privada (JSON) y subirla en `npx --yes eas-cli@27.4.1 credentials -p android` → *Google Service Account* → *FCM V1*.

`app.config.js` detiene la build de Android de production si falta el archivo, y avisa en preview/pilot.

### iOS: APNs y firma
1. Cuenta de Apple Developer activa. Crear la app en App Store Connect con Bundle ID `com.leuret.app`.
2. `npx --yes eas-cli@27.4.1 credentials -p ios`: dejar que EAS cree el certificado de distribución, el perfil de aprovisionamiento y la **clave de notificaciones push (APNs)**.
3. Para builds internas (Ad Hoc) registrar los iPhone con `npx --yes eas-cli@27.4.1 device:create`.

## 4. Compilar

```bash
cd apps/mobile
npx --yes eas-cli@27.4.1 whoami
npx --yes eas-cli@27.4.1 build -p android --profile pilot
npx --yes eas-cli@27.4.1 build -p ios --profile pilot
npx --yes eas-cli@27.4.1 build -p android --profile production
npx --yes eas-cli@27.4.1 build -p ios --profile production
```

Si necesitas iniciar sesión, usa `npx --yes eas-cli@27.4.1 login --browser`. Para enviar un binario firmado, usa `npx --yes eas-cli@27.4.1 submit -p android --profile production` para la pista interna de Google Play o `npx --yes eas-cli@27.4.1 submit -p ios --profile production` para TestFlight. Selecciona el build que verificaste.

## 5. Pruebas en teléfonos reales

Marcar cada punto en Android **y** iPhone.

**Instalación y sesión**
- [ ] Splash e ícono de Leuret (también el ícono temático de Android 13+).
- [ ] Iniciar sesión (Turnstile se resuelve dentro de la app) y cerrar la app por completo: la sesión sigue abierta.
- [ ] Cerrar sesión: vuelve al acceso y no quedan recordatorios de la agenda programados.

**Avisos**
- [ ] Perfil → activar avisos: el teléfono pide permiso. Después aparece una fila en `user_push_tokens`.
- [ ] Con permiso bloqueado, al activar avisos se ofrece «Abrir ajustes».
- [ ] Aviso con la app cerrada, en segundo plano y abierta (banner).
- [ ] Tocar el aviso abre el documento: presupuesto aprobado, factura emitida, mensaje de petición, invitación, solicitud de vinculación.
- [ ] Usuario con dos empresas (o empresa + espacio de cliente): tocar un aviso de la otra empresa cambia de espacio y abre el documento.
- [ ] Recordatorio de la agenda: llega a la hora y al tocarlo abre la Agenda.
- [ ] Android: el ícono pequeño de la barra de estado es la «L» blanca, no un cuadrado.

**Permisos y archivos**
- [ ] Cámara: primera vez pide permiso; si se bloqueó, ofrece abrir ajustes.
- [ ] Galería: abre el selector del sistema sin pedir permiso de fotos.
- [ ] Fotos en obra, tarea, petición y conversación; foto de perfil; documento del perfil profesional (foto).
- [ ] PDF de presupuesto, factura, recibo y nota de crédito: se abre la hoja de compartir con el PDF.
- [ ] Compartir lista de compras e invitación.

**Navegación y persistencia**
- [ ] Botón atrás de Android y gesto atrás de iOS en todas las secciones.
- [ ] Al volver a la app después de un rato, se recarga la pantalla y no se pierde lo escrito en formularios abiertos.
- [ ] Sin conexión: crear tarea y registrar avance; al volver la conexión se sincroniza sin duplicados.
- [ ] Teclado: en Detalle de obra, Perfil y formularios, el campo activo queda visible.
- [ ] Barra de estado legible en Inicio (fondo claro) y en las pantallas con encabezado azul.

## 6. Actualizaciones OTA

EAS Update publica cambios compatibles de JavaScript y recursos. Confirma el proyecto, la plataforma, el runtime y la rama asociada al canal. Configura `EXPO_PUBLIC_API_URL` y las variables públicas de Turnstile en el entorno EAS correspondiente. El SDK 57 exige indicar el entorno en el comando. El perfil piloto usa el entorno `preview`.

```bash
cd apps/mobile
npx --yes eas-cli@27.4.1 update --channel pilot --platform all \
  --environment preview --message "Validación del piloto"
```

Verifica el ID de la actualización en los dispositivos piloto. Cierra completamente la aplicación y ábrela de nuevo para descargarla. Si sigue ejecutando la anterior, realiza otra apertura en frío. Para una publicación de producción usa el canal y entorno `production` después de verificar el resultado del piloto.

Los cambios de configuración nativa, plugins, permisos, íconos de la app o dependencias nativas requieren una compilación nueva. Con la política `appVersion`, las actualizaciones solo llegan a compilaciones que comparten la versión de runtime.

Consulta [variables de EAS Update](https://docs.expo.dev/eas/environment-variables/usage/) y [versiones de runtime](https://docs.expo.dev/eas-update/runtime-versions/).

## 7. Pendiente / mejoras

- **Enlaces universales** (abrir los correos de invitación, verificación y contraseña directamente en la app): requiere el Team ID de Apple y la huella SHA-256 del certificado de Android para publicar `apple-app-site-association` y `assetlinks.json` en app.leurettech.com, y agregar `ios.associatedDomains` y `android.intentFilters`. Hoy esos enlaces abren la web, que funciona igual.
- Documentos PDF en el perfil profesional desde el teléfono (hoy: foto; PDF desde la web). Requiere agregar `expo-document-picker`.
