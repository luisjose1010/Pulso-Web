# Elegir una canción y escucharla

Enter y Buscar abren el catálogo de Pulso y no envían mensajes. Elegir una canción comprueba primero su copia local. Si está íntegra, Pulso la reproduce sin consultar Telegram, aunque no haya sesión. La elección de una canción que falta autoriza la consulta a los bots compatibles configurados, en su orden y con continuación sólo tras fallos confirmados, la obtención de su audio, una copia local verificada y la reproducción bajo esa intención todavía vigente. Los límites y las condiciones de parada están en [Obtención secuencial de canciones](ORDERED-BOT-ACQUISITION.md).

Una operación por canción comparte el trabajo de selecciones repetidas mientras está pendiente. No se duplica la consulta ni la descarga. Una respuesta musical reciente, vigente y del mismo ámbito puede reutilizarse. No se reenvía automáticamente una consulta fallida o incierta ni se cambia de bot por silencio.

Las selecciones pendientes desde IDs de catálogo distintos también comparten la operación cuando título/version, crédito completo y duración son compatibles (máximo cinco segundos de diferencia). Esta regla coalesce trabajo pendiente; no crea identidad persistente. Para reutilizar una copia tras una consulta se exige alias exacto o una única ficha compatible entre todos los catálogos admitidos, y se vuelve a verificar el asset. La ambigüedad, un alias corrupto o una referencia física cambiada falla de forma cerrada.

## Opciones y asociación musical

Los campos opcionales de remitente ausente sólo se infieren para mensajes entrantes en el peer privado exacto; un remitente explícito ajeno o un mensaje saliente nunca usan ese fallback. El adaptador espera un menú o audio; un mensaje de progreso no termina la consulta y el siguiente historial puede contener una edición del mismo mensaje. Se ordenan las coincidencias compatibles de la ventana vigente del bot y se elige automáticamente la primera mejor clasificada con título/intérprete coincidentes tras normalizar presentación. No hace falta que Telegram lo marque como respuesta explícita: esa marca es opcional y no se inventa cuando falta. Live/remix y las demás palabras de versión se conservan. El lector inspecciona hasta 64 filas de teclado y 128 candidatos, manteniendo los presupuestos previos de bytes/nodos. Proyecta como máximo 20 filas, prioriza coincidencias musicales antes del recorte y no trata navegación de sólo símbolos como canción. El exceso de opciones ordinarias no descarta toda la respuesta. Un audio también contrasta la duración conocida con una tolerancia de cinco segundos. Etiquetas con símbolos de navegación y datos insuficientes no se resuelven automáticamente.

No se pide una segunda elección de versión: las coincidencias compatibles se ordenan por calidad de metadatos y, si empatan, se conserva el orden del bot. Si faltan metadatos suficientes o todos los candidatos contradicen la canción elegida, se informa sin descargar una grabación distinta. La proximidad temporal sola no autoriza nada: se exigen peer privado del bot comprobado, mensajes posteriores a la consulta/callback actual, sin otra consulta saliente concurrente, una coincidencia musical compatible elegida por el ranking, relectura fresca y las guardas de cuenta/revisión/expiración. Un reply explícito hacia otro chat o mensaje se rechaza. Una opción exacta se relee antes de pulsar sus datos privados de callback. El audio se relee antes y después de transferirlo. No se interpretan gramáticas de callback, ni se abren URL, pagos, uniones o acciones no musicales. Compatibilidad de metadatos no demuestra identidad acústica. La captura aportada por el propietario muestra la experiencia deseada, no los campos del protocolo real del bot.

## Una copia y referencias durables

La descarga tiene un máximo de 32 MiB, partes secuenciales de 64 KiB y plazo efectivo de 120 segundos. No hay incremento de buffers ni streaming progresivo en este cambio. Se verifican longitud, cabecera y SHA-256; el importador separado verifica también tags presentes, bytes y publicación. El hash identifica esos bytes, no una canción por su nombre.

Después del recibo y refresh se asocia el id público LRCLIB y sus metadatos de versión a la ficha y su huella. La asociación vive en settings, sin credenciales, cuentas, chats, IDs de documentos o callbacks Telegram. Se verifica en cada uso: un manifiesto ausente permite conseguir la copia de nuevo; corrupción, IO desconocido y referencias inconsistentes detienen la operación. La asociación no depende de la sesión de Telegram. Una sugerencia local apunta directamente a su Track. No se fusionan grabaciones por título solo ni se inventa identidad para artistas desconocidos.

La retirada conserva la ficha y su huella. Reimportar los mismos bytes permite al núcleo existente volver a enlazar esa ficha, conservando favoritos y playlists. Otra codificación con distinta huella no se fusiona automáticamente con una ficha antigua por compartir un nombre.

## Autoridad y reproducción

Root conserva owner/proof, scope, generación de base, reservas, revisión y admisión musical. La sesión Telegram en RAM tiene un lifetime separado de los permisos transitorios para iniciar comandos: preparar la propia cola no cierra la sesión. Una captura de comando anterior a una reserva o mutación sigue inválida cuando termina. Logout, pérdida de control/base, cambio de contexto o Cancelar impiden un Play tardío. Las órdenes posteriores de Pausar, Reproducir, cambiar de pista, seek o elegir otra ocurrencia, incluidos los controles del sistema, sustituyen la intención pendiente y solicitan cancelar su operación.

No se publica éxito hasta el recibo durable y el refresh. Cancelar no liquida un RPC pendiente y no borra un commit ganador. Sólo el Play todavía autorizado prepara su cola y selecciona la copia verificada con el único Audio existente. Reabrir, recibir sugerencias o restaurar la cola nunca genera esa intención. Si el navegador rechaza play por falta de gesto, se muestra el aviso y queda el control Reproducir; no se promete evitar las políticas de Safari.

## Configuración → Almacenamiento

La lista cuenta una vez cada archivo físico completo, aunque lo referencien varias fichas o playlists. Los tamaños son declarados; la estimación del navegador cubre todo el origen y se presenta aparte. Comprobar archivos actualiza el inventario; no se garantiza cuota ni retención perpetua.

Quitar descarga usa la reserva, revisión, declaración y confirmación del núcleo existente. Conserva fichas, favoritos y playlists y protege reproducción, cola, preparaciones, lectores y operaciones inciertas. No se habilita una retirada si el transporte no permite acreditar protección; no se fabrica autoridad por ausencia de un Service Worker. No hay limpieza destructiva automática.

La copia de Pulso pertenece a Safari u otro navegador. No requiere exportar a Archivos y no se envía a Cloudflare ni a un servidor propio. Telegram nativo mantiene su caché independiente: la web no puede compartirla ni borrarla. Pueden coexistir buffers y staging temporales; la garantía es una copia gestionada por asset, no una sola copia en todo el teléfono.

Las pruebas con SDK sintético se registran por separado de Telegram real, Safari/iPhone físico, autoplay y reproducción bloqueada. Ninguna de estas aceptaciones físicas se deduce del build o de Chromium.

El presupuesto decodificado de metadatos se aplica por respuesta; el total del recorrido queda acotado además por sus lecturas ya permitidas. No se comparte una única cuota de 64 KiB entre todos los sondeos. [Presupuestos y diagnóstico L15](BOT-SEARCH-DIAGNOSTICS.md#corrección-del-presupuesto-l15).


## Selección automática de la mejor coincidencia

Elegir la canción en el catálogo autoriza continuar con la opción musical mejor clasificada del bot. Un audio con título/intérprete coincidentes precede a una etiqueta de botón; entre audios compatibles se prefiere la duración más cercana, manteniendo la tolerancia de cinco segundos cuando se conoce. Las etiquetas completas coincidentes preceden a las que requieren quitar una numeración de resultado o una duración entre paréntesis/corchetes. La relación de respuesta explícita desempata frente a reciente; a igual puntuación se mantiene el orden original del bot.

Se normalizan tildes, puntuación y símbolos decorativos. Sólo para comparar etiquetas se puede quitar un prefijo como `3.`/`#3` y un sufijo de duración como `[03:20]`; no se quitan palabras live/remix/cover, nombres de intérpretes ni otras versiones. No se elige por proximidad temporal ni por el primer resultado bruto. Navegación sin título e intérprete compatibles no coincide. El mismo ranking se usa antes del recorte de la proyección, al elegir el botón, al reutilizar una respuesta vigente y al escoger el audio tras el callback.

El panel de producto oculta el selector adicional de versiones. El proceso conserva una sola operación y las relecturas privadas antes del callback y de los bytes; si no hay ningún candidato compatible termina con un aviso. No vuelve a preguntar, envía otra consulta ni cambia de bot automáticamente. La preferencia de ranking es una comparación de metadatos; no certifica identidad acústica. Evidencia: `docs/evidence-bot-auto-selection-web.json`.


## 2026-11-06 · Pertenencia explícita y copia de escucha

[Escuchar, Biblioteca y playlists](PLAYBACK-COPIES-AND-LIBRARY.md) describe el contrato vigente: escuchar conserva una copia verificada sin añadir automáticamente la canción; las acciones próximas a la elección permiten agregarla o confirmar una playlist sin otra descarga. Backups v3 condicionales conservan la pertenencia de canciones organizadas; v1/v2 siguen admitidos. La reproducción con la cuenta real y el iPhone permanece pendiente.

## 2026-11-08 · Resultado visible al interrumpirse Telegram

Se reprodujo con SDK sintético un cierre de sesión después del callback musical y al comenzar la lectura del archivo. Antes, revocar la sesión resolvía la descarga sin audio y el cambio de ámbito retiraba la canción seleccionada; el aviso podía quedar debajo del catálogo, con el texto anterior de espera. El controlador conserva ahora la ficha pública elegida y un error terminal próximo al buscador. Aborta la intención, elimina la referencia de consulta y la captura de red, descarta el progreso y no permite un Play tardío ni reintenta mensajes automáticamente. Una selección nueva comienza un intento nuevo bajo sus propias guardas.

La regresión integrada verifica un envío, un callback y una lectura de archivo que falla por revocación; no publica copia ni inicia audio. Esta reparación acredita la presentación del fallo, **no identifica la causa del problema informado por el propietario ni demuestra reproducción con su cuenta real**. La sesión del navegador compartido estaba desconectada al abrirlo para la prueba. Evidencia: [evidence-selected-song-feedback-web.json](evidence-selected-song-feedback-web.json).


## 2026-11-08 · Autorización persistente

El acceso temporal descrito arriba queda sustituido para la autorización por la [sesión conservada en este navegador](TELEGRAM-PERSISTENCE.md). El SDK mantiene caches y referencias en RAM; la autorización confirmada se guarda en un almacén separado, se restaura bajo autoridad y puede eliminarse explícitamente. No persiste búsquedas, chats ni el pool de bots. La prueba musical con la cuenta real sigue pendiente; esta modificación no se presenta como reparación del audio.


## 2026-11-08 · Descarga y reproducción comprobadas con la cuenta real

La sesión ya iniciada por el propietario se recuperó al recargar el navegador compartido sin otro código. La selección real completó consulta, callback, descarga, revalidación, importación y Play nativo; la posición avanzó. Pausar y volver a elegir reutilizó la única copia: sin consulta nueva ni operación Telegram pendiente. Escuchar mantuvo la pertenencia fuera de Biblioteca; Agregar canción y Añadir a playlist siguen siendo acciones explícitas. La prueba propia quedó pausada y la sesión conectada.

Se corrigieron tres incompatibilidades observadas durante ese recorrido. Una diferencia de cuatro segundos entre catálogo y documento excedía el margen anterior; el margen es ahora cinco, con título, intérprete y versión todavía obligatorios y preferencia por la duración más cercana. La comparación del documento incluía el localizador renovable `fileReference`: ahora valida su forma/límite pero compara identidad, access hash, DC, tamaño, MIME, atributos, mensaje, peer y markup íntegros. [Telegram documenta la renovación de las referencias](https://core.telegram.org/api/file-references). El conflicto real después de transferir todo no se atribuye a un campo privado concreto que no se inspeccionó; la regresión sintética demuestra RED con referencia renovada y GREEN sin aceptar otro documento.

El tercer fallo sí se aisló como metadata-artist-mismatch: la etiqueta M4A contiene una lista y el intérprete solicitado es un miembro completo. El importador admite ese miembro, con normalización de presentación y separadores de lista; no usa subcadenas ni quita palabras de versión. Mantiene la comparación del título y los rechazos de intérprete ajeno, hash, longitud, formato y duración inválidos. Los errores de título/intérprete/duración/codec tienen códigos cerrados distintos sin valores privados. La inspección real devolvió sólo discriminantes; no exportó audio, nombres, chats, IDs ni credenciales.

[Evidencia y límites](evidence-real-selected-song-web.json): 513 unitarias y lint/tipos PASS; una selección final de 40/40 en Chromium154 con main íntegro/SDK sintético y 155 fuentes exactas, cero pageerrors/CSP/externos y cleanup. La entrega compilada pasa Chromium y WebKit desktop con metadatos sintéticos/audio propio; conserva los diez avisos históricos style-src-attr de WebKit. Update normal mantiene audio antiguo y espera cierre de clientes; no se fuerza SW. Los RED y errores iniciales quedan preservados. Una retirada G13 falló sin journal durable en una selección intermedia; aislada y en las finales39/40 pasó, sin atribuir su causa a producto o arnés.

La cuenta real acredita este caso focal en el Chromium compartido, no iPhone físico, Safari móvil, todos los bots/canciones, identidad acústica, offline privado, background ni cierre P0. El pool sigue en RAM por conexión. Música y autorización viven en el navegador del usuario, no en Cloudflare ni un backend de Pulso.


## 2026-11-10 · Resultados agrupados y etiquetas de vídeo

La lista agrupa títulos de presentación equivalentes del mismo crédito declarado; no agrupa intérpretes diferentes ni elimina calificadores Live, Remix, Acoustic o Album Version. Se retiran etiquetas terminales exactas Visualizer/Official Video/Official Audio y un prefijo redundante del artista comprobado por nombre completo. Un título literal Visualizer o Live Visualizer permanece intacto. Si hay un resultado remoto limpio se prefiere ese registro original; una copia local sigue teniendo prioridad por ID.

Para una elección LRCLIB se usa el título limpio visible como objetivo de consulta y validación; el registro remoto original no se modifica. Una elección local conserva título e identidad originales. Esta normalización de presentación no es una prueba de identidad acústica. No modifica archivos ni organización guardada.

## 2026-11-16 · Alias y estado real del reproductor

Un alias exacto de catálogo ligado al TrackId y al fingerprint actual tiene prioridad para identificar la copia que reproduce el indicador, aunque exista otra ficha detached con metadatos compatibles. Sin alias exacto, la resolución considera el conjunto completo de fichas —incluidas detached— y sólo selecciona una coincidencia única. Esta lectura de aliases es acotada y no vuelve a hashear audio por fila o por pulsación.

La verificación de playback compara el hash y el tamaño del asset comprobado con el fingerprint guardado en la ficha antes de devolver el TrackId. Selecciones simultáneas sólo se agrupan con duración positiva finita, título/versión y crédito completo compatibles; diferencias Live/Studio en el álbum también se conservan como conflicto.
