// This deployment has no account service (Neon/Better Auth live in the Cloudflare Worker).
// `local:true` tells the app to run as one fixed local profile instead of asking for a Pulso account.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('{}');
  return res.status(200).send(req.method === 'HEAD' ? '' : JSON.stringify({version: 1, enabled: false, google: false, local: true}));
}
