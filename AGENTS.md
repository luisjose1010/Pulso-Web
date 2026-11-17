# Pulso Web: trabajo y memoria local

Leer PULSO-WEB-README.md, doc/SPEC.md y la tarea ODD aplicable antes de trabajar. SPEC.md y README.md en raiz son enlaces a los documentos canonicos. Metodo: ODD + Engram local; no RDD/OpenDesign.

## Protocolo obligatorio de memoria

- Identidad exclusiva: `Pulso-Web` (Engram canoniza `pulso-web`). Base persistente propia: `.local/engram/`. Configuracion de contexto: `.engram/config.json`.
- Al retomar, leer `odd/tasks/P0-W.md` y las tareas aplicables; ejecutar `python3 scripts/sync_odd_memory.py --read-only`. Debe devolver `FullContentVerified: true` para todos los archivos. Ante diferencias, investigar; no sobrescribir memoria para esconder una divergencia.
- Despues de cambios autorizados en ODD, ejecutar `python3 scripts/sync_odd_memory.py` y luego, en otra invocacion, `python3 scripts/sync_odd_memory.py --read-only`. Verificar proyecto, contenido completo, cantidad de bytes y SHA-256. No anunciar sincronizacion si falla.
- El helper conserva manifiestos y partes verificadas por MCP oficial, con un bloqueo del proyecto y recibos privados. Los Markdown y el codigo conservan autoridad.
- MCP nativo: `engram_pulso_web` en `.codex/config.toml`; ejecuta `python3 scripts/engram_local.py`. Si la sesion ya abierta no recarga herramientas, utilizar el helper inmediatamente: tambien llama al MCP oficial y no requiere reiniciar T3.
- Guardar decisiones, causas y evidencia local. No guardar credenciales, sesiones, chats privados, datos reales de Telegram, audio ni secretos. No usar bases globales, de Music_Telegram, otro proyecto o Engram Cloud. No ejecutar `engram setup` global ni inscripciones Cloud.
- `.local/` y `.tools/` quedan fuera de Git. Engram no es dependencia del producto ni forma parte del bundle.

## Alcance y evidencia

USD 0. Trabajar solo en este proyecto; no modificar servicios ajenos. Pruebas locales pueden usar loopback temporal. Publicacion HTTPS, cuentas reales y permisos sensibles requieren autorizacion aplicable. Local, navegador e iPhone fisico se registran separados. No convertir un pendiente en PASS ni declarar P0-W completo por un piloto o build.

## Entregas y colaboración

- Indicación expresa del propietario (2026-11-17): publicar en Cloudflare los cambios verificados de Pulso al cerrar la entrega, además de Git/PR; no dejar una entrega autorizada sólo en local o en la PR ni volver a pedir la misma autorización. Conservar USD 0, configuración y datos existentes, verificar la versión pública y registrar el resultado. Esta preferencia no autoriza cambios de infraestructura, servicios ajenos ni publicar trabajo que no haya pasado sus verificaciones.

- Preferencia del propietario: usar un agente económico para las publicaciones en Cloudflare y las actualizaciones de Git al cerrar cambios verificados.
- Entregar los cambios de Git en una rama y una PR con problema, comportamiento resultante, validación y pendientes, para que los colaboradores puedan revisarlos.

## Espacio de disco y limpieza de pruebas

- Al terminar cada prueba, tanto si pasa como si falla, eliminar sus canciones descargadas o generadas, audios sinteticos, perfiles temporales de navegador, copias de codigo, compilaciones y dependencias duplicadas creadas exclusivamente para esa prueba. Usar directorios propios en `.local/tmp/<tarea>-<id>/` y limpieza en `finally`/teardown; no dejar archivos de prueba como almacenamiento permanente.
- Conservar solo evidencia minima: resultado, comandos, hashes, causa del fallo y capturas imprescindibles. Evitar reportes JSON que incrusten canciones, binarios, bundles completos o estados repetidos. Presupuesto normal: 20 MiB de evidencia por ejecucion y 200 MiB de evidencia temporal total; si una prueba necesita superar ese limite, justificarlo y limpiar sus archivos pesados al concluir. No sacrificar evidencia unica de un fallo sin conservar primero un resumen verificable.
- Revisar y retirar artefactos regenerables de pruebas antiguas de mas de 7 dias que no esten en uso ni sean necesarios para una regresion pendiente. La limpieza de estos artefactos del proyecto queda autorizada: inventariar rutas y tamanos, usar una lista explicita de destinos y comprobar sus rutas reales antes de borrar; no seguir enlaces ni cruzar montajes, y nunca borrar `.local/` entera. Los archivos pesados de la prueba actual se eliminan al terminar, sin esperar esos 7 dias.
- NO borrar canciones de la biblioteca real del usuario, descargas personales, sesiones de Telegram, credenciales, conversaciones de T3/Codex, bases de datos de la aplicacion, `.local/engram/`, `.engram/`, `.tools/`, archivos versionados ni material usado por procesos activos. Una carpeta no es descartable solo por llamarse temporal: comprobar su funcion. Si hay duda entre un audio real y uno de prueba, conservarlo y pedir aclaracion.
- Medir el espacio libre de `/data` antes y despues de las pruebas y de la limpieza. Con menos de 2 GiB disponibles, liberar primero artefactos propios verificadamente regenerables y no iniciar pruebas que puedan agotar el volumen. No modificar servicios ni datos de otros proyectos para conseguir espacio.
- Al cerrar cada tarea, informar brevemente de lo eliminado, el espacio recuperado y los artefactos conservados por una razon concreta. No declarar que la limpieza es automatica hasta comprobar el teardown real de las pruebas afectadas.
