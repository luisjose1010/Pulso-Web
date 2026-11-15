// Serverless replacement for the Cloudflare Worker's /telegram-config.json.
// Returns only the Telegram *application* identity (api_id/api_hash) from the
// TELEGRAM_API_IDENTITY env var, e.g. {"api_id":123456,"api_hash":"<32 hex chars>"}.
// Visitors can read it by design (browser-only client); it holds no session or secret key.
function parse(text) {
  if (typeof text !== 'string' || text.length > 4096) return null;
  try {
    const value = JSON.parse(text);
    const keys = Object.keys(value ?? {});
    if (keys.length !== 2 || !keys.includes('api_id') || !keys.includes('api_hash')) return null;
    const apiId = Number(value.api_id);
    if (!Number.isSafeInteger(apiId) || apiId < 1 || apiId > 2147483647) return null;
    if (typeof value.api_hash !== 'string' || !/^[0-9a-fA-F]{32}$/.test(value.api_hash)) return null;
    return {api_id: apiId, api_hash: value.api_hash.toLowerCase()};
  } catch {
    return null;
  }
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('{}');
  const config = parse(process.env.TELEGRAM_API_IDENTITY);
  if (!config) return res.status(503).send('{}');
  return res.status(200).send(req.method === 'HEAD' ? '' : JSON.stringify(config));
}
