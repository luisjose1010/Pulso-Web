# Navegación de regreso

Aplicación de las skills `emil-design-eng` y `mobile-native` a la petición IMG_6774. Se mantiene cada callback, guarda y retorno de foco existente.

| Antes | Después | Motivo |
| --- | --- | --- |
| «Volver a búsqueda» parecía texto suelto | Botón compacto redondeado con chevron SVG y destino visible | Reconocer la acción y su dirección de inmediato |
| Flechas de texto y estilos diferentes por vista | Un componente BackButton para álbum, artista, Biblioteca, almacenamiento y regreso desde Letra/Cola | Mantener el mismo lenguaje visual |
| Reglas transparentes específicas anulaban estados | Estilo compartido con foco visible, pulsación breve y movimiento reducido | Dar feedback consistente con ratón, teclado y tacto |

Área mínima de 44 × 44 CSS px, altura adaptable al texto, etiqueta que puede envolver sin desbordar, icono decorativo fuera del nombre accesible. Tema claro/oscuro mediante los tokens actuales de Pulso. Hover sólo con puntero fino que lo permita; sin retrasar la navegación. La pulsación reduce la escala al 98 % durante 120 ms; se elimina con movimiento reducido. No se desactiva el zoom. Las flechas se adaptan a dirección RTL.

El control de cerrar el reproductor conserva su chevron hacia abajo: es una acción de cierre, distinta del retorno entre pantallas. «Volver a cargar portada/letras» y «Volver a verificar» son reintentos y conservan su presentación funcional.

Validación en curso con datos y autorización TESTONLY, sin cuentas, Telegram ni música reales. Chromium y WebKit de escritorio no sustituyen la aceptación en un iPhone físico. Las primeras ejecuciones del arnés histórico quedaron conservadas: faltaba preparar el onboarding obligatorio en sus contextos nuevos y cancelar el buscador móvil antes de acceder a Configuración. Una ejecución detectó una prioridad CSS que anulaba movimiento reducido; se retiraron las reglas antiguas y se conserva el negativo.

Cierre local: 44/44 grupos Chromium154/WebKit27.2 PASS en una selección final única,822inputs idénticos antes/después,0pageerrors/externos observados y cleanup confirmado. Incluye geometría de regreso320/390/1366px, texto200% comprobado por CSSOM, temas claro/oscuro, SVG, teclado y reduced-motion, navegación/foco/audio único y playlists. WebKit conserva108avisos históricos de estilo CSP; no se afirma CSP0. Capturas móviles finales revisadas. Lint/build/dryrun aislados PASS; no se repiten unidades generales por presentación. Fuente/publicación separada de Spotify concurrente.

## Publicación verificada · 2026-11-17

Se publicó la copia congelada que contiene los botones Volver aprobados, sin
incorporar el trabajo concurrente de Spotify. Worker `pulso-web`, versión
`26a6441e-1b21-484e-a66e-8134a96d6cbd` (100%); entrada
`/releases/5715374fd4a96362.html`. La versión conserva el módulo Worker exacto
(318422 bytes, SHA-256 `e73c6acf441d48a39dc92ed76153d49281a39f404e2cebf1cf0fac5e8121ca6f`),
sus siete bindings, fecha y modelo de compatibilidad, y previews apagados.
No hubo migración ni lectura/escritura de valores secretos.

Readback MCP verificó módulo, bindings y configuración; el readback HTTPS
verificó las 188 rutas estáticas por longitud y SHA-256, la entrada/latest/SW,
configuración de cuenta `enabled`/`google` y los rechazos anónimos/cross-origin.
El recibo completo está en
[`docs/evidence-back-navigation-web.json`](../docs/evidence-back-navigation-web.json);
los datos detallados permanecen en `.local/test-evidence/back-buttons-1b9dPe/publication/`.
La aceptación de cuenta/Telegram real y la aceptación física en iPhone siguen
pendientes; esta publicación no cambia esos estados.
