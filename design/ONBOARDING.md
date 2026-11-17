# Primer acceso: Telegram y bots

Petición del propietario: después del registro o acceso a Pulso, completar la conexión de Telegram y elegir bots antes de usar la aplicación. No es el aviso de instalar la PWA ni el permiso de notificaciones.

| Antes | Ahora |
| --- | --- |
| El usuario registrado entraba al shell y debía encontrar Telegram en Configuración | Una página de dos pasos aparece antes del shell |
| Número, fuentes y explicación de bots convivían en un panel largo | Primero número internacional, consentimiento, código y contraseña de Telegram si se solicita |
| La selección de bots quedaba implícita al conectar | Se muestran los bots preparados; el usuario confirma o añade/quita/reordena otros |
| Se podía navegar sin terminar la conexión | Shell invisible e inert; Escape no descarta el recorrido; una selección vacía no permite terminar |

Se reutilizan el cliente y worker de Telegram, la bóveda local, sus guardas de actividad y las comprobaciones existentes de identidad de bot. Sólo el transporte de autenticación determina que Telegram está conectado: escribir el teléfono o guardar una marca no basta. El paso final verifica conexión, binding, selección no vacía y ausencia de operaciones pendientes antes de abrir el shell. Los bots predeterminados KD/Deezer del incremento anterior permanecen editables y se conservan las elecciones personalizadas.

La marca local de finalización se separa por cuenta Pulso; no contiene teléfono, código, contraseña o credenciales. Al recargar un recorrido incompleto, se restaura la sesión y se vuelve a confirmar bots. Después de completar el recorrido, una sesión guardada permite volver al shell local con el indicador de red offline sin exigir una nueva autenticación; Telegram desconectado sin sesión guardada requiere conectar de nuevo. Cambiar la cuenta Pulso no reutiliza la marca de otra cuenta. Puede cambiarse la cuenta de Telegram desde el segundo paso. Los permisos de instalar/notificar se muestran después de salir del recorrido, sin mezclarse con el primer formulario.

## Validación

- `check-required-setup.mjs`: 14/14 grupos en Chromium/WebKit, main/cliente/worker/vault/bots reales con autenticación y perfiles TESTONLY. Registro/acceso simulado por el helper de cuentas; no se crea una cuenta real. Sin requests externos, errores de página ni audio.
- Incluye entrada sin sesión Pulso, shell inert, Escape, código erróneo, 2FA, selección predeterminada, recarga antes de confirmar, lista vacía, rechazo de perfil humano, bot personalizado, persistencia, logout de Telegram, indicador offline simulado, 320/390/1366 px y texto 200 %. No es aceptación física de iPhone/Android ni prueba de red offline real.
- Un primer fallo del arnés consultaba `.inert` antes de montar el shell; se corrigió la espera. Un fallo real de WebKit con texto200% y nombre largo requería permitir reducir la columna de texto dentro de la fila. Ambos negativos se conservan.
- 797/797 unidades, lint y diff-check PASS. Capturas finales revisadas por root. Evidencia final `.local/test-evidence/required-setup-hBqcLM/report.json`.
- Cada ejecución elimina su build/fixture/perfil propios en `finally`, también en fallo. Se conservan únicamente reportes y capturas mínimas; no se accede a sesiones o música reales.

## Publicación

Publicado en `https://pulso-web.pruebassoftware.workers.dev`, entrada `/releases/9156d58182c0dfc8.html`. Deployment activo `a3b0065b-7109-4bf2-ae66-eaa142514aac`, versión `cce8446a-df18-4f86-9a33-5f7cc44046c7`, al100%. Worker exacto318422bytes/SHA-256 `e73c6acf441d48a39dc92ed76153d49281a39f404e2cebf1cf0fac5e8121ca6f`, siete bindings conservados, workers.dev activo y previews apagadas. MCP oficial, Workers Free/USD0; sin secretos leídos, migraciones o cambios de cuentas.

Readback HTTPS178/178 rutas estáticas por bytes/SHA; raíz/latest/entry/SW alineados y account-config200/no-store, enabled/google true. Root comparó independientemente esos recursos y cuatro entradas históricas contra el manifiesto. La unión de inmutables confirmados recupera recursos ausentes de la publicación anterior: bytes exactos reconstruidos desde commits8ad2033/ef6150a/f98266f y referencias de chunks, comprobados por SHA completo antes de publicar. No se omitieron entradas por su redirección .html→ruta normalizada.

Recibos privados `.local/test-evidence/required-setup-release-20261117/publication/` y `.local/test-evidence/required-setup-hBqcLM/`. Las pruebas de transporte/autenticación siguen siendo sintéticas; la publicación HTTP no acredita interacción con Telegram real o teléfonos físicos.

Limpieza: retirados128.733.198bytes de snapshots de recuperación, traspaso temporal y candidato de publicación, además de los temporales de las pruebas y logs propios. Se conserva evidencia mínima. `/data` queda con aproximadamente4,6GiB libres; el delta total incluye actividad concurrente y no se atribuye a esta tarea.
