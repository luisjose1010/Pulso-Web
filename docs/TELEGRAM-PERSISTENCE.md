# Sesión de Telegram conservada en el navegador

## Acceso por QR desde una computadora · 2026-11-13

Si Telegram no entrega el código y tampoco ofrece SMS o llamada, abre **Configuración → Cuenta y fuentes → Entrar con Telegram o QR**. En Telegram del teléfono ve a **Ajustes → Dispositivos → Vincular dispositivo**, escanea el QR y aprueba el acceso. Vuelve a Pulso y pulsa **Ya autoricé el acceso**. Si la cuenta tiene contraseña de dos pasos, escríbela únicamente en Pulso. Si el QR caduca, el botón permite comprobar la autorización o generar otro.

La [autorización oficial por QR](https://core.telegram.org/api/qr-login) usa un ticket temporal de `auth.exportLoginToken`; no requiere enviar un número o recibir un código. Pulso genera la imagen localmente y no guarda ni registra el ticket. La comprobación es explícita, sin polling ni reenvíos automáticos. Sólo se conserva la sesión después de que Telegram confirme la autorización y se verifique la cuenta; una migración de servidor usa `auth.importLoginToken`. Detener la conexión elimina el QR de la vista. El SDK mantiene su política de actualizaciones desactivadas, por lo que escanear requiere después pulsar el botón de comprobación en Pulso.

La [evidencia del QR](evidence-telegram-qr-login-web.json) separa las pruebas sintéticas de la generación real en Cloudflare. Se verificó un QR real y se detuvo la conexión sin escanearlo ni autorizar una cuenta. La recepción del código sigue sin resolverse; no se atribuye su causa a Cloudflare ni se afirma que un SMS haya llegado.

Pulso conserva la autorización de Telegram para recuperar la conexión después de recargar o volver a abrir el mismo sitio en el mismo perfil de navegador. La autorización de Telegram está asociada a la clave del cliente, según su [documentación de autenticación](https://core.telegram.org/api/auth). No se conserva el código de acceso ni la contraseña de dos pasos.

## Almacenamiento y restauración

El SDK sigue usando `MemoryStorage` para sus caches y referencias. Su autorización serializada mediante `exportSession()` se escribe en IndexedDB dedicado: `pulso-web-telegram-session-v1`. Es un secreto que permite acceder a la cuenta; no se publica, no viaja por el protocolo de la interfaz ni se incluye en diagnósticos, Git, Engram, fuentes de distribución o archivos de música. Desde el incremento de orden persistente también se conserva allí la selección privada y acotada de bots descrita abajo. El SDK instalado documenta `importSession` y `exportSession`; la guía de [mtcute para navegador](https://mtcute.dev/guide/) también contempla almacenamiento persistente.

La página consulta únicamente si existe el registro, sin leer su valor ni crear la base cuando está ausente. Si existe y esta pestaña obtiene autoridad, el worker importa la autorización y verifica al usuario con `getMe`. Cada conexión recibe un binding nuevo: no se reutilizan capacidades de búsquedas, mensajes o callbacks anteriores. No se envían consultas musicales ni códigos automáticamente al restaurar. El pool se reconstruye con referencias nuevas a partir de la selección guardada; los resultados de búsqueda permanecen efímeros.

## Bots y orden conservados

Se guardan hasta cinco perfiles ya confirmados, en el orden elegido, junto a sus identificadores de identidad y acceso privados. Este registro no contiene chats, mensajes, callbacks, resultados ni audio; nunca se envía al hilo principal ni a un servidor. Comparte la generación exacta de la autorización: login nuevo, olvido o cierre de sesión eliminan también la selección. Las cuentas nuevas empiezan sin bots seleccionados.

Restaurar el pool no consulta perfiles ni envía mensajes. Antes de usar un bot, el adaptador vuelve a resolver su identidad y la compara con la aprobada. No se reutilizan los `providerRef` ni las capturas anteriores. El orden sólo se confirma tras el commit del almacenamiento. Una revisión durable y la comparación de la selección anterior impiden que otro worker sobrescriba un cambio más nuevo, incluso si el orden volvió a ser el mismo. Un conflicto o fallo de escritura cierra esas capacidades; no se anuncia una confirmación que no ocurrió. Las escrituras pendientes forman parte del asentamiento del cliente.

Las transacciones y esperas del bloqueo del vault tienen un plazo de quince segundos. Un commit ya completado prevalece sobre una cancelación tardía. Esto no garantiza que el sistema operativo conserve los datos del sitio indefinidamente, ni sincroniza proveedores entre dispositivos.

Mientras se comprueba el almacenamiento, Pulso muestra «Comprobando tu sesión guardada». Si la autorización sigue guardada, se ofrece su recuperación y no se presenta un nuevo formulario de teléfono o QR. Un error de lectura tampoco permite reemplazarla con otro login: primero hay que recuperar el acceso al almacenamiento o eliminarla explícitamente. El formulario sólo aparece al confirmar que no hay autorización guardada.

La recuperación automática se intenta una sola vez por cliente. Un fallo de red conserva la autorización y muestra **Reconectar Telegram** para un nuevo intento explícito. Una revocación conocida elimina únicamente la autorización propia, sin borrar una sesión posterior. El teléfono, otro navegador y el navegador compartido de pruebas conservan autorizaciones independientes. Cambiar de dominio o perfil requiere conectarse allí; borrar datos del sitio, el navegador o una revocación de Telegram puede obligar a iniciar sesión otra vez.

## Cierre y olvido

- **Detener conexión local** destruye el cliente de esta pestaña y conserva la autorización guardada. No se reconecta inmediatamente por un efecto de interfaz.
- **Cerrar sesión en Telegram** elimina la autorización guardada propia antes de esperar el cierre remoto. Si la revocación remota no se confirma, el aviso lo indica. La biblioteca y los audios se conservan.
- **Eliminar sesión guardada** funciona desde el estado desconectado o con error, sin cargar SDK/WASM/configuración API ni contactar con Telegram. Repara también un registro local ilegible; no revoca por sí solo una autorización remota.

Las escrituras usan transacciones nativas y una generación. Un login nuevo invalida las escrituras del anterior; olvidar cambia la generación y borra el secreto en la misma transacción. Una autorización antigua no puede volver a aparecer por un commit tardío. Errores de almacenamiento se muestran como tales, sin afirmar que se guardó o eliminó la sesión. El almacenamiento del navegador es accesible al código autorizado del mismo origen: no se afirma protección frente a XSS o una extensión con acceso al perfil.

## Pruebas y alcance

[Evidencia](evidence-telegram-persistence-web.json) separa la integración completa con SDK sintético, el SDK instalado con transporte simulado y las pruebas nativas de IndexedDB. Se comprobaron recarga, cierre local, logout, revocación, error de red sin bucle, olvido sin configuración y conservación de los datos musicales. Una inyección de `QuotaExceededError` prueba el manejo de fallo, no el agotamiento físico del dispositivo.

El propietario inició sesión en el navegador compartido y root comprobó la restauración real tras recargar, sin pedir otro código. Después de las correcciones de compatibilidad descritas en [reproducción elegida](SELECTED-SONG-PLAYBACK.md), un caso real descargó y reprodujo, reutilizó una sola copia y quedó pausado con la sesión conectada. La evidencia real se separa de los fixtures anteriores en [evidence-real-selected-song-web.json](evidence-real-selected-song-web.json). No acredita Safari/iPhone físico, todos los bots ni cierre P0.

## 2026-11-13 · Código que no llega y reenvío manual

Telegram elige la vía de entrega. Cuando responde `app`, el código se busca en el chat de servicio «Telegram» de otra sesión ya abierta; no implica un SMS. Si no llega, Pulso ofrece «Reenviar código por SMS» o llamada únicamente cuando Telegram devuelve ese `nextType` y ha pasado su `timeout`, según su [contrato de autorización](https://core.telegram.org/api/auth#sending-a-verification-code). No se fuerza una vía ni se repite la solicitud automáticamente. Sin alternativa compatible, se muestra esa limitación. Para corregir el número se puede detener la conexión local y empezar otro intento explícito.

`auth.resendCode` permanece dentro del worker y reutiliza el teléfono/hash privados del intento vigente. El hash nuevo sustituye al anterior para confirmar el código. El hilo principal recibe sólo vía y plazo; los comandos de reenvío no llevan número, código ni hash. Cliente y worker comprueban ámbito, fase, operación pendiente y fecha. FLOOD_WAIT conocido extiende la espera; uno desconocido bloquea el reenvío. Las respuestas tardías tras cerrar no publican ni restauran capacidades. El método de entrega se conserva después de un código erróneo.

La [evidencia](evidence-telegram-code-resend-web.json) separa 663 unidades, adaptador/worker con SDK simulado, panel nativo Chromium/WebKit y HTTPS público. Esas pruebas no acreditan recibir un código real ni un inicio de sesión físico. El cambio ya está en Cloudflare; una pestaña con la versión anterior puede requerir cierre normal y reapertura para activar el service worker nuevo. No borra la autorización ni música de otros orígenes.
