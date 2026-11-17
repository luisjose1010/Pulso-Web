# Retención de pruebas y limpieza local

Se aplica la sección «Espacio de disco y limpieza de pruebas» de AGENTS.md, añadida por el propietario. No se modifica esa instrucción. La limpieza no autoriza despliegues, cambios en otros servicios ni eliminación de música o sesiones reales.

## Limpieza del 17 de noviembre de 2026

Se inventariaron y retiraron 381 directorios concretos: compilaciones antiguas de más de siete días con fuentes conservadas, bundles de las pruebas de interfaz terminadas y perfiles WebKit exclusivamente sintéticos. Se comprobaron rutas reales, dispositivo/montajes, ausencia de archivos versionados y referencias de procesos mediante cwd, descriptores, mapas y argumentos. No se siguieron enlaces. Cada ruta tiene un manifiesto de tamaños/SHA-256 conservado antes de retirarla.

Siete reportes R98 incluían copias repetidas de los bytes de audio sintético del arnés. Se conservaron todas las propiedades de evidencia, resultados y fallos; sólo los objetos de bytes de `chunks` se sustituyeron por tamaño y SHA-256. También se conservaron el tamaño/hash del reporte original y los de la versión compacta. No se convierte ningún fallo histórico en PASS.

Resultado aproximado: `.local` pasó de **9,5 GiB a 7,6 GiB**; espacio libre de `/data`, de **2,5 GiB a 4,4 GiB** (las herramientas con redondeo muestran 2,6 y 4,5). Recuperación de aproximadamente **1,9 GiB**. Los bytes exactos y la variación concurrente del volumen se registran en el resumen privado.

Se conservaron Engram, perfiles/sesiones reales, credenciales, código fuente original, fuentes históricas necesarias para reproducir fallos, publicaciones y sus recibos, dependencias del paquete portátil cuya reproducción exige conservarlas, y `.local/review/iphone-v1`, servido por un proceso activo. Otros artefactos recientes o de función no confirmada no se consideran desechables por su nombre. La limpieza es selectiva; no acredita que toda la evidencia histórica restante cumpla ya el presupuesto de 200 MiB.

Inventario, lista exacta de eliminaciones, manifiestos comprimidos y compactaciones: `.local/cleanup-20261117/`. El inventario restante está en `remaining-kib.tsv`. No contiene música ni credenciales exportadas.

## Prevención comprobada

Estos tres ejecutores usan ahora `tests/integration/test-workspace.mjs`:

- `check-notification-settings.mjs`.
- `check-download-feedback.mjs`.
- `check-interface-main.mjs`, incluido el perfil sintético de `playlist-detail-cases.mjs`.

Cada ejecución crea su propio directorio `.local/tmp/<tarea>-<id>/`. Fixtures, bundles, copias de código y perfiles sintéticos viven allí. El cierre del navegador y del servidor precede a la eliminación en `finally`; un fallo comunicado al cerrar el servidor conserva la ruta y hace fallar el informe. Los resultados y capturas van a `.local/test-evidence/<tarea>-<id>/`, separados de los temporales. Las entradas congeladas suministradas por el coordinador no pertenecen al ejecutor y no se eliminan con él.

El helper comprueba al menos 2 GiB libres antes de comenzar, registra espacio antes/después y rechaza rutas alteradas o montajes al limpiar. El almacén nuevo de evidencia tiene límite de admisión de 200 MiB; una ejecución que supera 20 MiB se marca como fallo para revisión, conservando su evidencia. No elimina automáticamente evidencia única ni promete controlar los otros ejecutores heredados o procesos concurrentes.

Validación: notificaciones **11/11**, descargas **8/8**, interfaz integrada **20/20** en Chromium/WebKit. Cada ejecutor también se ejecutó con `PULSO_TEST_FAIL_AFTER_BUILD=1`: falló deliberadamente y eliminó sus temporales. Se comprobó la ausencia física de sus directorios, no sólo un campo del informe. Los cambios finales de manejo de error de cierre se revalidaron con las pruebas focales y las tres inyecciones de fallo. Lint y `git diff --check` aprobados. Evidencia pequeña en `.local/test-evidence/`; no se declara limpieza automática para todas las pruebas del repositorio. No hubo publicación adicional.
