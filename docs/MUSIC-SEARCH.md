# Búsqueda musical: catálogo antes del bot

## Comprobación en la web publicada · 2026-11-15

La [evidencia con la sesión real](evidence-published-session-repair-web.json) confirma bots configurados, reproducción, copia reutilizada, MOSCA con17pistas y carátula, y los ejemplos de búsqueda MOSCA/Flores. La sesión se conserva tras recarga y reapertura del perfil del navegador.

El catálogo agrupa para presentación las diferencias de crédito principal frente al completo sólo cuando iTunes corrobora título, álbum y crédito principal declarado. La elección mantiene ID, título, crédito y duración originales; no se cambia la identidad del audio, el alias durable ni la admisión de copias. Las versiones literales siguen separadas y la corroboración ambigua no se fusiona. Las etiquetas de scrape «Video •»/«Song,» con álbum vacío o literalnull se suprimen sólo si existe su contraparte limpia. Un álbum declarado y único puede aportar su carátula a varias filas sin búsquedas por pista. Las decisiones manuales sobre imágenes conservan prioridad.

La portada del reproductor puede usar el artista principal declarado de la colección para una búsqueda sin identidad exacta, únicamente con álbum conocido, duración compatible y edición sin ambigüedad. Las consultas por identidad exacta mantienen el crédito completo. No se amplían las condiciones de aceptación de audio.

La búsqueda admite nombres de canciones y álbumes. La orden del propietario del 2026-11-08 añade también la búsqueda de artistas y su página con publicaciones asociadas; sustituye la exclusión histórica de esa categoría. El artista sigue calificando las palabras de una canción para preparar la consulta precisa. El estado de integración y publicación de la página se recoge en [ALBUMS-AND-ARTISTS.md](ALBUMS-AND-ARTISTS.md).

Escribir muestra hasta seis sugerencias de canciones, álbumes y artistas: en móvil aparecen en flujo debajo de la barra; en escritorio pueden superponerse. Hay un solo botón Buscar. Enter, Buscar y Ver todos los resultados muestran las coincidencias disponibles de las tres categorías dentro de Pulso y nunca envían un mensaje a Telegram. Los filtros de resultados permiten elegir Todo, Canciones, Álbumes o Artistas. Vaciar el campo cancela las consultas de metadatos, limpia resultados y descarta respuestas antiguas; no hay botones separados para buscar álbumes, artistas o cancelar el borrador. Escape o Cerrar sugerencias sólo cierran la lista breve. Elegir un álbum abre su edición y pistas; elegir un artista abre su página por identidad del catálogo. Ninguna de estas navegaciones reproduce ni descarga música.

Una sugerencia de álbum que proceda de los datos de una canción puede no tener aún ID de edición. Su resolución permite comprobar las publicaciones de un artista exacto y único cuando la búsqueda normal no encuentra coincidencias; conserva el crédito completo, cancela al salir y no consulta al bot. Las ediciones concretas se abren por ID y evitan ese paso. [Detalle del contrato](ALBUMS-AND-ARTISTS.md).

Sólo elegir una canción sugerida puede consultar al bot. Hace falta la sesión vigente y un bot principal compatible: es el primero del orden configurado en «Bots de música». Primero se reutiliza una copia local íntegra, sin cuenta ni mensajes. Si falta, la elección envía una sola consulta con título y artista; álbum/duración se conservan como expectativa, sin inventar sintaxis. Si falta sesión o un bot compatible, se muestra lo que falta y hay que volver a elegir la canción; conectar o recibir sugerencias no provoca el envío.

La agrupación de sugerencias tolera acentos, mayúsculas y puntuación; conserva los calificadores de versión, el crédito completo y las diferencias de duración mayores de cinco segundos. Una duración desconocida no permite agrupar copias. Un crédito principal sólo sirve para presentar un grupo cuando un lote iTunes único corrobora título, álbum y crédito; el `Track` local conserva sus metadatos originales. La diferencia de título/intérprete/versión o una corroboración ambigua conserva varias opciones. Los resultados de duración cero se descartan como metadatos inválidos; esto no es una regla para ocultar canciones o artistas.

La búsqueda de copias usa primero el alias exacto (ID público más título, crédito completo, álbum y duración). Si no existe, busca en el conjunto completo de fichas compatibles —incluidas las separadas de su archivo— para LRCLIB, iTunes y MusicBrainz. Una única ficha y su asset se verifican antes de reproducir; cero copias deja continuar por el flujo de obtención; varias copias compatibles o referencias cambiadas quedan desconocidas y requieren revisión. No se crean aliases ni se cambia metadata durante esta inspección. La selección pendiente entre catálogos sólo se comparte si conserva el mismo título/version, crédito completo y duración dentro de cinco segundos.

El icono «Reproduciendo» se deriva del TrackId actual del reproductor y sólo aparece en estado de reproducción activa. La selección de una sugerencia, pausa, fin de pista o una pista distinta no lo activa. Las filas de búsqueda sólo se enlazan cuando hay un único Track local con metadata compatible; las filas de álbum usan el TrackId de la inspección de copia existente.

Las sugerencias locales no necesitan red. Al escribir entre 3 y 160 caracteres, LRCLIB se consulta directamente de forma automática tras una breve espera; recibe la consulta, IP e identificador de Pulso. Su API v2 beta devuelve hasta veinte registros por consulta: la lista combina y ordena los candidatos por coincidencia de palabras en título, intérprete y álbum, sin inventar páginas ni prometer todo el catálogo o un álbum completo. No se envía audio, letras, fotos ni datos de cuenta. Una respuesta correcta vacía a una consulta de al menos dos palabras (con una primera mitad de al menos tres caracteres) permite una sola reformulación secuencial con su primera mitad (redondeada hacia arriba), sin suponer que separa título e intérprete. No se reformula ante errores HTTP o de red. Se conserva el intervalo de un segundo, Retry-After, la propiedad del cuerpo y el plazo total de 15 segundos; cancelar impide publicar resultados antiguos. La caché es sólo RAM. La reformulación puede no encontrar una canción y no garantiza cobertura del catálogo.

Álbumes y artistas se consultan automáticamente en iTunes US tras la misma espera del borrador. Las dos solicitudes son secuenciales y usan la cola global existente, con al menos 3,1 segundos entre despachos, plazo de 15 segundos por solicitud, caché RAM y cooldown compartido con las páginas de catálogo. Enter no duplica consultas en curso. Los fallos de ese proveedor no ocultan canciones locales o de LRCLIB. Volver de una página conserva las filas conocidas y permite completar una consulta interrumpida. No se promete catálogo exhaustivo ni disponibilidad de audio por un resultado de metadatos.

El pool empieza vacío. El primer bot configurado es el principal; el adaptador inicial admite ivkmbot si ocupa esa posición. Otros no reciben sustituciones ni consultas de respaldo automáticas. Las opciones/textos/referencias de audio de su respuesta se procesan para resolver la canción, sin presentar otro selector de versiones. Correlación y compatibilidad de metadatos no garantizan identidad musical. La elección musical resuelve automáticamente la mejor opción compatible, manteniendo el orden del bot si hay empate, y conserva una copia local verificada de hasta 8 MiB para escucharla. El detalle, los límites y la diferencia entre respuesta y proximidad temporal están en [BOT-DOWNLOADS.md](BOT-DOWNLOADS.md). La intención original todavía vigente inicia Play tras verificar la copia; si el navegador requiere otro gesto, se indica. [Flujo completo](SELECTED-SONG-PLAYBACK.md).

La sesión sigue en RAM por pestaña. Resultados y acciones antiguas no reviven tras cambiar consulta, orden de bots, cuenta o autoridad. Cancelar retira publicación pero conserva la observación del RPC hasta asentamiento; la incertidumbre cierra esa sesión si no se puede confirmar. Una cesión rechazada por actividad conserva la sesión del propietario actual.

La evidencia de la versión comprobada se registra en `docs/evidence-music-search-web.json`. Las comprobaciones sintéticas no acreditan el protocolo de un bot real ni el funcionamiento físico de iPhone. Los recibos y RED de la versión anterior se conservan; no se reinterpretan como pruebas del flujo nuevo.

Las coincidencias completas preceden a las parciales; se normalizan tildes y puntuación y se admiten prefijos de al menos tres caracteres. Se ordenan todos los candidatos locales antes de seleccionar hasta 50; los locales ganan duplicados remotos. No se descartan candidatos remotos por un segundo filtro estricto.

Los rechazos por límites muestran un código cerrado y la entrada pública para distinguir la guarda y la versión, sin contenido del chat. [Diagnóstico D1 y alcance](BOT-SEARCH-DIAGNOSTICS.md). Identificar ese código no demuestra que el caso real esté reparado.


## 2026-11-06 · Pertenencia explícita y copia de escucha

[Escuchar, Biblioteca y playlists](PLAYBACK-COPIES-AND-LIBRARY.md) describe el contrato vigente: escuchar conserva una copia verificada sin añadir automáticamente la canción; las acciones próximas a la elección permiten agregarla o confirmar una playlist sin otra descarga. Backups v3 condicionales conservan la pertenencia de canciones organizadas; v1/v2 siguen admitidos. La reproducción con la cuenta real y el iPhone permanece pendiente.


## 2026-11-08 · Autorización persistente

El acceso temporal descrito arriba queda sustituido para la autorización por la [sesión conservada en este navegador](TELEGRAM-PERSISTENCE.md). El SDK mantiene caches y referencias en RAM; la autorización confirmada se guarda en un almacén separado, se restaura bajo autoridad y puede eliminarse explícitamente. No persiste búsquedas, chats ni el pool de bots. La prueba musical con la cuenta real sigue pendiente; esta modificación no se presenta como reparación del audio.


## Validación de la búsqueda unificada

La entrega privada `6955592aa1587a88` incorpora este flujo. Cinco grupos nativos actuales y las pruebas del dist en Chromium y WebKit de escritorio pasaron con SDK, catálogo y audio sintéticos. El regreso durante una consulta pendiente conserva las filas conocidas y completa las restantes; un éxito posterior limpia el aviso anterior. La actualización normal conservó audio y organización. Los avisos históricos de WebKit y los intentos anteriores se registran por separado en [evidence-unified-search-web.json](evidence-unified-search-web.json). No acredita cuenta Telegram real, iPhone ni P0-W.


## Correcciones verificadas con la sesión publicada · 2026-11-15

La búsqueda agrupa presentación corroborada por título/álbum/crédito declarado, conserva versiones literales y mantiene intactos IDs, duración y créditos de admisión de audio. Créditos locales separados por comas y los mismos créditos completos del catálogo separados por ampersand se agrupan sólo si coinciden todas las palabras en el mismo orden y existe corroboración inequívoca del catálogo. Las colaboraciones no inventan álbumes adicionales si la identidad de colección declarada las vincula con la edición conocida. Esta regla no cambia las fichas guardadas ni la compatibilidad de audio.

En el sitio publicado, tras descargas reales, MOSCA muestra1álbum y18canciones sin títulos duplicados (17deálbum más acústica literal), con imágenes cargadas; abrirlo presenta17pistas y portada600sin mensajes al bot. Reproducción automática desde archivo, reutilización0comandosbot y acción explícita de Biblioteca comprobadas. Persisten límites:3pistas de MOSCA sin confirmar, créditos completos/álbum del archivo pueden separar tarjetas de Biblioteca y no se afirma deduplicación acústica global entre catálogos.

Un conflicto durante revalidación de selección antes de enviar callback permite pasar únicamente al siguiente bot configurado (D05), manteniendo guardas/revisión/target/cadencia y sin repetir el bot original. Si hubo callback acknowledged o entrega uncertain, se detiene. Se prueba esta distinción con unidades; no se presenta como causa exacta de los conflictos reales ni como bypass de las validaciones del worker. Recibo actual: evidence-published-session-repair-web.json.

## 2026-11-16 · Álbumes corroborados y agrupación acotada

El texto `albumName` de LRCLIB por sí solo no crea una sugerencia de álbum: es metadato lírico no corroborado y puede contener el nombre del artista o de un vídeo. Los álbumes con identidad de iTunes/MusicBrainz y las colecciones guardadas en fichas locales siguen disponibles. El metadato de pista puede seguir mostrando su valor original.

Las pistas con duración desconocida conservan entradas separadas. Para duración conocida, cada miembro de un grupo debe quedar dentro de cinco segundos de todos los demás; el orden de llegada no permite que un representante cree una cadena de tolerancia. La regla es de presentación y conserva título, crédito, versión e identidad de adquisición.


## 2026-11-16 · Selección e integración de singles

La selección de un single conserva la identidad de canción y la pertenencia a playlist, reutiliza una copia local íntegra cuando existe y limita la adquisición a una consulta explícita, un callback, una importación y un Play. Cancelar o editar/ocultar la selección no deja viva una resolución que habilite la actualización automática; mientras la metadata retenida pertenece al intento de single, el blocker real de actualización observa ese trabajo pendiente. La integración no reinicia el reproductor ni cambia la pista o su procedencia, y no añade una consulta RPC al navegar por el catálogo.

La aceptación integrada source-stable usa SDK y metadata sintéticos, con Audio/OPFS/IndexedDB/Web Locks nativos según cada navegador. El freeze de 262 fuentes es `88b9ffd391deba2b357c6804bd3666094fe0424bec533fec76b1db0c28d31839`; recibos y límites reproducibles están en [evidence-singles-integration-web.json](evidence-singles-integration-web.json) y `.local/singles-integration-acceptance/`. Chromium 9/9; WebKit persistente 5/5, efímero fail-closed 1/1 e IndexedDB 1/1. El baseline CSP de WebKit es separado y conocido; esto no es una afirmación de CSP global cero. No acredita bot/Telegram/cuentas reales, iPhone/Safari físico, actualización forzada durante metadata pendiente, segundo plano de iOS ni P0-W global.


## Safari: parámetro de búsqueda y portadas · 2026-11-15

Las consultas directas a iTunes usan entity explícito sin media=music para evitar que Safari las derive a musics://. Se conserva redirect:error y la validación de metadatos/edición; no se incorporan scripts remotos. La carátula faltaba porque no llegaba el lote de metadatos de búsqueda. El bundle publicado9006dcecc26d4049 pasa el recorrido de búsqueda, portadas, detalleMOSCA y páginaNsqk en WebKit aislado sin sustituciones. No equivale a iPhone físico ni cambia el resultado anterior14/17audios. Véase evidence-safari-catalog-web.json.
