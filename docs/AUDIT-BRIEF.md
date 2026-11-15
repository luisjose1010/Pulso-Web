# Brief de auditoría — fork de Luis (`luisjose1010/Pulso-Web`)

Para una sesión de revisión independiente (Fable). Lee esto primero; todo lo demás sale de `git`.

## Qué es y qué se audita

Pulso Web es la web de música de Alegark (upstream: `Alegark/Pulso-Web`). Luis mantiene un fork para usarla y contribuir. **El código de upstream no es el objeto de la auditoría**; sí lo es el delta:

```sh
git fetch upstream
git diff upstream/main..luis/vercel          # 24 archivos, ~760 líneas
git log --oneline --no-merges upstream/main..luis/vercel
```

Ramas: `luis/main` (integración, sin Vercel) · `luis/vercel` (= main + despliegue) · `feat/*` y `fix/*` (ramas limpias por cambio, candidatas a PR para Alegark). Etiqueta del estado auditado: `audit-baseline`.

Despliegue de prueba en producción: https://pulso-web-orpin.vercel.app (proyecto Vercel `pulso-web`, cuenta del dueño, plan a confirmar que es Hobby).

## Base verificada (2026-11-15, Windows 11, Node 22)

- `npm ci --force` (devDep linux-only), `typecheck`, `lint`: sin errores.
- `tests/unit`: **708/708**. `test:cloudflare`: 8/8. `build`: OK.
- Navegador real (Edge) verificó la interfaz de importar hasta la página de lote. **No** se probó descarga real por Telegram: la sesión es del dueño y no se delega.

## Cambios y qué mirar (por riesgo)

| # | Cambio | Archivos | Preguntas para el auditor |
|---|---|---|---|
| 1 | Función que lee playlists de YouTube | `api/youtube-playlist.js`, `src/library/youtube-playlist.ts` | Abuso de cuota: la defensa es `Sec-Fetch-Site: same-origin`, falsificable por un cliente no-navegador. ¿Suficiente? ¿Hace falta rate limit por IP, token firmado o Vercel Firewall? Caché `s-maxage=600` en 200: ¿puede servir datos de otra petición? La clave viaja en la query hacia Google: ¿se filtra en algún log? ¿Algún error devuelve la clave o IDs de video? |
| 2 | Endpoints de configuración | `api/telegram-config.js`, `api/catalog-config.js`, `vercel.json` | `api_id/api_hash` quedan legibles por cualquier visitante (diseño upstream, mismo modelo que Cloudflare). ¿Está bien documentado? Orden de reglas de cabeceras en `vercel.json`: se comprobó en vivo `/`, `sw.js` y `session.worker-*`; **no** `/releases/*.html`, `try.html`, `web.html`. ¿La CSP del worker de Telegram se aplica siempre? |
| 3 | Importar lista de canciones | `src/library/playlist-import.ts`, `src/ui/PlaylistImportPanel.tsx`, `AlbumPageController.tsx`, `MusicSearchController.tsx`, `album-acquisition.ts`, `album-catalog.ts` | (a) Ids sintéticos `lrclib:9…` de 14 dígitos para canciones sin ficha de catálogo: ¿colisión con ids reales de lrclib o entre canciones? ¿Es válido que `songChoiceKey` los acepte? (b) Esas pistas tienen `album:null` y `duration:null`: `selected-song.ts` (~línea 83) usa `choice.duration!` para artwork. ¿Rompe o muestra metadatos pobres? (c) Todas las importaciones comparten `PLAYLIST_EDITION_ID` en el coordinador (`rows` por id): ¿una segunda importación pisa el progreso de la primera? (d) `draft` a nivel de módulo en el panel. (e) `acquireAlbum` se detiene en la primera fila `uncertain`: ¿es aceptable para lotes de 30? |
| 4 | Ranking por calidad | `src/telegram/bot-search-protocol.ts` (`matchingSongRows`), `tests/unit/song-quality-ranking.test.ts` | Orden nuevo: descargable > duración > tramo de bitrate (≥256/160/96 kbps) > orden del bot. ¿Los umbrales son razonables? ¿Una pista con duración 1 s mayor pero bitrate mayor debería ganar? Nunca se probó contra un bot real (AnsMusicBot); es una mejora razonada con datos sintéticos. |
| 5 | Portabilidad y higiene | `scripts/chromium-launch.mjs`, `scripts/telegram-source.mjs`, `.gitattributes`, `.gitignore` | `.vercel/` (ids de proyecto, no credenciales) quedó en commits antiguos de `luis/main` y `luis/vercel`; ya no se rastrea. ¿Reescribir historial o aceptarlo? |

## Fuera de alcance / no tocar

- El código de Alegark, salvo el delta anterior. No abrir PR a upstream sin que Luis lo pida.
- Secretos: no hay ninguno en el repo. Variables en Vercel (solo nombres): `TELEGRAM_API_IDENTITY`, `YOUTUBE_API_KEY`. La sesión de Telegram vive en el navegador del dueño.
- La descarga real por Telegram y el uso en iPhone/Safari están sin aceptar (igual que upstream P0-W).

## Decisiones abiertas (de Luis)

1. Sincronizar nombres/ids de la biblioteca entre dispositivos (sin audio): requeriría una base de datos (p. ej. Neon) y login; hoy no hay ninguna, todo vive en el navegador.
2. Qué mandar a Alegark como PR: `fix/windows-portability`, `fix/gitattributes-qr-code`, `feat/song-quality-ranking` y, si quiere, el importador. Cada rama debería rehacerse desde `upstream/main` con solo su cambio.
3. Conectar el repo de GitHub a Vercel para auto-despliegue (hoy se despliega a mano con `vercel deploy --prod`).

## Cómo reproducir

```sh
npm ci --force
npm run typecheck && npm run lint
npx tsx --test tests/unit/*.test.ts      # ~2 min en Windows
npm run test:cloudflare
npm run build
npx --no-install vite preview --host 127.0.0.1 --port 4173 --strictPort
```

Contexto adicional: `SPEC.md` en la carpeta padre (`Pulso Web/`), `docs/VERCEL.md`, `doc/SPEC.md` y `STATUS.md` de upstream.

## Resultado de la auditoría · 2026-11-15 (sobre `audit-baseline`)

Corregido (commit posterior a la etiqueta):
- **Ranking**: Telegram da la duración en segundos enteros y el catálogo en milisegundos; una diferencia de décimas decidía antes que la calidad. Ahora la calidad decide dentro del mismo segundo entero.
- **Lote importado**: dos canciones de álbumes distintos podían compartir `disco:pista` y con ello la `key` de React de la fila. La `key` incluye ahora `trackId`.

Revisado sin cambios:
- Cabeceras en vivo correctas en `/`, `try/web/listen/pilot.html`, `/releases/*`, `session.worker-*`, `sw.js`, `/api/*`.
- Canciones sin ficha (`lrclib:9…`, álbum y duración nulos): clave, alias, guardado y verificación de etiquetas de upstream ya admiten ese caso. Sin colisión práctica de ids.
- `PLAYLIST_EDITION_ID` compartido: el coordinador compara la lista de pistas y reinicia filas si difiere; una importación nueva no hereda estados de otra.
- Función de YouTube: no devuelve la clave ni ids; errores cerrados. Una respuesta 200 en caché se sirve también sin la cabecera `Sec-Fetch-Site` (no gasta cuota; son datos públicos).

Riesgos aceptados / abiertos:
- La cabecera `Sec-Fetch-Site` es falsificable: alguien decidido puede agotar la cuota diaria de YouTube (unas 330 playlists grandes). Efecto: el campo de enlace falla hasta el día siguiente; sin coste.
- En el lote importado las filas muestran «Disco 1, pista N» del álbum de origen (cosmético).
- Al abrir un lote, el cuadro conserva solo las líneas restantes; las de la tanda abierta y la lista de no preparadas dejan de verse.
- Descarga real por Telegram, bots reales e iPhone: sin probar.
- `.vercel/` (ids, no credenciales) sigue en commits antiguos.
