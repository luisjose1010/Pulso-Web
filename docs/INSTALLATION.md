# Instalar Pulso

En Configuración, «Instalar Pulso» ofrece «Instalar app» cuando el navegador ha habilitado su aviso. El botón abre ese aviso desde el toque, una sola vez. Si se cancela, hace falta otro permiso del navegador para volver a ofrecerlo; la app muestra las instrucciones manuales. Aceptar el aviso se informa como solicitud, sin fingir una instalación terminada.

En Chrome para Android también se puede usar ⋮ → Añadir a pantalla de inicio / Instalar aplicación. En enlaces abiertos dentro de otra app, abrir primero en Chrome. Safari permite Compartir → Añadir a pantalla de inicio. Los nombres y la disponibilidad dependen del navegador.

El manifiesto conserva identidad, ámbito y dirección de inicio en `/`; no fija una versión antigua. Los iconos192/512 y maskable512 y el manifiesto son locales. No se cambia la autorización de Telegram ni la música; no deben borrarse los datos del navegador para instalar.

Chrome puede esperar interacción/tiempo de uso antes de ofrecer el aviso. La instalación depende también de sus restricciones y no se fuerza desde JavaScript. Referencias: [criterios de Chrome](https://web.dev/articles/install-criteria) y [aviso de instalación](https://web.dev/learn/pwa/installation-prompt).

La prueba nativa local en Chromium de escritorio acepta manifiesto/iconos sin errores y emite beforeinstallprompt real, con heurísticas de interacción omitidas expresamente y perfil persistente aislado. Los12 casos de interacción usan eventos sintéticos en Chromium/WebKit. No prueban instalar un WebAPK ni completar una instalación en Android físico. El fallo exacto del botón del navegador reportado por el propietario todavía requiere confirmación en ese dispositivo. Estado de entrega en [la evidencia](evidence-android-install-web.json).
