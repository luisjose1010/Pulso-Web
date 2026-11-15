// Serverless replacement for the Cloudflare Worker's /catalog-config.json.
// iTunes metadata is fetched straight from the browser; the Cloudflare-only artwork
// relay (Durable Object) does not exist here, so artwork:false.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('{}');
  return res.status(200).send(req.method === 'HEAD' ? '' : JSON.stringify({version: 1, itunes: false, artwork: false}));
}
