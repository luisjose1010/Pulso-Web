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

- Preferencia del propietario: usar un agente económico para las publicaciones en Cloudflare y las actualizaciones de Git al cerrar cambios verificados.
- Entregar los cambios de Git en una rama y una PR con problema, comportamiento resultante, validación y pendientes, para que los colaboradores puedan revisarlos.
