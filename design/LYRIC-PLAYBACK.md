# Reproducir desde un verso · 2026-11-15

Un verso sincronizado es una acción de reproducción: al pulsarlo debe saltar a su tiempo y reproducir esa misma pista. Se aplica tanto a las dos líneas de la vista previa como al lector completo. La barra de posición conserva su comportamiento de seek sin iniciar una pista pausada.

La versión publicada inspeccionada trataba la vista previa como párrafos y el lector como un seek que conservaba la pausa. La prueba anterior sólo confirmó `currentTime` con WAV: no acreditó el tramo sonoro. Por eso no se toma como resolución del caso comunicado por el propietario.

| Before | After | Why |
| --- | --- | --- |
| Los versos de vista previa eran párrafos. | Los versos sincronizados son botones con nombre accesible. | Poder elegir un fragmento desde ambas vistas. |
| El lector sólo movía el tiempo y conservaba la pausa. | La selección del verso pide seek y reproducción en el mismo gesto. | Escuchar el fragmento elegido, también desde pausa. |
| Replay de una pista terminada volvía a cero. | El tiempo explícito evita ese recorrido y rearma el siguiente final. | Respetar el verso elegido sin perder el avance posterior. |

## Implementación

`PlayerLyricsPreview` y `PlayerLyricsReader` comparten el callback de selección de verso en `main.tsx`, con guardas de pista/entrada, navegación, ámbito, control, trabajo pendiente y retirada. La acción cancela cualquier intención de selección musical anterior y llama `player.play(seconds)` dentro del gesto del usuario, sin esperar una promesa antes de pedir reproducción. Los botones tienen nombre accesible y foco visible.

`Player.play` admite un tiempo opcional, finito y dentro de una duración conocida. Ese recorrido fija el tiempo y llama al mismo `HTMLAudioElement.play()` sin reemplazar el recurso ni reiniciar a cero si había terminado. Rearma el consumo de `ended` para que el siguiente final se procese una vez. La invocación `play()` sin tiempo mantiene su recorrido de reproducción/replay anterior. Las excepciones nativas de seek y las denegaciones de autoplay conservan el estado de error existente.

Una letra sin tiempos continúa como texto. No se fabrican posiciones a partir de la longitud del texto. Tampoco se activan versos fuera de la duración ni se cambia la prioridad de letras manuales/locales o el proveedor remoto.

## Evidencia

- 19/19 pruebas del motor PASS, incluidas selección desde pausa/final, mismo recurso/cola, siguiente `ended`, admisión, tiempos inválidos y rechazo nativo de seek. Negativo previo conservado en `.local/verse-playback-review/red-unit.log`.
- Lint del producto y comprobación de tipos del fixture PASS.
- 6/6 grupos del main real en Chromium154/WebKit27.2 PASS sobre snapshot de 200 fuentes runtime: `.local/interface-browser-validation/2026-11-15T07-30-32-473Z/report.json`. El caso de letra sincronizada ahora pausa el audio, pulsa el segundo verso y espera reproducción nativa y seek resuelto cerca del segundo4. Cero errores JS/externos observados, cleanup true.
- 10/10 comprobaciones de reproducción MP3 en Chromium154/WebKit27.2 PASS: `.local/verse-playback-review/verified-audio/report.json`. Audio original de12s con tonos220/440/880Hz; se pulsan versos0/5/9s y se comprueba el pico de salida mediante Web Audio, además de `seeking=false`, avance, mismo elemento/recurso/generación/cola y ausencia de error. Incluye pausa, cambio durante reproducción, volver a inicio, reproducir tras final y un segundo final admitido. No sólo comprueba el número del reloj.
- Inspección compartida del fixture: verso5, reproducción activa, `seeked` a5.0077s y tono distinto del inicial. Observación temporal retirada al cerrar la pestaña propia.

Las primeras ejecuciones de ese fixture quedaron negativas por un directorio `str` en el servidor de prueba que exige `Path`, y por esperar indefinidamente una promesa nativa al forzar el final desde el arnés. Se corrigió el arnés y se conservan los negativos; no se atribuyen al producto.

La ejecución general inicial pasó705/705 unidades antes del último ajuste de captura de excepciones. La siguiente pasó705/706: el negativo era de la edición concurrente de unidades MB, cuyo test aún esperaba «8 MiB». Se comunicó al responsable funcional sin cambiar sus fuentes/test. No se declara el árbol combinado completamente verde a partir de una prueba previa.

## Entrega y límites

Freeze de referencia: `.local/verse-playback-review/final/freeze.json`, 200 fuentes, con copia `frozen-root`. Inventario de los archivos propios: `owned.json`. El `main.tsx` compartido conserva el trabajo concurrente de actualización/recarga y cambia sólo las props/callbacks de las dos vistas de letra. El responsable de Cloudflare confirmó la preparación de una entrega combinada con recarga/MB y la revisión de los versos; esta revisión no modifica despliegue, cuenta, perfil real, `dist`, worker ni almacenes del propietario.

Los tonos acreditan la ruta de reproducción con ese archivo, no la correspondencia entre cada letra externa y cualquier grabación musical. Safari físico del propietario y los tiempos de sus canciones reales siguen siendo una comprobación separada. No declarar su incidencia completa resuelta por un fixture ni por la compilación.

Coordinación posterior: se verificó por lectura del recibo `.local/automatic-update/unit-all-final.log` que el responsable corrigió el test concurrente de MB y obtuvo708/708 PASS. Su snapshot combinado `b/root` contiene los tres archivos runtime propios byteexactos. El helper Engram readonly final agotó el tiempo en `initialize`; la lectura inicial de esta continuación sí había devuelto `FullContentVerified:true`. No hubo sync ni se presenta la lectura final como verificada.

## Publicación y comprobación HTTPS

El responsable integró el cambio en la entrega `/releases/d586ee3e549273ac.html` del dominio público. Se verificó directamente el bundle `/assets/index-CUPDvTs9.js` con las dos acciones de verso; el snapshot combinado contiene los tres runtime propios byteexactos y sus pruebas registran36/36 grupos de navegador y708/708 unidades.

Después de la publicación, nueva prueba sobre la app real de Cloudflare en contexto incognito propio y con un MP3 original de tonos sembrado sólo para la prueba: preparar en pausa, pulsar segundo verso de la vista previa→`seeked`5s, audio reproduciendo, `seeking=false`, salida441,43Hz. Pulsar tercer verso del lector→`seeked`9s, audio reproduciendo, salida877,48Hz y errornull, con service worker controlador activo. Se comprueba sonido real por Web Audio, no sólo DOM o reloj. El primer intento de pausar entre ambas acciones agotó el selector porque el MP3 de12s ya había terminado; el verso posterior volvió a reproducir el fragmento. No se convierte ese timeout del arnés en defecto del producto. Evidencia privada `published-audio.json`.

Observador nativo retirado, audio pausado y pestaña propia cerrada. No se abrió una sesión de Telegram ni se tocó la música real del propietario. Esta prueba publicada tampoco acredita Safari físico ni la exactitud del texto/tiempos de cualquier proveedor para todas las canciones.
