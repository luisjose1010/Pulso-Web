# Bots sugeridos por Pulso

Las sugerencias se mantienen en `PULSO_BOT_SUGGESTIONS`, dentro de `src/telegram/bot-chat-profiles.ts`. Se incluyen sólo los bots que decidamos recomendar tras comprobar el recorrido musical. La lista es distinta de los bots compatibles históricos y del pool que configura cada persona.

Actualmente se sugieren **@KDMusic_Bot** y **@DeezerMusicBot**, en ese orden. KD quedó como principal y Deezer como respaldo en la sesión de pruebas. Tras reconocer el sufijo «Album Version», KD también obtuvo la pista pendiente: sus 15 copias y dos anteriores de Ans completan MOSCA, 17/17. Ese resultado no garantiza todo el catálogo de los bots, cuotas ilimitadas ni disponibilidad permanente.

Al conectar Telegram por primera vez, Pulso comprueba los perfiles de **@KDMusic_Bot** y **@DeezerMusicBot** y los deja seleccionados en ese orden. No inicia los bots, envía mensajes, busca canciones ni descarga audio al hacerlo. La preparación tiene un plazo acotado; si los perfiles no pueden comprobarse, no se guarda una selección parcial y se puede configurar manualmente o volver a conectar más adelante.

Una selección guardada siempre se respeta, incluida una lista vacía porque se quitaron todos los bots. El usuario puede quitarlos, reordenarlos o añadir otros hasta un máximo de cinco. La preparación inicial se guarda mediante la misma comprobación de revisión que las ediciones manuales: no sobrescribe una elección concurrente ni una autorización diferente. Elegir una sugerencia manual sólo rellena el campo; «Comprobar y añadir» confirma su incorporación.

La selección confirmada y su orden se conservan en el navegador junto a esa autorización de Telegram. Recargar reconstruye el pool con referencias nuevas, sin buscar canciones ni iniciar bots. Olvidar o cambiar la autorización borra esa selección. [Contrato de persistencia](TELEGRAM-PERSISTENCE.md).

Ans conserva su adaptador existente y puede añadirse manualmente; deja de aparecer como sugerencia actual. No se eliminan sus chats ni archivos. Las entradas ivkmbot/LyDBot del estudio histórico tampoco son recomendaciones de la interfaz.

## Alternativas investigadas el 2026-11-09

Se estudiaron fuentes públicas y se hicieron dos comprobaciones limitadas con la sesión autorizada, sin pagos, uniones ni pulsaciones de botones desconocidos:

- Foxtune Beta: un inicio y una consulta recibieron ACK; apareció una respuesta con un callback y otro tipo de botón, sin título/intérprete objetivo ni lista musical identificable. Una lectura posterior no encontró coincidencia. No se pulsó el callback ni se descargó audio. No demuestra un fallo permanente del servicio, pero no acredita compatibilidad para recomendarlo.
- Musget: un inicio recibió ACK. La respuesta inicial activó la detección de términos de acceso/suscripción; no se determinó si eran obligatorios u opcionales y se detuvo antes de buscar. No se envió consulta ni se siguieron acciones.

Los dos clientes temporales cerraron correctamente y se retiraron sus diez archivos por tamaño y hash. No se almacenaron chats, sesiones, IDs privados, audio ni hashes musicales en la evidencia. Las fuentes públicas y las demás alternativas descartadas están en `.local/curated-bot-candidates/REPORT.md`. Los resultados reales cerrados están en `.local/foxtune-bot-health/` y `.local/musget-bot-health/`.

## Deezer como respaldo comprobado para la pista pendiente

Una consulta de «No Basta Con Querernos Más Nsqk» recibió un menú con artista antes del título. El usuario eligió su primer botón y mostró el audio entregado. La lectura posterior encontró una única entrada «No Basta Con Querernos Más (Album Version)», NSQK, 199 segundos y 8.071.089 bytes. El [catálogo público de Deezer](https://api.deezer.com/track/4299155492) vincula ese nombre con *mosca*.

La comprobación del archivo existente hizo una lectura de historial, dos revalidaciones y 124 lecturas secuenciales del documento. Longitud, hash independiente, tags de título/intérprete/álbum, códec y duración real pasaron. No se envió otra consulta ni callback, ni se importó una segunda copia a la aplicación. Los bytes y hashes permanecieron dentro del navegador y no se guardaron en los recibos. Esto acredita ausencia de escrituras musicales explícitas de la aplicación; no garantiza que Chromium mantenga el Blob exclusivamente en RAM física.

La prueba real integrada en Pulso fue satisfecha por KD antes de llegar a Deezer. Por tanto, no se presenta como un fallback real KD→Deezer ejercitado en esa ejecución. El flujo integrado de Deezer tiene ocho grupos con transporte sintético y un worker real; la entrega de su archivo tiene la evidencia real independiente descrita arriba. La identificación sigue siendo por metadatos, no por comparación acústica.

Entrega `c7c56c290c274884`, evidencia `.local/deezer-complete-release/`, `.local/deezer-recording-live/` y `.local/deezer-existing-file-proof/`. Las sugerencias permanecen inactivas hasta confirmarlas. iPhone físico y aceptación global siguen pendientes.

## Pruebas web y persistencia · 2026-11-09

La entrega posterior `9709829634c283c5` conserva la selección confirmada junto a su autorización. Una recarga real recuperó KD→Deezer y la sesión sin pedir credenciales, manteniendo los recuentos de música y playlists. No envió búsquedas musicales para hacerlo.

Un nuevo intento diagnóstico real de Deezer alcanzó el handle de descarga, pero terminó cancelado con cero bytes. El operador se detenía ante cualquier aviso del callback y no registró una causa inequívoca; ese resultado no acredita una descarga ni un fallback real, ni demuestra un fallo del bot. No se repitió. La prueba del archivo ya recibido y los recorridos con SDK sintético siguen siendo evidencias separadas. Informe: `.local/web-final-parent/REPORT.md`.

## Predeterminados autorizados · 2026-11-17

Se sustituye la política histórica de sugerencias inactivas para primeras conexiones: el propietario pide evitar la configuración inicial. La preferencia pertenece a la autorización local de Telegram, no se copia a Neon ni entre dispositivos. La interfaz sigue permitiendo editarla. Verificación local: 797/797 unitarias, lint, 12 casos Chromium/WebKit con adaptador y bóveda reales y transporte/auth/cripto TESTONLY; además QR 7/7 y reenvío 6/6 sin regresión. Se comprobó orden, eliminación persistente, CAS entre pestañas, cambio de autorización y ausencia de búsqueda/inicio/descarga durante la preparación. No prueba disponibilidad real de los bots ni iPhone físico. Publicación pendiente de cierre.
