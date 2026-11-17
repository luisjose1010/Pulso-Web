// Vercel port of Diego's Cloudflare route /api/spotify-playlist/<id>: same parser and guards
// (deployment/cloudflare/spotify-playlist.mjs), run through the platform Request/Response.
import {spotifyPlaylist} from '../../deployment/cloudflare/spotify-playlist.mjs';

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
  const url = new URL(req.url, `https://${host}`);
  const controller = new AbortController();
  req.on('close', () => { if (!res.writableEnded) controller.abort(); });
  const headers = new Headers();
  for (const name of ['origin', 'sec-fetch-site']) if (typeof req.headers[name] === 'string') headers.set(name, req.headers[name]);
  const response = await spotifyPlaylist(new Request(url, {method: req.method, headers, signal: controller.signal}));
  res.status(response.status);
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.send(Buffer.from(await response.arrayBuffer()));
}
