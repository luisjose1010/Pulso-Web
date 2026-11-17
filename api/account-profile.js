// Vercel has no account database. The local profile has no saved Telegram phone:
// answer the app's preference read with "none" instead of a 404. Writes are not stored.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(503).send('{"code":"PROFILE_UNAVAILABLE"}');
  return res.status(200).send(JSON.stringify({accountId: 'local-profile', telegramPhone: null, revision: null}));
}
