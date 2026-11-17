# Configuración, mensajes y acciones de canciones

Revisión solicitada por el propietario: información útil a primera vista, menos texto técnico en los recorridos habituales y ninguna pantalla de configuración que crezca con toda la biblioteca.

| Antes | Después | Motivo |
| --- | --- | --- |
| Almacenamiento cerrado entre varios desplegables | Primera tarjeta de General, con total y categorías visibles | Ver el espacio ocupado sin buscarlo |
| Todas las descargas renderizadas al abrir su apartado | Gestión separada con búsqueda y ocho archivos por página | Un centenar de canciones no crea una lista interminable |
| Apariencia dentro del diagnóstico | Selector de apariencia visible en General | Ajuste habitual separado de herramientas técnicas |
| Conexión, controles de pestañas, respaldo y diagnóstico mezclados | General, Conexiones y Herramientas | Separación por finalidad sin desplegables anidados para todo |
| Revisión de eliminación como bloque entre otras secciones | Diálogo nativo centrado en web y hoja inferior en móvil | Mantener el contexto y contener mensaje, consentimiento y acciones |
| Subopciones que alargan el menú de canción | Una vista de opciones a la vez con vuelta explícita | Jerarquía clara sin empujar filas o mezclar formularios |

Se mantienen las guardas de propietario, revisión, consentimiento y conservación de copias en uso. La cuota estimada del navegador se presenta como información secundaria y nunca como espacio libre del teléfono. Las herramientas avanzadas permanecen disponibles; no se eliminan funciones por preferencia visual.

La interfaz de pruebas incluye cien descargas sintéticas sin audio y una prueba integrada con cinco WAV propios en un contexto aislado. El arnés usa `.local/tmp`, cierra navegador/servidor y elimina bundle, fixtures y perfiles en `finally`; sólo conserva informe y capturas. No se accede a la biblioteca real. Safari/iPhone físico y aceptación del propietario siguen separados de Chromium/WebKit en Linux.

## Validación del incremento

- `check-settings-design.mjs`: 8/8 grupos PASS en Chromium/WebKit, con cien archivos sintéticos, límite de ocho filas, búsqueda sin coincidencias, navegación, Apariencia, retorno de submenú, consentimiento y cancelación. Geometría de la app integrada a 390/1366 px y 320 px con texto200%. Capturas inspeccionadas por root; preview propia cerrada.
- `check-interface-main.mjs` con `PLAYLIST_DETAIL=1 PLAYLIST_ONLY=1`: 20/20 grupos PASS; 287 fuentes congeladas verificadas antes/después. Reordenar, añadir/quitar canciones, cola, carátula Media Session, apertura/cierre y geometría móvil/escritorio. Se conserva el registro de advertencias CSP `style-src-attr` de WebKit; no se declara CSP global limpia.
- El primer arnés no regresaba al menú principal tras añadir a playlist; se actualizó al recorrido nuevo. La segunda ejecución reveló un fallo real: reordenar mueve el nodo del diálogo fuera de la capa modal del navegador aunque conserve `open`. Se restaura su modalidad antes de pintar. La tercera ejecución pasó20/20; no se sustituyen ni borran los resultados negativos.
- Eliminación integrada con IDB, escenario álbum primero: PASS; se conserva el audio compartido y se retira la copia exclusiva. Se usó el arnés funcional concurrente sin modificarlo. Sus cambios de lógica/panel no se incluyen en esta entrega UI.
- Lint y diff-check PASS. No se modifican la lógica de eliminación, sus guardas o el estado funcional concurrente. No se publica este incremento en Cloudflare; quedan aceptación del propietario y comprobación física en teléfono.

Recibos privados: `.local/test-evidence/settings-design-lR4i4R/report.json`, `.local/test-evidence/interface-main-fErLAb/report.json`, `.local/test-evidence/collection-current-wpcmLK/report.json`. Los reportes incluyen la limpieza; temporales eliminados también en las ejecuciones negativas. Los perfiles auténticos, Engram y la biblioteca real permanecen intactos.

## Instalación y bienvenida móvil

Por indicación del propietario, las tarjetas de instalación y el aviso de notificaciones se retiran de Configuración. En teléfonos, un banner superior persistente abre instrucciones de Safari/iPhone o Chrome/Android. También está disponible antes del acceso a la cuenta. El navegador conserva la decisión y confirmación de instalación; no se guarda una bandera que afirme falsamente que la app continúa instalada.

Al abrir Pulso en modo instalado, o recibir la confirmación de instalación en Android, una burbuja ofrece activar las notificaciones compatibles. El permiso nativo sólo se solicita desde el botón del usuario. «Ahora no» conserva su respuesta sin repetir la invitación; los permisos denegados o capacidades ausentes no generan peticiones. Desktop no muestra estos avisos.

`check-mobile-install.mjs`: 14/14 perfiles Chromium/WebKit PASS (desktop, iPhone/Android en navegador e instalados, denegación y aplazamiento), sin permiso automático. Incluye cierre/Escape, instrucciones a320px/texto200%, evento de instalación y persistencia de respuesta tras recarga. APIs/permisos simulados; no acredita instalación o notificaciones en teléfonos físicos. Se usa el teardown verificado de `.local/tmp`, sin audio ni perfiles reales.

Regresión de Configuración tras este cambio: 8/8 PASS en Chromium/WebKit; lint y diff-check PASS. Recibos privados: `.local/test-evidence/mobile-install-vDEPDd/report.json` y `.local/test-evidence/settings-design-vWGahF/report.json`. Ambos confirman eliminación de sus temporales. Sin publicación en Cloudflare.
