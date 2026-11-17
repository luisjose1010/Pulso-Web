# Pulso en Cloudflare

## Pruebas funcionales sobre la web publicada · 2026-11-14

Por instrucción del propietario, las siguientes pruebas funcionales y visuales se realizan en la página publicada de Cloudflare y registran dominio y entrada de release exactos. Las unidades y fixtures locales sirven de apoyo; no sustituyen ese recorrido ni se declaran como prueba de la web pública. La sesión, música y organización del propietario se conservan; las mutaciones de prueba usan datos propios identificables y el alcance autorizado.

El propietario autorizó el cambio de toda la cuenta de `publiex` a `pruebassoftware`, incluidos los otros Workers con workers.dev habilitado. El renombrado ya está aplicado mediante el MCP oficial; no se borró ni recreó el subdominio, ni se modificaron código, bindings o flags de los Workers. La comprobación HTTPS posterior se registra por separado en [la evidencia del cambio](evidence-cloudflare-domain-web.json). El nuevo origen requiere iniciar sesión allí y no migra automáticamente IndexedDB/OPFS del anterior.

## Acceso Telegram por QR · versión actual

La entrada directa actual es [9006dcecc26d4049](https://pulso-web.pruebassoftware.workers.dev/releases/9006dcecc26d4049.html), con las [correcciones probadas en la sesión real](evidence-published-session-repair-web.json). Conserva **Configuración → Cuenta y fuentes → Entrar con Telegram o QR**. Escanea y aprueba desde Telegram del teléfono, en Ajustes → Dispositivos → Vincular dispositivo; después pulsa **Ya autoricé el acceso** en Pulso. La contraseña de dos pasos, si corresponde, se introduce sólo en Pulso. Véanse [persistencia](TELEGRAM-PERSISTENCE.md) y [evidencia original del QR](evidence-telegram-qr-login-web.json).

Se verificaron 45 rutas públicas por bytes/SHA, los bindings conservados y la generación de un QR real, sin aprobar una cuenta. No se modificó el secret ni se añadió una migración, pago o recurso. La recepción de códigos y el límite429 del catálogo siguen pendientes.

El staging puede conservar candidatos intermedios que nunca se publicaron. El manifiesto de despliegue de esta actualización selecciona el dist actual más los inmutables de publicaciones confirmadas: 47 archivos, incluidos dos metadatos no servidos. Excluye tres rutas intermedias, comprobadas404. Un futuro despliegue debe conservar los inmutables publicados y excluir esos candidatos sin publicar; no basta con subir todo el staging acumulado.

Pulso está publicado en **https://pulso-web.pruebassoftware.workers.dev** con acceso público autorizado por el propietario. La cuenta se conectó al MCP oficial mediante OAuth. El propietario confirmó **Workers Free**; la facturación no se pudo consultar mediante esos permisos OAuth. No se activaron planes de pago ni dominios comprados. `workers_dev: true` y `preview_urls: false` son la configuración vigente.

## Arquitectura

Actualización2026-11-15: las consultas de metadatos iTunes se hacen directamente desde el navegador, donde se verificó HTTP200 y CORS legible. El egress de Cloudflare estaba devolviendo429; no se añade un reintento automático tras ese error. `/catalog-config.json` anuncia `itunes:false,artwork:true`. El transporte comparte una cola y cadencia mínima3,1s entre metadatos directos, cancelación y cooldown429/503; el relay acotado sigue sirviendo las imágenes. Los endpoints anteriores de metadatos permanecen para compatibilidad, pero ya no son la vía anunciada al frontend.

Las respuestas del shell guardadas después de una redirección se reconstruyen al servirlas desde caché, conservando cuerpo, estado y cabeceras. Esto evita el fallo de navegación observado al activar una versión nueva de Cloudflare. El worker se comprueba con `updateViaCache:none`; se mantiene la activación por cierre normal de clientes, sin `skipWaiting`, unregister, borrar cachés o eliminar IndexedDB. Se verificó reapertura con sesión, bots, música y playlist conservados.

- Worker con Static Assets sirve el frontend, service worker y fuentes/licencias de Telegram. Los assets ordinarios se sirven directamente; HTML, SDK worker, SW y endpoints pasan por el Worker para conservar sus políticas.
- `/catalog-config.json`, `/catalog/itunes/search`, `/catalog/itunes/lookup` y `/catalog/artwork` conservan el contrato del prototipo. Sólo GET públicos de metadatos iTunes US y PNG/JPEG/WebP de cinco hosts Apple admitidos; sin JSONP, hosts arbitrarios, redirecciones, audio ni credenciales reenviadas.
- Un Durable Object SQLite coordina todas las consultas al proveedor: mínimo 3,1 segundos entre metadatos, cooldown compartido, 8 cargas originales como máximo, plazo de 10 segundos y caché RAM hasta 32 MiB/5 minutos. Sólo persisten dos timestamps de cuota; ni consultas ni resultados se escriben en su base. Las respuestas están limitadas a 1 MiB de JSON y 2 MiB por imagen.
- Música, organización local y sesión Telegram permanecen en el navegador. No se conecta Neon, Firebase, R2 ni una base de usuarios por esta entrega.
- `/telegram-config.json` lee `TELEGRAM_API_IDENTITY` desde un secret de Worker y devuelve únicamente la identidad de aplicación que necesita el SDK del navegador. Esos valores son legibles por los visitantes autorizados de la web; el secret evita meterlos en Git, artefactos o variables de build, pero no convierte una identidad de aplicación cliente en un secreto inaccesible al navegador. No contiene sesiones, auth keys, códigos ni contraseñas Telegram.

## Preparación local

```sh
npm ci
npm run test:cloudflare
npm run build:cloudflare
npx wrangler deploy --dry-run --outdir .local/cloudflare-setup/dry-run
npx wrangler dev --local --ip 127.0.0.1
```

El build de Cloudflare se realiza en `.local/cloudflare-setup/build-root`; la salida revisable está en `.local/cloudflare-setup/site` y su manifiesto en `site-manifest.json`. No sustituye `dist` de la entrega anterior ni copia el archivo privado de identidad Telegram. Wrangler y su estado local son herramientas de desarrollo, sin inclusión en el bundle de la app.

## Publicación y futuras actualizaciones

La vía solicitada por el propietario es el MCP oficial de Cloudflare: `https://mcp.cloudflare.com/mcp`, configurado en `.codex/config.toml` sin credenciales. OAuth queda en el almacén privado del cliente; no en el repositorio. Conectar un cliente nuevo requiere autorizar esa cuenta mediante su flujo OAuth. El MCP no pudo consultar Billing; no se debe inferir el plan a partir de `default_usage_model`.

El despliegue del 2026-11-13 creó únicamente `pulso-web`, después de comprobar que el nombre estaba libre. Los Workers anteriores no se sustituyeron. El MCP creó la sesión de assets, cargó el Worker y la migración SQLite, vinculó el secret de identidad de aplicación y habilitó la URL pública con previews desactivadas. La subida de los bytes usó el endpoint oficial Direct Upload con el JWT temporal emitido por esa sesión MCP: el proxy del MCP añade su propia cabecera Authorization y no permite usar correctamente ese JWT dentro de `execute`. No se utilizó Wrangler para desplegar remotamente ni se pidió un API token adicional. El token de carga y la identidad de aplicación se mantuvieron fuera de los logs y recibos.

Para actualizar:

1. Mantener Workers Free, sin activar recursos de pago. Preparar el candidato con `npm run build:cloudflare` y validar el manifiesto y las pruebas antes de mutar recursos remotos.
2. Leer el Worker y la versión actuales mediante MCP. En una actualización, comprobar que son los de Pulso; no volver a aplicar una migración inicial ni sobrescribir otros servicios.
3. Registrar el manifiesto completo en `assets-upload-session` mediante MCP; transferir sólo los hashes solicitados con su JWT temporal. Adjuntar el completion token al upload de Worker y conservar los bindings/migraciones existentes conforme al incremento. No poner credenciales o sesiones de usuarios dentro de assets o código.
4. Mantener previews desactivadas. Verificar de nuevo sin Authorization la URL pública, HTML y hashes de assets, CSP de documento/SDK, WASM, SW, capacidades, configuración no-store, catálogo y portadas.

`npm run deploy:cloudflare` es una alternativa manual de Wrangler y **no fue el mecanismo de esta publicación**. Un cambio local o un push a Git no actualizan automáticamente la web; no se configuró CI/CD.

La evidencia de la entrega está en [evidence-cloudflare-public.json](evidence-cloudflare-public.json). Los recibos de autenticación, despliegue y comprobaciones completas permanecen en `.local/cloudflare-mcp/` y `.local/cloudflare-publish/`, fuera de Git.

El cambio de origen no migra IndexedDB, OPFS, permisos ni la sesión Telegram del enlace anterior. Los datos del origen viejo permanecen allí y no deben borrarse. Una prueba de Cloudflare no debe presentarse como migración de música o aceptación física de iPhone.

## Fuentes oficiales consultadas

- [MCP oficial y OAuth](https://github.com/cloudflare/mcp).
- [Direct Upload de Static Assets](https://developers.cloudflare.com/workers/static-assets/direct-upload/).
- [Static Assets y binding](https://developers.cloudflare.com/workers/static-assets/binding/).
- [Límites y facturación de Static Assets](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).
- [Durable Objects Free/SQLite](https://developers.cloudflare.com/durable-objects/platform/pricing/).
- [Secrets de Workers](https://developers.cloudflare.com/workers/configuration/secrets/).
- [Access para workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

Las comprobaciones HTTPS acreditan esta entrega concreta. No acreditan una sesión Telegram real en el origen nuevo, descargas musicales reales, iPhone físico ni la aceptación global P0-W. El primer control remoto del catálogo devolvió 403; el negativo se conservó y las comprobaciones posteriores se registran por separado, sin atribuir una causa no demostrada.

## Límite observado al cerrar la entrega

La búsqueda pública completa de MOSCA desde la UI quedó **bloqueada por HTTP429 de iTunes** en dos intentos. El segundo devolvió Retry-After46/44 segundos. No se continuó reintentando ni se declara aceptado ese recorrido. El lookup exacto de la edición sí devolvió17pistas y su portada HTTP200; esa comprobación no sustituye la búsqueda completa. La publicación y la navegación están verificadas, pero esta restricción del catálogo sigue abierta.

## Actualización de acceso Telegram · 2026-11-13

El reenvío manual autorizado por Telegram está publicado; véase [la evidencia del incremento](evidence-telegram-code-resend-web.json). El build conserva por bytes/SHA los assets con hash y las entradas versionadas de la publicación anterior para no romper pestañas abiertas. La actualización mantuvo los bindings existentes, sin migración SQLite nueva ni reemplazo del secret. Confirmar una recepción real de código sigue pendiente del propietario; el límite429 del catálogo no se presenta como resuelto por este cambio.


## Validación autenticada publicada · 2026-11-15

La sesión real del propietario se conservó en el perfil persistente compartido, incluso tras recarga y activación normal del service worker. KDMusic_Bot principal y DeezerMusicBot secundario quedan guardados. Metadatos iTunes directos desde el navegador con cadencia/cooldown compartidos; las imágenes continúan por el relay acotado. La prueba anterior del relay429 permanece como evidencia histórica. El shell reconstruye respuestas cacheadas con redirección para permitir reabrir entradas versionadas. No se borran cachés, sesiones ni datos para actualizar.

Entrada final9c78c674d7ab20a8;60/60rutas públicas exactas por bytes/SHA,62entradas del manifiesto incluidos2metadatos no servidos. Se retienen los inmutables publicados previos y se excluyen3intermedios nunca publicados. Cloudflare MCP conserva ASSETS/CATALOG/secret, sin migración ni recursos de pago. Evidencia actual en evidence-published-session-repair-web.json; los recibos y negativos completos permanecen privados en .local/published-session-tests.

El lote MOSCA inicial terminó13/17, con4conflictos; una selección explícita posterior de la fila cuyo snapshot confirmó no-dispatched consiguió audio y elevó a14las pistas añadidas. Tres siguen sin confirmar. La continuación automática a otro proveedor sólo admite conflict+not-dispatched tras liquidación y guardas exactas; acknowledged/uncertain detienen. No equivale a demostrar los17audios ni recepción universal de códigos.


## Safari: catálogo y carátulas · 2026-11-15

La versión9006dcecc26d4049 corrige la búsqueda directa de iTunes en Safari sin seguir redirecciones: se omite media=music cuando entity ya identifica álbum, canción o artista. WebKit desviaba las consultas anteriores al esquema nativo musics://; no era una pérdida de la sesión de Telegram. La aceptación publicada sin sustituciones pasa4/4grupos en WebKit de Linux, con portadas,17pistas deMOSCA y62publicaciones deNsqk.62/62rutas públicas verificadas; perfilpersistente real conectado y pausado tras reapertura. iPhone físico sigue pendiente. [Evidencia](evidence-safari-catalog-web.json) y [alternativas](CATALOG-ALTERNATIVES.md).


## Actualización automática y MB · 2026-11-15

La entrada `d586ee3e549273ac` publicó la actualización segura. El 2026-11-15 se publicó `d87da0091a3ec082` para mantener la tarjeta abierta «Actualización de la app» al inicio de Configuración, con estado comprobado y «Recargar app», visible antes y después del inicio de sesión. El incremento cambia sólo UI/CSS; el Worker es idéntico. La comprobación HTTPS confirmó 75 rutas públicas con bytes y SHA-256 exactos, el entry actual y los bindings ASSETS/CATALOG/TELEGRAM_API_IDENTITY; previews permanecen desactivadas. La acción manual pausa música y espera que terminen las operaciones.

Los tamaños de descargas, caché, cuotas, archivos locales, progreso y espacio liberado se muestran en MB decimales. No cambian los límites internos ni los datos guardados. Verificación combinada708/708unidades y36/36grupos Chromium/WebKit; comprobación publicada de actualización mientras sonaba música, recarga tras pausa/manual y conservación de Telegram.72/72archivos de origen coinciden en contexto nuevo. [Evidencia](evidence-automatic-update-web.json). iPhone físico pendiente.


## Recargar pestañas antiguas · 2026-11-15

La reparación publicada en deployment9a3c36e13ae64f5b8f2b7a3d2aaa8c07 evita que un service worker viejo mantenga indefinidamente el HTML anterior al recargar. La instalación del worker nuevo añade un puente a los documentos públicos cacheados; en la próxima navegación abre la versión actual, con fallback de la app anterior sin conexión. No borra música ni sesiones, ni activa el worker a la fuerza sobre una reproducción. Las navegaciones futuras prefieren red con fallback offline. Abrir una URL de versión vieja en el navegador también sirve la app actual; el fetch de metadatos conserva sus bytes originales.

El navegador debe recibir primero el SW reparado: las páginas con código anterior no se pueden actualizar retroactivamente en memoria. Su primer refresco puede instalar la reparación antes de que la siguiente carga use el puente. La prueba pública se hizo con la misma pestaña antigua de raíz, sin enlace especial: tras instalar el SW y recargar apareció el botón, mientras otra pestaña conservó audio y Telegram. [Evidencia](evidence-legacy-update-web.json).


El incremento de álbumes añade `musicbrainz:true` a catalog-config cuando existe CATALOG. Las rutas cerradas `/catalog/musicbrainz/{search,artists,artist-albums,release,artwork}` usan el mismo Durable Object, con estado de cuota propio y sin migración ni binding nuevo. Sólo se persisten marcas de tiempo/cooldown; respuestas públicas se cachean en RAM con límites. User-Agent identifica Pulso y su contacto. No se reenvían cookies, autorización ni headers del visitante. El respaldo se usa sólo si iTunes falla o queda vacío; no cambia TELEGRAM_API_IDENTITY ni la sesión del navegador. La prueba publicada del incremento queda separada de los fixtures en evidence-album-backup-web.json.


## Apertura desde pantalla de inicio · 2026-11-16

El candidato corrige el rechazo `shell-network` al reabrir una entrada antigua: el service worker solicita la raíz del mismo origen y dispone de un fallback al documento canónico del shell actual. Si faltan red y cache, presenta un reintento legible en vez del error de Safari. Cloudflare también reconoce navegación HTML sin los encabezados Fetch Metadata de navegadores recientes. Los fetch ordinarios de versiones conservan sus bytes históricos.

La instalación espera el cierre normal de los clientes; no interrumpe música ni elimina sesiones o descargas. La prueba conjunta local de reapertura pasó16/16 en Chromium/WebKit con audio propio y sesión sintética; iPhone instalado sigue pendiente. La UI/entry no cambia en esta entrega, pero sí el Worker y sw.js. Estado de publicación y límites en [la evidencia](evidence-standalone-shell-web.json).

### Publicación: reapertura desde Inicio · 2026-11-16

El Worker del release `/releases/459fa7098cf7442f.html` ahora incluye la detección de navegación HTML sin Fetch Metadata para el shell anterior. Publicación por MCP oficial, Workers Free/USD 0: deployment `ca7380a75366452cb2d04d2ec036e9cb`. Worker SHA-256 `76d57a098e23b1a03d6573d972a9e8d99ed6296adda83f07c1f04584474815fe`; conserva `ASSETS`, `CATALOG` y `TELEGRAM_API_IDENTITY`, subdominio `pruebassoftware` habilitado y previews desactivadas. Readback confirmado. 79/79 rutas del manifest, `/`, `/latest.json` y `/sw.js` responden 200 con bytes/SHA esperados; raíz y manifiesto no-cache/no-store según recurso, SW permite scope `/`. La aceptación de navegación pública no se ejecutó: preview browser reportó `available=false`; GET HTTP común sólo verifica artefactos. iPhone instalado pendiente. Evidencia: `docs/evidence-standalone-shell-web.json`; recibos completos en `.local/standalone-shell-repair/release/`.


## Instalación Chrome Android · 2026-11-16

El candidato2c93d02f856193ad añade manifiesto estable en `/manifest.webmanifest`, inicio/identidad raíz y tres iconos PNG locales. Configuración ofrece instalar sólo con la capacidad nativa del navegador y dispone de instrucciones manuales cuando no la hay. El Worker/secret/bindings no cambian; los recursos de instalación se incluyen en el shell.

Chromium de escritorio con perfil aislado acepta el manifiesto y emite el evento real; no equivale a una instalación WebAPK en Android físico. Publicación y límites: [evidencia](evidence-android-install-web.json), [instalación](INSTALLATION.md).

### Publicación: instalación Chrome Android · 2026-11-16

Publicado por MCP oficial en Workers Free (USD 0): deployment `4c9ed0261c81431796048d6c1bee0f34`, origen `https://pulso-web.pruebassoftware.workers.dev`, entry `/releases/2c93d02f856193ad.html`. El Worker es idéntico al anterior (SHA-256 `76d57a098e23b1a03d6573d972a9e8d99ed6296adda83f07c1f04584474815fe`); `ASSETS`, `CATALOG` y `TELEGRAM_API_IDENTITY` siguen presentes, `pruebassoftware` habilitado y previews desactivadas. Readback confirma el deployment exacto. 86 rutas públicas y `/`, `/latest.json`, `/sw.js` pasan bytes/SHA; manifest e iconos responden HTTP 200 con MIME correcto. La navegación de página en browser preview queda pendiente porque `preview_status` devolvió `available=false`; la verificación HTTP no se presenta como aceptación de UI. Tampoco se instaló ni abrió WebAPK en Android físico. [Evidencia](evidence-android-install-web.json); recibos privados en `.local/android-install-repair/release/`.


## Continuidad del lote de álbum entre secciones · 2026-11-16

Publicado mediante el MCP oficial en Workers Free (USD 0), deployment `d710fb1fc4484f52b2caa599c6aefc3e`, entrada `/releases/b5ae0e6ae5450b43.html`. Readback confirma el Worker esperado (SHA-256 `76d57a098e23b1a03d6573d972a9e8d99ed6296adda83f07c1f04584474815fe`), bindings `ASSETS`, `CATALOG` y `TELEGRAM_API_IDENTITY` conservados, subdominio `pruebassoftware`, Worker habilitado y previews desactivadas. Las 89 rutas públicas coinciden por bytes/SHA; raíz, `latest.json` y `sw.js` responden HTTP 200 con headers esperados. Recibos privados: `.local/album-background-repair/release/`.

La navegación funcional en navegador público no se ejecutó porque la vista previa no está disponible. Los GET de assets no acreditan interacción de la app. El comportamiento de continuidad está validado localmente con la selección musical nativa descrita en [la evidencia](evidence-album-background-web.json); no se accedió a cuenta, bot, chats ni audio reales. No hay aceptación en iPhone/Android físicos. No se implementa cola durable al cerrar/recargar el documento ni garantía de background del sistema operativo; P0 global sigue pendiente.
# Actualización · 2026-11-16 · identidad de canción y almacenamiento

La entrega candidata añade resolución conservadora de copias, indicador desde el TrackId activo y resumen local de almacenamiento. Las pruebas sintéticas de IDB/OPFS, interfaz y SDK se documentan en [la evidencia](evidence-storage-identity-web.json). La publicación conservará el Worker y los bindings existentes; las copias musicales y la sesión Telegram siguen en el navegador y no se migran entre orígenes.

El candidato también contiene UI y rutas de cuenta opcionales, pero el archivo público anuncia `enabled:false, google:false`; no hay backend Neon/Google conectado ni variables de Auth configuradas. No se habilitan ni se anuncian cuentas con esta publicación. Véase [Cuentas de Pulso](ACCOUNTS.md). La validación local de formularios con API sintética no prueba correo, Google, cookies de producción, cuenta real o iPhone.

La navegación de la web publicada requiere disponibilidad del preview y se registra por separado de GET/HEAD, hashes y headers. CSP mantiene el baseline medido: 90 eventos CSP shell/Playwright y seis advertencias `style-src-attr` en WebKit; no presentar esos eventos como CSP global de todas las páginas o navegadores.

La entrega quedó publicada por el MCP oficial en `fdc5a3fe3a3e4523b0d370d43c5d4ec0`, entrada `/releases/4cd47cf811d15d61.html`. Readback verificó los bytes/SHA del Worker, `ASSETS`, `CATALOG`, `TELEGRAM_API_IDENTITY`, `pruebassoftware` habilitado y previews desactivadas; no leyó el valor del secret. Se comprobaron 100 rutas estáticas por status/bytes/SHA y las rutas raíz/latest/release/SW por GET y HEAD. `/account-config.json` es una ruta dinámica y responde 200/no-store con ambas opciones desactivadas; `get-session` responde 503 `DISABLED`. Evidencia versionada: [evidence-storage-identity-web.json](evidence-storage-identity-web.json); recibos privados: `.local/storage-identity-release/`.

### 2026-11-16 · Singles

Publicado mediante el MCP oficial en Workers Free/USD 0, deployment `404c11d4-8690-483b-adc7-a968eee11692`, versión `7f655b46-56e1-4229-b4f4-15b3cc6a0121`, entrada `/releases/119a18edb9d34b79.html`. El Worker coincide por SHA-256 con el bundle y conserva `ASSETS`, `CATALOG` y `TELEGRAM_API_IDENTITY`; workers.dev sigue habilitado y previews desactivadas. Las 133 rutas estáticas pasan GET por bytes/SHA; raíz, latest, release y SW pasan GET/HEAD. `/account-config.json` responde 200/no-store con `enabled:false` y `google:false`. La preview de navegador no estuvo disponible: se verificó HTTP, no navegación de UI. Evidencia versionada: [evidence-singles-cloudflare-release.json](evidence-singles-cloudflare-release.json); recibos privados: `.local/singles-release/`. No se activaron cuentas ni se accedió a sesiones o datos reales de Telegram; iPhone y P0-W siguen pendientes.

### 2026-11-17 · Continuidad de adquisición de canción

Publicado mediante el MCP oficial en Workers Free/USD 0, deployment `48d6ae7f980a4b73b0fd1a52876b80a7`, entrada `/releases/c27ab00feec84ab9.html`. El Worker readback coincide exactamente con el bundle (SHA-256 `935fd0440f7a6ef49760c0ae669ed00bb1c790d24c28f4afdfb3914ac5244f15`); `ASSETS`, `CATALOG`, `TELEGRAM_API_IDENTITY` siguen presentes, workers.dev activo y previews desactivadas. 136/136 rutas estáticas pasan GET bytes/SHA; raíz/latest/entry/SW pasan GET/HEAD. `/account-config.json` dinámico responde 200/no-store con `enabled:false, google:false`. `preview_status` devolvió `available=false`: verificación HTTP, sin aceptación UI. Evidencia: [evidence-song-navigation-continuity-web.json](evidence-song-navigation-continuity-web.json); recibos privados `.local/song-navigation-continuity/release/`. No Telegram/audio/cuentas reales ni aceptación iPhone/background; P0-W sigue pendiente.


## Configuración móvil y bienvenida · 2026-11-17

La primera publicación por el MCP oficial fue Workers Free/USD 0, deployment `68471f87-a679-40ba-a019-30e6a476d2ea`, versión `044a1d74-10f8-43ba-931f-d18394ab86b1`, entrada `/releases/4c0e44b8a98cb228.html`. Readback encontró dos entradas HTML históricas que devolvían404 porque faltaban del manifiesto del primer candidato. Se reconstruyeron ambas rutas desde las combinaciones previas de assets y se validó el SHA-256 completo antes de agregarlas.

La reparación quedó activa en deployment `a93dd904-6bf4-47fb-aafd-f263da2fac1c`, versión `0c60e2b8-3fb5-45fd-b62a-76bc35670ab6`; la entrada actual siguió en `/releases/4c0e44b8a98cb228.html`. El manifiesto final tiene 173 archivos y 39,971,229 bytes; después de excluir `.assetsignore` y `_headers`, quedan 171 rutas públicas. Se mantienen los 168 recursos que ya pasaban bytes/SHA y el readback final siguió el redirect de ambas entradas restauradas hasta HTTP200: 1570 bytes y SHA exactos para `4f6976956f305019` y `be63dffc6815eb76`. `/latest.json` conserva la entrada `4c0e44b8a98cb228`; root, entry y service worker se habían comprobado con bytes/SHA. `/account-config.json` responde200/no-store con `enabled:true, google:true`.

El Worker se comprobó mediante lectura MCP: 318422 bytes, SHA-256 `e73c6acf441d48a39dc92ed76153d49281a39f404e2cebf1cf0fac5e8121ca6f`, activo al100%. Conserva los siete bindings, Workers.dev `pruebassoftware` activo y previews apagadas. Se mantuvo la cuota gratuita; no se leyeron valores de secretos ni se aplicó migración. Se conservaron 110 rutas inmutables JS/CSS/WASM confirmadas; los ocho hashes nuevos del primer upload se transfirieron en tres buckets. Cloudflare no pidió nuevos blobs en la reparación, que volvió a publicar el Worker con las dos rutas restauradas.

La validación local combinada pasó 788/788 unitarias, lint, 14/14 perfiles simulados de bienvenida y 8/8 casos IDB/OPFS de eliminación de colecciones. No se ejecutó aceptación de navegador público, permisos reales, Telegram ni iPhone/Android físicos. Evidencia versionada: [MOBILE-SETTINGS-RELEASE.md](MOBILE-SETTINGS-RELEASE.md); recibos y readback por ruta en `.local/test-evidence/settings-publication-20261117/`.
