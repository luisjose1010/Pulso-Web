# D1 · Exploración visual de Pulso · PROPUESTA PRESENTADA

## Encargo y autoridad · 2026-11-08

El propietario reserva este hilo para diseño UX/UI de Pulso en navegador,
con referencias a Spotify y Apple Music. Acepta trabajar con las skills de
emilkowalski/skills y pide avanzar con propuestas de color. Se autoriza
exploración y prototipos revisables; no se ha elegido una variante ni se
ha autorizado mediante esta exploración una entrega nueva del producto.

Open Design completo no se instala en la VM. El intento anterior dejó sólo
3,7 MB de checkout en /data/workspace/pulso-web-opendesign, sin dependencias
ni conexión MCP. Windows/Open Design/Tailscale fueron alternativas discutidas,
no conexiones realizadas. El método sigue siendo ODD + Engram local Pulso-Web.

## Base y alcance

README y SPEC originales son handoff histórico. P0-W y T8 registran instrucciones
posteriores: Telegram como entrada musical, búsqueda unificada de canciones,
álbumes y artistas; escuchar separado de pertenencia a Biblioteca; mini player
con título, intérprete y controles. Respetar esos contratos en el diseño.

Hay trabajo concurrente de retirada de colecciones y cambios de Telegram en el
árbol de producto. Este incremento sólo crea archivos propios en design/ y
esta tarea; no modifica src/, tests/, package/lock, dist, sesión ni música.

Skills instaladas con el helper oficial de Codex en su directorio de skills:
emil-design-eng, apple-design, mobile-native, prototype y break-ui. Son
herramientas del agente; no dependencias del producto ni un MCP. Se leen
localmente para este incremento; descubrimiento automático desde próximo turno.

Primer prototipo: minirreproductor y apertura a reproductor completo, en contexto
visual de un álbum de muestra. Todo en un HTML autónomo, sin servidor, APIs,
fuentes externas, Telegram, almacenamiento persistente ni bibliotecas nuevas.
W01/W06/W08/W17/W18; no acredita ninguna aceptación funcional/física del producto.

## Direcciones propuestas, todavía sin elegir

| Dirección | Paleta | Eje de composición | Coste |
| --- | --- | --- | --- |
| Bruma | #f4f6fa / #ffffff / #172335 / #235ad7 | Clara, editorial; reproductor dividido | Menor densidad |
| Grafito | #141414 / #1e1d1d / #f7f5f2 / #ff8775 | Oscura, compacta; reproductor lateral | Más información simultánea |
| Tinta | #111527 / #1b2038 / #f3f1ff / #b4a5ff | Azul noche, centrada e inmersiva | Más desplazamiento |

Las variantes divergen también en densidad, posición y jerarquía del player.
La paleta y composición se podrán combinar en una iteración posterior.
No se copian marcas, portadas ni composiciones exactas de proveedores.

## Artefacto y contratos de exploración

`design/prototypes/player-directions.html`: selector de tres variantes, muestra
de datos normal/largos/vacío/uno, Play/Pausa, seek, volumen, siguiente/anterior,
cola, repetición/aleatorio y organización sólo en RAM de la muestra.
Audio instrumental sintetizado propio por Web Audio únicamente tras gesto;
portada vectorial propia, sin imágenes externas. Es audio de prueba, no catálogo
real ni implementación de Player. Al cambiar variante se detiene la fuente.

Selector neutral tomado de prototype/PICKER.md; posición superior para no tapar
el minirreproductor. Adaptaciones funcionales: URL ?v=N se conserva sólo donde
history lo permite (srcdoc tiene restricción), índice inválido vuelve a 1 y
contador de montaje evita publicar un rAF de una elección anterior. El aspecto
del selector no usa tokens de Pulso. Navegación lateral/inferior es contexto
estático identificado, no funcionalidad simulada del producto.

## Validación y siguiente paso

Una selección final de **23/23 grupos PASS** en Chromium 154.0.8037.57 sobre
el HTML autónomo SHA-256
`3214c9d32e28dc5bd5e777934c1d3a996bc2efd86ae768295806978b16d80d58`.
Incluye las tres variantes en 320/390/728/1440 CSS px, apertura/cierre y retorno
de foco, fondo inert, reproducción Web Audio con reloj avanzando, pausa,
posición, volumen, anterior/siguiente, cola, favorito, pertenencia en RAM,
aleatorio/repetición, URL/teclado, superficie inline about:blank, movimiento
reducido, título completo en detalle, falta de portada y estados cero/uno.
Ampliación de raíz al 200% con fuentes en rem; no es zoom físico ni iPhone.
Cero errores de página y solicitudes externas; contexto y navegador aislados
cerrados. Recibo final `.local/design-directions/report.json`, verificador
`.local/design-directions/verify.mjs`, capturas normales/expandidas en su
subdirectorio screenshots. No servidores ni conexiones reales.

Primer recibo negativo conservado en baseline-report.json y HTML anterior en
baseline-player-directions.html: valor de rango `.1` rechazado por Playwright
y falta de limpieza del diálogo en el arnés causaban fallos posteriores en
cascada. Se corrigió arnés a `0.1` con limpieza por caso. También había un
defecto visual real: el encabezado de álbum de dos columnas recortaba el título
al aumentar fuente. Ahora sus columnas fluyen a filas en móvil; tipografía rem,
títulos completos en detalle y control de posición/volumen con área de 44px.
Se preservan los negativos; no se suman los runs. Una repetición del mismo
23/23 sólo completa capturas tras esperar a la animación; es el recibo final.

Inspección visual de capturas normal/expandido móvil/escritorio realizada.
html_preview agotó 20s dos veces con el prototipo y también con un HTML mínimo
de un párrafo: fallo de ese visor previo, sin atribuirlo al producto. El HTML
abre y responde mediante file:// y setContent en Chromium. html_render sí
devolvió attachment y confirmó mostrado en el hilo (1360px); ese éxito no se
presenta como preview PASS. No se inició servidor como alternativa.

Las cinco skills ocupan en conjunto 105409 bytes (sin aplicación ni daemon).
El selector se presenta arriba para no tapar el minirreproductor. La guía
`design/README.md` explica archivo, atajos, contenido y límites.

**Siguiente:** elección o combinación del propietario, después aplicar esa
dirección al sistema visual y al recorrido Buscar → artista → álbum. No hay
selección aprobada ni integración autorizada por inferencia. Sin publicación,
build de Pulso ni aceptación iPhone. P0-W permanece incompleto. USD 0.

## 2026-11-08 · Presentación móvil solicitada

El propietario dice «de momento así» y pregunta por la versión móvil. Se
conservan las tres alternativas, sin deducir elección de una paleta o permiso
de integración en producción. Nueva presentación autónoma:
`design/prototypes/player-mobile.html`, con un iframe sandbox allow-scripts
de viewport real hasta 390 CSS px. La fuente anterior se incrusta íntegra
(SHA 3214c9d32e28dc5bd5e777934c1d3a996bc2efd86ae768295806978b16d80d58),
con adaptaciones locales: área de aplicación de 760px, contenido desplazable,
dock y navegación fuera del scroll, y reproductor expandido con controles
ajustados al ancho. Los controles Álbum/Reproductor son del arnés y sincronizan
vista con el cierre interior mediante postMessage, comprobando source y
valores cerrados. El iframe no tiene acceso al origen/almacenamiento del
padre ni usa red. Paletas permanecen con selector neutral original.

Comprobación propia final **10/10** en Chromium154.0.8037.57: padre728/390/320px,
viewport interior limitado a390, sidebar ausente, navegación inferior visible,
dock mantiene posición al desplazar contenido, sin overflow horizontal,
apertura/cierre y sincronización de botones, fondo inert, las tres paletas
y audio Web Audio por gesto dentro del sandbox. Cero errores de página y
solicitudes externas; cleanup confirmado. Capturas de álbum y reproductor
inspeccionadas. Informe `.local/design-directions/mobile/report.json`; SHA del
artefacto `ff22f27dca0e7585a59ab8c872b7f22fd3900225a4717d50b598648bb34d4b1d`.
Builder/verificador propios locales; no suites de producto repetidas.

html_preview vuelve a agotar20s; se conserva la distinción con Chromium local
y html_render. No se inició servidor ni se tocó la entrega existente. La
presentación no prueba teclado, safe areas ni gestos en iPhone real. Sin
cuenta, datos reales, build o publicación; USD0. Engram se sincroniza y se
verifica después en invocación independiente.


## 2026-11-09 · Interfaz real integrada desde design

El propietario autoriza convertir el diseño preparado en la interfaz del producto y adaptar módulos según sus recorridos. Esta instrucción sustituye el HOLD de integración visual anterior. Bruma clara/oscura, Inicio por defecto con colecciones reales, Buscar con barra única y filas/categorías, páginas de álbum/artista, Biblioteca en cuadrícula Playlists/Álbumes/Artistas con Favoritos automático, opciones secundarias por canción y configuración agrupada. Mini sin portada ni datos técnicos, barra desktop con transporte/posición/volumen y player expandido sobre el mismo Audio. No se importan catálogo, audio o persistencia RAM del demo. Añadir Biblioteca/favorito/playlist/copia conservan significados distintos; los módulos de datos, almacenamiento, transporte y Telegram permanecen intactos frente a e549. Telegram/searchportal se mantienen montados; recuperación y control siguen accesibles.

Terra implementó presentación y validación; root revisó y corrigió mini dentro de settings ocultos, alertas globales, reserva del lateral, mínimos de tarjetas/Continuar/buscador al200%, volumen desktop y foco de controles en details cerrados. RED de foco confirmado en ambos motores: Cola→BODY y Escape fuera; filtro excluye descendientes ocultos salvo summary, con Tab/ShiftTab/cola abierta/cerrada GREEN. Los recibos previos se conservan, incluidos un snapshot con drift temporal y un primer WebKit cuyo SW permitió metadatos públicos reales: inválidos/no aceptados. Final blindado con proxy cerrado, SW bloqueado y metadatos interceptados; no cuenta Telegram ni medición RPC.

Final176fuentes SHA/bytes antes/después,16/16grupos main literal Chromium154/WebKit27.2 PASS. Incluye colecciones reales IDB, favoritos/listas/álbum/artista, crear/añadir/renombrar/cancelar/reload, mismo Audio/fuente/tiempo, foco/Escape/resize, caché cancelada inventario idéntico, Enter/navegación con catálogo sintético,320/390/844/1366 ytexto200%, cinco pantallas ytemaoscuro/reducedmotion. Cero erroresJS/externos observados;24style-src-attr y14style-src-elem WebKit conservados, sin atribución causal ni afirmaciónCSP0. No seek nativo dedicado de barra nueva, SW en matrizUI, cuenta real ni iPhone. Fixture sintético se mueve byteexacto a tests/integration; runner sólo cambia rutas de lectura.

627/627unitarias finales, lint/tipos/build PASS. Sourcearchive3726miembros,176runtimeexactos, avisos/licencias y ausenciaidentidadprivada PASS. Updatee549→23f7276a5003d3e8 conserva audio viejo,nueva pausada,waiting hasta cierre normal sinforcedactivation. Misma copia privada autorizada actualizada38archivos;296assets/entradas previas exactos. HTTPSlauncher/entry/main/worker/SW/configno-store cotejados sin registrarURL/secretos. Rootdist yperfilmusicalreal intactos; sin cuentas nuevas,costos,commit/push. Evidencia .local/interface-parent/revision-6 y .local/interface-browser-validation/2026-11-09T08-13-57-015Z/report.json; resumen docs/evidence-interface-web.json y contrato docs/UI-INTEGRATION.md. iPhone físico/VoiceOver/safeareas/teclado real/background/P0global continúan pendientes. ODD aditivo, sync y readonly independientes al cierre.


## 2026-11-09 · Corrección de búsqueda directa, reproductor y lector de letras

El propietario rechaza desplegable de sugerencias y player/letras diferentes a design, e informa selección sin audio y mini que desaparece. Terra cambia MusicSearchPanel a inputsearch normal y lista única en flujo según query, sin combobox/listbox/dropdown ni cambio de foco por escribir. Enter/Buscar no reenvían Telegram ni duplican metadata; borrar vacía y mantiene abortos/generaciones. Elección explícita sigue siendo única admisión musical. NowPlayingView controlado deriva composición real de design/app/NowPlaying: portada, título/intérprete, indicador favorito real24/16/44, seekmm:ss, transporte/modos y vistas propias Letra/Cola. Sin importar demo audio/catálogo/letras.

Root integra al mismo Audio/Player y callbacks guardados; miniplayer siempre montado (Sin reproducción inicial con Play deshabilitado) evita desaparición por no selección. PlayerLyrics hook lee letras locales con Activity/identidad/scope, previewdoslíneas y readerplain/LRC real, seek guardado sin autoplay; editor legacy secundario, proveedor online sigue desactivado. Repro visual concreto: openPlayer.focus+scrollIntoView desplazaba274pxChromium/240WebKit y portada quedaba en−160/−126. Root mantiene foco preventScroll yabreconscrollTop0; final390×664 portada113.8–377,título397–426,cierre25–69,transporte551–623 completos. RED visual y capturas conservados.

El fallo de selección reportado NO se reprodujo en baselinev6:4cachedPASS Chromium/WebKit y1SDKsintéticoPASS con download/import/play. PrimerREDcached era espera prematura del arnés (srcprevio yaexistente), preservado y corregido. No afirmar causa real ni Safari solucionado. Nueva prueba NotAllowed unavez exige aviso+MiniPlayhabilitado y gesto nuevo→avance en ambos motores. Sin eludir política del navegador.

FinalUI revisión2:180fuentes bytes/SHA intactos antes/después,22/22grupos Chromium154/WebKit27.2 PASS;6casoscachedincluyenfresco/A→B/gesto, mismoelemento/nuevasource/avance/membershipfalse. Preview/plain/LRC guardados visibles sin abrir acordeón, seek5s, retorno/foco/audio, navegación, playlists/cachecancel/inventarios,320/390/844/1366,200%/oscuro/reducedmotion. SW bloqueado/proxycerrado/metadatainterceptada,0pageerrors/externosobservados;20style-src-attr+14style-src-elemWebKit retenidos sin causalidad ni CSP0. Root inspecciona portada ylectorfinales. UItestsinSDK/noconteoRPC. SDK revisión1 separado:1send+1callback+bytes+import+nativeavance, mini/títulocorrecto, reselect0RPC/singleasset/membershipfalse/playlistsintactas. Rev2 difiere sólo scroll/foco deapertura; guardas y reproducción iguales, sin repetir cuenta real.

627unitarias/lint/tipos/build PASS. Auditoría3731miembros/180runtimeexactos y licencias/ausenciaprivados PASS. Update23f7→6b28ffbe1295f963 conserva audio antiguo,nueva pausada ySWwaiting hasta cierre normal. Misma copia privada38archivos;299assets/entradas previas exactos yHTTPSlauncher/main/worker/SW/configprivadano-storePASS. Rootdist/perfilreal/Telegramreal no tocados; sin costos/nuevacuenta/servicio/Git. Evidencia .local/ui-corrections/parent/revision-2, .local/interface-browser-validation/2026-11-09T08-45-04-469Z/report.json y .local/ui-corrections/remote/integrated-verified. Resumen docs/evidence-ui-corrections-web.json. iPhone/VoiceOver/tecladoreal/background yP0global pendientes. ODD aditivo yEngramsync/readonlyindependiente al cierre.


## 2026-11-10 · Entrega de fidelidad visual autorizada

Tras confirmar que el rechazo se refiere a la app funcional, el propietario pide actualizar el enlace. Se integra la capa design-fidelity.css después de responsive-shell.css; frente a adfa sólo cambia esa importación y se añade CSS. Root coteja182fuentes de la entregaUI y22/22grupos Chromium/WebKit PASS, sin erroresJS/externos observados y cleanuptrue. Se conservan reparaciones de duplicados,32MiB y reproducción; no hay cambios de datos, controladores ni transporte. Las diferencias estructurales de Inicio/Biblioteca/portadas/continuar/lateral y semántica Favoritos siguen explícitas en design/FIDELITY-REVIEW.md: no afirmar paridad total por CSS.

Build en copia congelada y auditoría3733miembros/182runtime exactos, avisos/licencias/ausenciaidentidadprivada PASS. Terra smoke minificado Chromium154/WebKit27.2 carga/Biblioteca/Buscar con SWbloqueado,0pageerrors/externos; updateadfa→a629 conserva audioantiguo,nuevapausada,esperacierre yrestaurapausada PASS. Entrega privada a6298e0bb1031db6,38archivos exactos,305assets/entradas anteriores byteexactos yHTTPSlauncher/entrada/main/worker/SW/configseparadano-store PASS. Mismo origen ylauncher; no forzarSW ni tocar sesión/autorización, música o listas reales. Rootdist preservado, sin commit/push,costos/servicios/cuentas nuevas. No nueva prueba realTelegram ni iPhone; la prueba real8950674bytes de adfa queda separada. Evidencia .local/design-fidelity/integrated y release; docs/evidence-design-fidelity-web.json. Engram15 se sincroniza yverifica en invocacionesindependientes.


## 2026-11-10 · Combinación final con detalle de playlists

Actualización posterior al cierre funcional2dd: llega ownedREADY del propietario UI con189fuentes exactas del árbol (src/public/index), preservando la guarda root de playCollection. Se combina con transporte/selección temprana del álbum en snapshot190+Handler y se entrega0a92a9641e836c05. La nota de playlist pendiente del cierre anterior queda superada por esta entrega; no se descarta ni reemplaza main desde un snapshot antiguo.

CollectionHeader/CollectionCover/collection-detail.css: portada/mosaico local de hasta4 IDs distintos o corazón de Favoritos, título/conteo/duración reales sin inventar duración desconocida, controles claros, filas compactas de título/artista y menú ⋯. Filtros, renombrar, edición, destino de playlist y metadatos técnicos pasan a opciones secundarias; handlers/CAS/guards de organización y limpieza se conservan. Header Play prepara/verifica cola completa actual con IDs/epoch/scope/navigation/view guard antes de usar el mismo Audio; root añadió captura de selectedSongIntent al inicio para que una interacción posterior invalide el arranque. Shuffle sólo sobre cola coincidente. No schema/SDK/proveedor/descargas nuevos, ni otra instancia Audio ni portada remota buscada por cada playlist.

UI independiente34/34grupos Chromium154/WebKit27.2 (22generales+12playlist),189hashes antes/después exactos a190freeze,0JS/externos observados,cleanuptrue. Focal de cuatro portadas usa PNG/WAV propios; WebKit efímero rechazó Blob en IDB en el fixture (negativo conservado), se contrastó perfil persistente positivo y los12casos usan nuevo perfil SINTÉTICO persistente, sin cuenta. No se acepta SafariPrivado ni iPhone por ese resultado. El recibo conserva106eventosCSPWebKit (92style-src-attr/14style-src-elem), noCSP0general. No sumar34+4 como casos únicos.

Final del álbum4/4 repetido sobre snapshot combinado190(189+Handler), exacto porarchivo y sin drift,0JS/CSP/inesperados en ese fixture.646unitarias previas/lintfinal PASS. Build/auditoría3753miembros/190runtime/avisos/licencias/ausenciaprivados PASS. Smoke producción Chromium/WebKit y update2dd→0a92 PASS; audio anterior sigue/nueva pausada/SWesperacierre/restorepausado,0externos. Entrega38archivos y321inmutablesanteriores byteexactos; HTTPSlauncher/latest/entrada/main/worker/SW/configprivadano-store exactosPASS. Dist raíz ahora se sustituye intencionalmente por la copia aceptada combinada, bytes exactos, y190fuentes runtime del árbol coinciden con el build.

Recibos .local/design-playlist-detail/report.json y revision-2, .local/album-mobile-repair/parent/revision-2 y .local/album-early-check/2026-11-10T07-08-02-203Z/report.json; docs/evidence-playlist-detail-web.json. No cuentas, música real, sesiones modificadas, costes, servicios ajenos, commit/push ni aceptaciónP0/iPhone. La causa del rechazo de red de IMG_6737 sigue no establecida para el dispositivo; nueva etapa/HTTP/versión permite diagnosticar si reaparece. Engram15sync yreadonly se verifican en invocaciones separadas.


## 2026-11-13 · Barra inferior compacta del reproductor funcional

El propietario rechaza por captura la barra inferior de escritorio. Incremento acotado a MiniPlayer.tsx, mini-player.css y una importación al main actual; se preservan handlers/guardas, Audio, cola, Telegram, pertenencia y almacenamiento. Título/intérprete a izquierda; Anterior/Play/Siguiente y progreso alineados al centro; tiempos discretos e icono/volumen acotado/abrir a derecha. Sin etiquetas visibles de formulario. Ranges conservan teclado/nombres/foco y usan progressHTML/CSS estático sin estilosinline. Altura88px escritorio,68px móvil normal, crecimiento con texto200%; tacto44px y control36px sólo puntero fino de escritorio. Reserva inferior usa alturas medidas para no tapar el final del contenido.

Lint/build aislado/auditoría PASS;197runtime exactas antes/después. Chromium20/20 y WebKit20/20 en ejecuciones finales por motor: geometría320/390/844/1024/1366/1864 y200%, texto largo, foco, volumen teclado, seek, Play/Pausa/expandir con Audio único, continuidad y playlists. Datos/audio/catálogo sintéticos, perfiles aislados, cero pageerrors/externos observados, cleanuptrue. Primer runner conjunto terminó143 sin reporte final, no se suma comoPASS. Primera selección WebKit19/20 falló por igualdad exacta de volumen0.6 contra floatnativo0.6000000238418579; tolerancia1e-6 corrige el arnés, fuente intacta. WebKit registra92style-src-attr y20style-src-elem durante matriz; no se afirma CSP0 ni causa nueva. No se repiten unidades completas por este cambio de presentación.

Publicación autorizada continúa vía MCP al mismo WorkerFree; entrada788efa107893a433,48rutas públicas por bytes/SHA y23inmutables previos, bindings/secret/namespace conservados, sin migración ni pagos. Dist raíz03f8 y sesión/música ajenas intactas; no se usa cuentaTelegram ni se abre pestaña real. Evidencia docs/evidence-mini-player-layout-web.json y .local/mini-player-layout; diseño design/MINI-PLAYER.md. Sin commit/push, iPhone físico ni cierreP0. Engram15 se sincroniza y verifica por lectura independiente, bytes/SHA actuales.


## Botones de regreso reconocibles · 2026-11-17

Petición IMG_6774 del propietario: mejorar visualmente los botones Volver con skillsUI/UX. Se aplican emil-design-eng y mobile-native. BackButton comparte chevronSVG decorativo, etiqueta del destino, forma redondeada, borde/superficie y tokens de tema, área mínima44px, ajuste a texto ampliado, foco3px y pulsación120ms sólo puntero; sin movimiento con reduced-motion. Se retiran cuatro reglas antiguas que imponían texto sin fondo y anulaban los estados.

Se reutiliza en álbum/artista, detalle Biblioteca, descargas/resumen almacenamiento, retorno Letra/Cola y pasos secundarios de organización. Conserva cada handler, guard, disabled y restauración de foco, sin tocar datos, red ni reproducción. Cerrar reproductor mantiene su chevron inferior; reintentos «Volver a cargar/verificar» no son navegación. El delta main se conserva como dos hunks propios; integración Spotify concurrente y su backend/configuración quedan fuera del snapshot de publicación.

Lint/build/dryrun aislados PASS, backend318422/SHAe73c6acf…1ca6f conservado. Fuente822inputs congelados; validación final Chromium/WebKit en curso. Primeras ejecuciones del arnés musical histórico fallaron antes de llegar al cambio por onboarding obligatorio y perfiles nuevos sin semilla/marker; la adaptación es TESTONLY y no desactiva el gate en producción. Un caso detectó reduced-motion anulado por especificidad CSS; se corrigió retirando reglas antiguas. Otros negativos de preparación/selector asíncrono quedan preservados. No aceptación de cuenta/Telegram real ni iPhone físico/P0global. Diseño: design/BACK-NAVIGATION.md; evidencia en .local/test-evidence/back-buttons-1b9dPe/ y reportes interface-main de cada ejecución, con finally/cleanup. Publicación aún en preparación y serializada tras almacenamiento.

Cierre local: selección final única44/44PASS Chromium154/WebKit27.2,822hashes antes/después exactos,0JS/externos,cleanuptrue. Incluye interacción previa/audio/cola/playlists y botones claros/oscuros,44px,320/390/1366/texto200%,foco/reduced-motion.108avisosCSPestilosWebKit históricos separados. Capturas móviles inspeccionadas. Primer sync MCPinitialize dioTimeout; retry en curso, no se anuncia sincronización hasta readback independiente. Publicación serializada tras almacenamiento y antes deSpotify.


## Cierre de publicación · 2026-11-17

UIBackButton quedó publicada después de la aprobación local y de la entrega de
almacenamiento, antes de cualquier publicación de Spotify. Se usó el Worker
existente `pulso-web` en Workers Free / USD 0. Se creó la versión
`26a6441e-1b21-484e-a66e-8134a96d6cbd`, activa al 100%; entrada
`/releases/5715374fd4a96362.html`. El upload adjuntó los assets congelados al
Worker sin alterar runtime/backend: readback exacto del módulo (318422 bytes,
SHA-256 `e73c6acf441d48a39dc92ed76153d49281a39f404e2cebf1cf0fac5e8121ca6f`),
siete bindings conservados, mismo Durable Object namespace y sin migración;
fecha/modelo conservados, preview URLs, observabilidad y logpush apagados. No se
leyeron ni grabaron valores de secretos.

Readback independiente MCP: versión/configuración/bindings y bytes/SHA del
módulo exactos. Readback HTTPS: 188/188 rutas estáticas con longitud/SHA
coincidentes, root y latest alineados con la entrada
`/releases/5715374fd4a96362.html`, SW exacto; `/account-config.json` devuelve
`enabled=true`, `google=true`, `no-store`; perfil y biblioteca anónimos devuelven
401 y PUT cross-origin de biblioteca devuelve 403. No se usó navegador, cuenta,
Telegram ni audio real. La validación de UI sigue siendo solo Chromium/WebKit;
iPhone físico y P0 global permanecen pendientes.

Recibos: `docs/evidence-back-navigation-web.json` y
`.local/test-evidence/back-buttons-1b9dPe/publication/`. La prueba inicial del
puente de upload terminó antes de stdin (sin cambio Worker); el primer lote fue
aceptado con HTTP 202 y el cliente se detuvo por exigir erróneamente el JWT final
en cada lote. Se ajustó a la secuencia oficial 202→201; el segundo readback de
sesión identificó solo los assets faltantes y la publicación final pasó. Sin
429/403 ni reintento de escritura.
