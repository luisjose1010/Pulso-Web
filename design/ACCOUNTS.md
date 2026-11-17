# Acceso administrado con el diseño de Pulso

Se usan los formularios editables de Better Auth UI recomendados por Neon: acceso, registro, verificación por código y recuperación. El proveedor administrado conserva usuarios, contraseñas, sesiones y OAuth. Pulso añade el diálogo, la navegación interna y el tema; no implementa un servidor de contraseñas.

| Antes | Después |
| --- | --- |
| Formularios propios que mantener | Formularios de Better Auth UI con commit y licencia originales registrados |
| Colores particulares del acceso | Variables visuales de Pulso para tema claro y oscuro |
| Flujo separado de mensajes | Español, errores cerrados y avisos dentro del diálogo |
| Estilos generados en línea para el OTP | Hoja estática del mismo origen, conservando la política de seguridad |

Las utilidades de Tailwind se limitan a `.account-kit` y se omite su reset global. El módulo se carga al abrir el acceso habilitado. Se mantienen controles táctiles de 44px, inputs de al menos 16px, foco del diálogo, Escape y retorno al botón de apertura. Las contraseñas/códigos se restablecen tras enviar; cerrar desmonta los formularios y sus borradores. La actualización automática se bloquea con el diálogo abierto o una acción pendiente.

Validación del candidato de cuentas separado del trabajo de singles: 18/18 recorridos en Chromium154/WebKit27.2 con API TESTONLY y SDK real; 38/38 interfaz/playlist, incluidos login y logout con el mismo audio nativo reproduciendo y organización/copias locales sin cambios. Se comprobó ancho 320/1366 y texto al 200%. Los avisos `style-src-attr` de WebKit quedan registrados; no se afirma CSP global cero. Los recorridos de cuentas rechazan violaciones de script o estilos de elemento; se configuró Zod sin JIT antes del SDK y se evitó la inyección CSS del OTP.

No es aceptación de teclado táctil, Safari/iPhone físico ni autenticación real. Neon está preparado; el acceso público no se activa hasta configurar Google propio, correo de producción y probar los recorridos reales. No se modifica la sesión Telegram ni se añade sincronización musical por cuenta. Fuentes: [Neon UI](https://neon.com/docs/auth/reference/ui-components), [Better Auth UI](https://better-auth-ui.com/docs/shadcn), `src/ui/account-kit/UPSTREAM.json` y su licencia MIT original.
