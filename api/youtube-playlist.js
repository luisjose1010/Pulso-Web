// Reads a public/unlisted YouTube playlist (titles and channel names only) through the
// official YouTube Data API v3, so the browser never has to scrape youtube.com.
// Needs the YOUTUBE_API_KEY env var. Returns no video IDs, URLs or user data.
const MAX_ITEMS = 1500;
const API = 'https://www.googleapis.com/youtube/v3';
const HIDDEN = new Set(['Deleted video', 'Private video']);

const send = (res, status, body) => res.status(status).send(JSON.stringify(body));

async function google(path, params, key) {
  const url = `${API}/${path}?${new URLSearchParams({...params, key})}`;
  const response = await fetch(url, {signal: AbortSignal.timeout(10000), redirect: 'error', headers: {Accept: 'application/json'}});
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = body?.error?.errors?.[0]?.reason ?? '';
    const error = new Error(reason || String(response.status));
    error.status = response.status;
    error.reason = reason;
    throw error;
  }
  return body;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return send(res, 405, {error: 'method'});
  // Only the app itself may spend the API quota.
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return send(res, 403, {error: 'forbidden'});
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return send(res, 503, {error: 'not-configured'});
  const id = new URL(req.url, 'http://localhost').searchParams.get('list') ?? '';
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(id)) return send(res, 400, {error: 'bad-id'});
  try {
    const items = [];
    let pageToken, total = null;
    do {
      const page = await google('playlistItems', {part: 'snippet', maxResults: '50', playlistId: id, ...(pageToken ? {pageToken} : {})}, key);
      total = page.pageInfo?.totalResults ?? total;
      for (const item of page.items ?? []) {
        const title = item?.snippet?.title;
        if (typeof title !== 'string' || !title.trim() || HIDDEN.has(title)) continue;
        const channel = item.snippet.videoOwnerChannelTitle;
        items.push({title: title.slice(0, 300), channel: typeof channel === 'string' ? channel.slice(0, 300) : ''});
      }
      pageToken = page.nextPageToken;
    } while (pageToken && items.length < MAX_ITEMS);
    let name = '';
    try {
      const info = await google('playlists', {part: 'snippet', id}, key);
      name = String(info.items?.[0]?.snippet?.title ?? '').slice(0, 120);
    } catch { /* the name is optional */ }
    return send(res, 200, {name, total, truncated: items.length >= MAX_ITEMS && !!pageToken, items: items.slice(0, MAX_ITEMS)});
  } catch (error) {
    if (error.status === 404) return send(res, 404, {error: 'not-found'});
    if (error.reason === 'quotaExceeded' || error.reason === 'rateLimitExceeded') return send(res, 429, {error: 'quota'});
    if (error.status === 403 || error.status === 401) return send(res, 403, {error: 'private'});
    return send(res, 502, {error: 'upstream'});
  }
}
