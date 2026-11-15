# Pulso en Vercel (rama `luis/vercel`)

Alternativa a `docs/CLOUDFLARE.md` sin Workers ni Durable Objects. No pertenece al despliegue de upstream.

- Estático: `npm run build` → `dist/` (Vercel lo sirve).
- `vercel.json`: replica las cabeceras CSP del Worker (documento, `session.worker-*` con WSS de Telegram y `wasm-unsafe-eval`, `sw.js` con `Service-Worker-Allowed`) y reescribe `/telegram-config.json` y `/catalog-config.json` a funciones.
- `api/telegram-config.js`: devuelve `{api_id, api_hash}` desde la variable `TELEGRAM_API_IDENTITY` (JSON `{"api_id":123,"api_hash":"<32 hex>"}`). Identidad de aplicación propia de quien despliega (my.telegram.org); legible por los visitantes, no contiene sesión.
- `api/catalog-config.js`: `itunes:false, artwork:false`. Sin relay de portadas Cloudflare; los metadatos iTunes van directo del navegador y las portadas dependen de lo que el cliente ya resuelve.

## Desplegar

```sh
npx vercel login
npx vercel link            # proyecto nuevo
npx vercel env add TELEGRAM_API_IDENTITY production
npx vercel deploy --prod
```

Cada despliegue reemplaza los assets: pestañas con una versión vieja abierta pueden pedir hashes que ya no existen hasta recargar. No se retienen inmutables como en Cloudflare.
