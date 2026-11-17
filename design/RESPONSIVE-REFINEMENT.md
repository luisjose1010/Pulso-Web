# Revisión responsive y menú de canciones · 2026-11-17

Se conserva la dirección Bruma/azul y los temas claro/oscuro del diseño aprobado. Se revisa la aplicación funcional, con tres subagentes por biblioteca, búsqueda y reproductor; integración, correcciones y validación final del responsable principal.

## Cambios de experiencia

| Apartado | Problema observado | Resultado |
| --- | --- | --- |
| Navegación móvil | El cálculo del dock corría antes de admitir la cuenta y conservaba alturas cero; el mini quedaba debajo de la navegación. | Se vuelven a medir las barras al aparecer la cuenta. Comprobado espacio de 8px entre mini y navegación en 390px. |
| Playlists | Portada dependiente de la altura cambiante del navegador; opciones inline deformaban la lista. | Portada estable por ancho y opciones en diálogo compacto de escritorio/hoja inferior de teléfono. |
| Canción seleccionada | Outline azul excesivo y barras de reproducción añadían una línea a la fila. | Color discreto y marcador situado sin cambiar altura; foco de teclado conservado. |
| Menú de canción | Metadata y formularios competían con acciones musicales. | Favorito y cola visibles; playlist, orden e información en apartados del menú. Cierre, Escape, fondo, foco contenido y retorno al control de la fila. |
| Álbum/artista | Estados y título competían por espacio. | Filas de escritorio con disponibilidad alineada; móvil mantiene estados debajo. |
| Buscar | Títulos demasiado truncados, mensajes vacíos contradictorios, filtros sin salida clara. | Dos líneas, tipos explícitos, estado vacío sólo cuando corresponde y acción para volver a todos los resultados. El formulario desktop no queda detrás de la cabecera. |
| Reproductor/letra/cola | Play pequeño, barra mini sin progreso, transporte lejos de letras largas, cola sin jerarquía. | Play legible, progreso discreto móvil, transporte accesible durante scroll y cola con acciones ordenadas. Se conserva seek+play al tocar versos. |
| Configuración | Instrucciones de instalación extensas antes de los demás ajustes. | Instrucciones plegadas y disponibles; visibles automáticamente cuando falla o se descarta el aviso nativo. |
| Cuenta | Separador de 10px, botón de contraseña estrecho y fondo con tokens incorrectos. | Separador de 1px, botón de 44px y colores coherentes con el tema. |
| Inicio/Biblioteca/almacenamiento/respaldo/archivos | Revisión de composición, scroll, texto ampliado y foco. | Se conserva la estructura aprobada y se comprueba junto al nuevo dock. |

Las acciones conservan los controladores y sus comprobaciones. El menú no crea una descarga inexistente: «Gestionar copia local» abre la revisión vigente. Quitar de playlist conserva la cola copiada. Las confirmaciones de retirada y los formularios de datos siguen siendo superficies separadas. Abrir el menú no reproduce ni modifica música.

## Validación

La raíz compartida conserva los cambios funcionales del otro responsable. Los builds de esta revisión están aislados bajo `.local/visual-refinement/`; no se modifica `dist` ni se publica por inferencia. Todas las canciones, letras e imágenes de pruebas son sintéticas/originales; cuenta TESTONLY y sin Telegram real.

- Matriz visual antes del nuevo menú: 12/12 grupos, 32 vistas; Chromium154/WebKit27.2, anchos320/390/1366 y texto200%, temas claro/oscuro. Capturas inspeccionadas por root. `.local/visual-refinement/visual3/report.json`.
- Cuenta: 10/10 comprobaciones de geometría, divisor, contraseña y navegación a registro. Anchos320/390/844/1366, texto200%; no registro ni correo real. `.local/visual-refinement/accounts/report.json`.
- Búsqueda: 12/12 grupos finales, sin errores JS ni conexiones externas. `.local/design-search-mobile/focal/report.json`.
- Instalación: 12/12 grupos con eventos de instalación TESTONLY; sin instalar en un dispositivo. `.local/android-install-repair/focused.json`.
- Menú y playlists finales: 18/18 grupos PASS en Chromium/WebKit, incluyendo filas sin salto al seleccionar, submenús, cola, reordenación, Escape, fondo, ciclo de Tab y retorno de foco. `.local/interface-browser-validation/2026-11-17T05-33-57-744Z/report.json`.
- Integración completa final: 40/40 grupos PASS; cero errores JS y conexiones externas no previstas, limpieza confirmada, 274 fuentes idénticas al snapshot. `.local/interface-browser-validation/2026-11-17T05-37-15-786Z/report.json`.
- TypeScript/lint y `git diff --check`: PASS.

## Evidencia negativa y correcciones

La primera matriz visual detectó targets pequeños en mini desktop y cola; se corrigieron a44px. El arnés visual conservaba una expectativa antigua de audio pausado al seleccionar una canción; la prueba funcional independiente verifica continuidad y reproducción real. No se acredita playback por la matriz de capturas.

La prueba focal móvil de WebKit retenía layout390px tras solicitar320px incluso en HTML mínimo, con o sin foco; `innerWidth` sí cambiaba. El arnés ahora abre un documento nuevo para cada tamaño y exige que `clientWidth` coincida antes de comprobar overflow. No se relajó la condición ni se añadió ocultación de desbordamiento al producto. Probes y negativo: `.local/visual-refinement/search-resize-diagnosis.md`.

La primera integración del menú detectó la salida del foco de Tab del diálogo nativo: se añadió ciclo explícito de Tab/Shift+Tab, excluyendo contenido plegado. Los selectores antiguos ambiguos entre título de fila y cabecera de diálogo se acotaron a la fila, sin ocultar contenido para acomodar pruebas. Recibos negativos conservados.

En la integración de 40 grupos, una ejecución terminó 39/40: WebKit agotó 8 segundos esperando avance de `currentTime` tras redimensionar/cerrar el reproductor. El mismo caso pasó en la repetición, sin cambio al motor de audio; la causa del timeout no está demostrada. Se conserva el negativo `.local/interface-browser-validation/2026-11-17T05-31-32-179Z/report.json` y se añadió diagnóstico de estado del audio para futuras recurrencias. No se presenta como un fallo corregido del reproductor.

## Límites

WebKit Linux, dimensiones móviles y capturas no acreditan Safari físico, teclado de iPhone, barras reales, VoiceOver ni PWA instalada. Queda aceptación del propietario en su iPhone13. La revisión de Cloudflare pudo ver el acceso público; los apartados musicales se probaron con la app local integrada y datos sintéticos, sin entrar a la cuenta real del propietario.

ODD/Engram: lecturas inicial y final oficiales FullContentVerified:true (16 tareas verificadas en la final). Se mantiene el HOLD de escrituras de este hilo; registro privado para coordinación, sin sobrescribir tareas funcionales. No se declara P0-W completo.

## Seguimiento · canción actual y carátula del sistema

| Antes | Después | Motivo |
| --- | --- | --- |
| Regla global `aria-current` con outline; fondo de fila y colores poco visibles. | Canción actual con título e indicador en azul de la app, sin borde ni fondo persistente; outline reservado a foco de teclado. | Distinguir reproducción sin encerrar la canción. Se aplica a colecciones locales y álbum del catálogo. |
| Media Session recibía sólo título y artista. La carátula se cargaba únicamente con el reproductor abierto. | También recibe álbum y carátula de la canción actual; se carga con la reproducción y permanece al plegar el reproductor. | Los controles del sistema requieren `MediaMetadata.artwork`, según [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaMetadata/artwork). |

Se reutiliza la misma resolución de portada validada (local/manual primero y proveedor existente como alternativa), sin duplicar solicitudes ni inventar carátulas. El componente mantiene viva la URL mientras se usa, la retira al limpiar/cambiar la imagen y rechaza resultados de una canción o ámbito anterior. Vaciar/liberar Media Session limpia su referencia. No se modifica el motor de audio.

Validación: 20/20 grupos Chromium/WebKit PASS, incluida carátula decodificable, conservación al plegar, reemplazo al cambiar canción, título coloreado y ausencia de outline al tocar. Recibo `.local/interface-browser-validation/2026-11-17T05-43-52-212Z/report.json`; 274 fuentes verificadas, cero errores JS/conexiones externas no previstas y limpieza confirmada. Lint y 9 pruebas del proveedor de carátulas PASS. Los intentos previos del nuevo test detectaron una lectura anterior al commit de selección y una segunda canción inexistente en la playlist de preparación; se corrigió el arnés para esperar selección y abrir la playlist de varias canciones. Safari físico y su pantalla de bloqueo no son reproducibles en esta VM; las comprobaciones locales verifican el contenido de Media Session y el ciclo de vida de la imagen, no la presentación del sistema operativo. Sin publicación Cloudflare en este seguimiento.

## Seguimiento · progreso en canción y cola de descargas

| Antes | Después | Motivo |
| --- | --- | --- |
| La canción elegida mostraba su panel encima del buscador o antes de las pistas del álbum. | Estado y barra debajo de la canción seleccionada; controles secundarios plegados. | El progreso queda asociado visualmente a la acción que lo inició. |
| Preparación de playlist/espera de audio sin señal en la fila. | Indicador indeterminado junto a la canción mientras se prepara o espera audio. | Respuesta inmediata sin inventar porcentaje. |
| Bloque global de álbum con contadores y resumen técnico. | Burbuja «Descargas» desplegable con títulos, estados, avance confirmado y detener. | Consultar la cola sin ocupar la composición de la página. |

La barra con porcentaje sólo usa bytes/total reales. La barra de álbum cuenta canciones confirmadas, no bytes descargados ni tareas iniciadas. Se conservan los controladores de cancelación y las comprobaciones funcionales. La selección visual del álbum tiene una propiedad independiente de la usada para volver a verificar copias tras una descarga; mostrar progreso no dispara esa verificación prematuramente.

Avisos de sistema: iOS ofrece Web Push a apps añadidas a Inicio, con permiso solicitado por interacción del usuario ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). Esta entrega usa una burbuja dentro de Pulso: no solicita permisos, no registra suscripciones push y no promete trabajo en segundo plano ni barras de descarga nativas. La pestaña normal de Safari sigue teniendo feedback local.

Validación: integración de playlists 20/20 grupos PASS en Chromium/WebKit (`.local/interface-browser-validation/2026-11-17T05-52-17-005Z/report.json`), incluida espera de audio en una sola fila; controles/cancelación/cola/carátula conservados. Después del ajuste CSS final de compactación y eliminación del borde de búsqueda: prueba focal 8/8 PASS (`.local/download-feedback/report.json`) y búsqueda responsive 12/12 PASS (`.local/design-search-mobile/focal/report.json`). Capturas de búsqueda, álbum y burbuja inspeccionadas por root; anchos 320/390/1366, texto200%. Lint y diff-check PASS. Datos sintéticos y metadata interceptada, sin cuenta/audio real ni permiso de notificaciones. El primer arnés de álbum omitía `resultCount` de la respuesta de catálogo; se corrigió la fixture, sin relajar el parser del producto. Sin publicación Cloudflare; ODD/Engram mantiene HOLD de escritura.

## Seguimiento · avisos del sistema para iPhone y Android

Se añade Configuración → Avisos de descargas con activación explícita, aviso de prueba y desactivación independiente del permiso del navegador. En iPhone/iPad se exige abrir la app desde Inicio; una pestaña de Safari muestra las instrucciones, sin pedir permiso incompatible. Android y escritorio se habilitan por capacidades (`Notification`, contexto seguro y service worker con `showNotification`), sin obligar a instalar cuando el navegador ya lo admite.

Los avisos usan `ServiceWorkerRegistration.showNotification`, no el constructor móvil de `Notification` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification)). Se actualiza una notificación por tipo de trabajo, como máximo cada 15 segundos durante progreso; el resultado final no espera ese intervalo. El progreso es texto y cifras reales, no una barra nativa inventada. Cambiar/cancelar una selección retira su aviso pendiente. Se comprueban permiso, preferencia y vigencia antes y después de esperar al service worker. Un error de notificación no aborta la música ni la descarga.

Al tocar el aviso se enfoca una ventana de Pulso o se abre `/open.html`; no se aceptan URLs del payload, no se inicia audio y no se reanuda una descarga automáticamente. La preferencia es local al navegador, desactivada inicialmente. La pantalla informa que los títulos pueden mostrarse con el teléfono bloqueado. Desactivar cierra sólo avisos de descargas de Pulso.

Alcance explícito: notificaciones locales del trabajo que la app esté ejecutando, sin servidor push, suscripciones remotas, VAPID ni servicios de pago. No despiertan descargas suspendidas por iOS/Android. La burbuja interna sigue disponible, con o sin permiso. El permiso real sólo puede otorgarlo el propietario desde su dispositivo. No se acredita recepción física, sonido ni entrega con la app terminada.

Validación: 10/10 pruebas unitarias (opt-in, incompatibilidad/iOS, denegación, worker ausente, limitación de frecuencia, resultado final, desactivación, permisos/ámbito revocados, fallos aislados y selección sustituida). 11/11 comprobaciones de navegador (`.local/notification-settings/report.json`) incluyen perfiles simulados de iPhone instalado/pestaña, Android, permiso denegado y API ausente en Chromium/WebKit; también `showNotification`, lectura y cierre reales con el service worker compilado de Pulso en Chromium y permiso sintético de prueba. Capturas con texto200% inspeccionadas por root. Integración 20/20 PASS (`.local/interface-browser-validation/2026-11-17T06-03-41-283Z/report.json`) y feedback de descargas 8/8 PASS; después sólo se ajustó el espacio y título de la tarjeta, revalidado en la prueba focal de 11 casos. Lint y diff-check PASS. Pendiente aceptación física en iPhone/Android. Sin publicación Cloudflare.
