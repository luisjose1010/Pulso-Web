# Alternativas de metadatos y portadas · 2026-11-15

La petición del propietario es evaluar alternativas gratuitas a iTunes para el catálogo de Pulso. Este estudio trata información y portadas; no añade una fuente de audio ni cambia los bots.

MusicBrainz es el candidato de respaldo mejor fundamentado en esta revisión. Su API ofrece artistas, grabaciones, grupos de álbumes, ediciones y listas de pistas. No exige API key para esos datos públicos y su uso no comercial es gratuito; el uso comercial tiene condiciones propias. Exige identificar la aplicación y no superar una consulta por segundo. En Pulso convendría acceder mediante el Worker existente, con un User-Agent de contacto real, cola compartida, caché y respeto de errores/cooldown. No requiere por sí mismo contratar otro servicio; aún no está integrado ni se ha probado una ruta de Cloudflare hacia este proveedor.

La edición pública de MOSCA de Nsqk consta de17pistas y una portada en MusicBrainz. Esto demuestra presencia en ese catálogo, no equivalencia con todos los créditos/ediciones de Apple ni disponibilidad de sus audios en los bots. Su identificador UUID debe conservar el prefijo MusicBrainz; nunca hacerse pasar por un ID iTunes ni usarse para fusionar automáticamente archivos.

Cover Art Archive complementa MusicBrainz para portadas por identidad de edición o grupo de álbumes. Puede responder404 si falta una portada y utiliza redirecciones documentadas; un adaptador tendría que validar los hosts y límites antes de entregar imágenes. La API disponible no implica derechos generales sobre cada imagen. Tampoco está integrado.

Deezer tiene documentación histórica de una API de álbumes, artistas, búsquedas y pistas. El portal y endpoint consultados no resultaron accesibles con la herramienta de investigación usada; esto no demuestra una caída general. No se declara validada hoy su disponibilidad, admisión de nuevas aplicaciones ni uso en Safari/Cloudflare, y no se elige como sustituto sólo por un documento antiguo.

Last.fm documenta búsqueda e información de álbumes, pero exige API key y condiciones de atribución/uso comercial. No se creó cuenta ni se pidió una clave durante esta evaluación; queda como alternativa posterior, no como sustitución ya probada.

La reparación actual de Safari conserva iTunes y elimina únicamente el selector redundante media=music en las búsquedas directas que ya fijan entity=album/song/musicArtist. WebKit reproducía una redirección al esquema nativo musics:// con ese selector; sin él devuelve JSON, carátulas y las17pistas de MOSCA. Se mantienen redirect:error, país US, consulta, límites, cancelación y cadencia. Los ensayos de seguir redirecciones, Accept JSON, callback como texto y orden/espacios de parámetros no solucionaron por sí solos el conjunto y se conservaron como negativos privados. No se ejecuta código remoto ni JSONP.

Fuentes primarias consultadas:

- [API de MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API).
- [Límites e identificación](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).
- [MOSCA: edición y17pistas](https://musicbrainz.org/release/266569e4-3060-4f70-be69-beac84d12023).
- [Cover Art Archive API](https://musicbrainz.org/doc/Cover_Art_Archive/API).
- [Términos históricos de Deezer Developers](https://cdn-content.dzcdn.net/pdf/CGU-developers.pdf).
- [Last.fm: información de álbumes](https://www.last.fm/api/show/album.getInfo).
- [Last.fm: términos de API](https://www.last.fm/api/tos).
- [Search API de Apple](https://performance-partners.apple.com/search-api).

El contracontrol inicial se ejecutó contra la web publicada con una sustitución explícita de opciones de red; es diagnóstico, no aceptación de una versión reparada. La aceptación posterior debe usar el bundle publicado sin sustituciones. WebKit de Linux no acredita Safari en un iPhone físico. La sesión real del propietario se conserva en otro perfil y no se copia a las pruebas aisladas.


Actualización 2026-11-16: MusicBrainz se integra como respaldo, manteniendo iTunes como principal. La investigación histórica anterior se conserva; el contrato, las pruebas y los límites actuales están en [Álbumes y artistas](ALBUMS-AND-ARTISTS.md#2026-11-16--musicbrainz-como-respaldo-de-álbumes). No se cambian las fuentes de audio.
