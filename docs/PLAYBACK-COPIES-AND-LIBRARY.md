# Escuchar, Biblioteca y playlists

Elegir una canción intenta reproducirla con una copia completa verificada del navegador. Si esa copia ya existe e íntegra, se reutiliza sin consultar de nuevo al bot. Escuchar no añade automáticamente la canción a Biblioteca.

Junto a la canción elegida aparecen el estado, el progreso o el error y las acciones disponibles:

- **Agregar canción** incorpora su ficha a Biblioteca sin volver a descargar el audio.
- **Añadir a playlist** permite elegir una lista y confirmar. Reutiliza la copia y no incorpora por sí sola la canción a Biblioteca.
- **Reproducir** permite un nuevo intento explícito con la copia preparada. Si el navegador rechazó el inicio por falta de gesto, se indica esa situación. Otros fallos no se presentan como falta de gesto.

Cambiar de canción cierra el selector de playlist anterior e invalida sus callbacks. Cancelar, perder autoridad o una acción posterior del reproductor impiden el Play pendiente, sin prometer deshacer una escritura que ya haya ganado su commit.

## Persistencia

La pertenencia está separada de Track y del archivo físico mediante un registro cerrado en settings. La ausencia de registro conserva el significado de las fichas antiguas: pertenecen a Biblioteca. Las nuevas copias obtenidas sólo para escuchar publican su marcador `added:false` en la misma transacción que la ficha y su recibo; recovery conserva esa intención. La acción explícita cambia el marcador a `true` de forma idempotente. Una importación explícita de los mismos bytes también puede promover una copia previa; la deduplicación de escucha no oculta una canción ya añadida.

La biblioteca, Inicio y sus recuentos filtran por pertenencia. La cola, las playlists, la reutilización de copias y Almacenamiento mantienen las referencias internas completas. No hay migración de versión de IndexedDB ni retirada retroactiva de canciones antiguas.

## Espacio y copias de seguridad

Una canción fuera de Biblioteca todavía puede ocupar espacio. Configuración → Almacenamiento incluye esas copias y permite la retirada explícita elegible, protegiendo reproducción, cola, lectores y operaciones pendientes. No hay borrado automático de copias por no pertenecer a Biblioteca. No se exporta otro archivo a Archivos ni se almacena audio en Cloudflare; la caché de la app nativa Telegram es independiente.

La exportación de organización omite copias de escucha sin favoritos ni playlists. Si incluye una canción organizada que sigue fuera de Biblioteca, usa el formato de backup v3 con `inLibrary:false`; restaurarlo conserva esa elección y no crea audio. Los backups sin ese caso siguen siendo v2. El lector conserva v1/v2 y su significado previo; versiones anteriores del programa pueden rechazar v3. La previsualización y sus decisiones mantienen CAS y la pertenencia se escribe junto con el recibo.

## Evidencia y límites

La evidencia versionada está en [evidence-playback-library-web.json](evidence-playback-library-web.json). Los escenarios integrados usan SDK sintético en un worker nativo y archivos propios. El caso de rechazo `NotAllowedError` inyecta ese fallo deliberadamente; no acredita la política real de Safari. La reproducción con la cuenta Telegram del propietario y la aceptación física en iPhone siguen pendientes. El estado visible y las pruebas locales no diagnostican por sí solos el fallo informado en su teléfono.


## Caché de escucha y limpieza manual · 2026-11-09

Las copias obtenidas al elegir una canción se mantienen fuera de Biblioteca hasta pulsar Agregar canción. Configuración → Almacenamiento muestra su tamaño y ofrece **Limpiar caché de escucha**. La revisión requiere confirmación; cancelar conserva las copias. No hay limpieza automática al abrir ni cambios en la sesión de Telegram.

La limpieza sólo retira copias sin referencias organizativas. Biblioteca y álbumes añadidos, favoritos y cualquier playlist protegen sus archivos, incluidos alias separados del mismo fingerprint. Las copias actuales, en cola o protegidas por el runtime se conservan mientras estén en uso. Una ficha antigua sin marcador explícito se considera añadida a Biblioteca; no se reclasifica como caché.

Después de retirar una copia, su ficha y huella permiten reconocerla si se obtiene otra vez. La prueba integrada con SDK sintético verificó descarga/reproducción inicial, reselección sin RPC, limpieza con bytes ausentes, nueva descarga con el mismo ID y promoción a Biblioteca sin otra consulta. No es una prueba con Telegram real. Entrega funcional `e549c4c517300a6e`, evidencia [evidence-listening-cache-web.json](evidence-listening-cache-web.json).
# Resumen local de audio y estado de reproducción · 2026-11-16

En Configuración, el resumen cuenta el tamaño declarado de los archivos completos de audio y los muestra una vez por copia física, aunque varias fichas o playlists los referencien. Distingue las descargas y otras copias conservadas de la caché de escucha elegible. La estimación no es una medición del espacio total que informa el sistema operativo y puede no incluir metadata, miniaturas, índices ni reservas del navegador.

«Limpiar caché de escucha» sólo propone copias que no pertenecen a Biblioteca, favoritos o playlists. Copias en reproducción, cola, operaciones incompletas o estados inciertos se protegen. La retirada requiere confirmar y no borra sesión, configuración ni la aplicación de Telegram. Quitar una descarga conserva la ficha y la organización.

El estado «Reproduciendo» de una fila se deriva del TrackId activo del reproductor. Una sugerencia seleccionada, pista pausada o coincidencia basada sólo en metadata no es una prueba de identidad. La comparación de copias consulta metadata y fingerprint existente; no implica análisis acústico ni sincroniza datos entre dispositivos.

La comprobación local de almacenamiento del 2026-11-16 pasó en Chromium y WebKit con IDB y OPFS. En una fixture propia de 160044 bytes, imports simultáneos acabaron con una copia física; la limpieza elegible retiró 160044 bytes y mantuvo los protegidos intactos. Es evidencia local sintética, no aceptación de iPhone. Consulta [evidencia de almacenamiento e identidad](evidence-storage-identity-web.json); la prueba física de iPhone, uso offline en iPhone y reproducción con pantalla bloqueada siguen pendientes.
