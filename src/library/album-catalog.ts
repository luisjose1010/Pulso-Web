import {catalogFetch} from './catalog-fetch'
import {artworkUrl} from './player-artwork-provider'
/** Public iTunes Store metadata, US market. Completeness refers to declared metadata only. */
export type AlbumFailure = 'cancelled' | 'timeout' | 'network' | 'http' | 'rate-limited' | 'invalid' | 'incomplete' | 'too-large'
export type AlbumStage = 'album-search' | 'artist-search' | 'artist-albums' | 'album-detail'
export type AlbumResult<T> = { ok: true; value: T } | { ok: false; reason: AlbumFailure; stage?: AlbumStage; httpStatus?: number }
export interface CatalogArtist { id: number; name: string }
export interface CatalogSongHint { releaseId:number; trackId:number; disc:number; position:number; title:string; artist:string; primaryArtist?:string; album:string; durationMs:number; artworkUrl?:string }
export interface AlbumHint { id: number; title: string; artist: string | null; artworkUrl?: string }
export interface AlbumEdition { id: number; title: string; artist: string; trackCount: number; releaseDate: string | null; artworkUrl?: string }
export interface AlbumTrack { releaseId: number; trackId: number; disc: number; position: number; title: string; artist: string; durationMs: number | null; primaryArtist?: string; /** Playlist import only: the track's own album, when not the synthetic edition's. */ album?: string; /** Playlist import only: no catalogue entry; searched by artist + title with no album or duration. */ direct?: true }
export interface AlbumDetail { edition: AlbumEdition; tracks: AlbumTrack[] }
export interface AlbumRequest { signal: AbortSignal; current: () => boolean }
type Row = Record<string, unknown>
const origin = 'https://itunes.apple.com'
const MAX_BYTES = 1048576
const LIMIT = 200
let documentTail: Promise<void> = Promise.resolve()
let documentNext = 0
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 300
const pos = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0
const object = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const owns = (row: Row, keys: string[]) => keys.every(key => Object.hasOwn(row, key))
const fail = <T>(reason: AlbumFailure): AlbumResult<T> => ({ ok: false, reason })
function edition(row: Row): AlbumEdition | null {
  if (!owns(row, ['wrapperType', 'collectionType', 'collectionId', 'collectionName', 'artistName', 'trackCount']) || row.wrapperType !== 'collection' || row.collectionType !== 'Album' || !pos(row.collectionId) || !text(row.collectionName) || !text(row.artistName) || !pos(row.trackCount) || row.trackCount > LIMIT) return null
  const artwork = Object.hasOwn(row, 'artworkUrl100') ? artworkUrl(row.artworkUrl100) : null
  return Object.freeze({ id: row.collectionId, title: row.collectionName, artist: row.artistName, trackCount: row.trackCount, releaseDate: Object.hasOwn(row, 'releaseDate') && text(row.releaseDate) ? row.releaseDate : null, ...(artwork ? { artworkUrl: artwork } : {}) })
}
// Inspect descriptors before reading any value: reject accessors, exotic prototypes, cycles and large graphs.
function bounded(value: unknown): boolean {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }]
  const seen = new Set<object>()
  let nodes = 0
  try {
    while (stack.length) {
      const entry = stack.pop()!
      if (++nodes > 30000 || entry.depth > 32) return false
      const node = entry.value
      if (typeof node === 'string' && node.length > 16384) return false
      if (node === null || typeof node !== 'object') { if (typeof node === 'function' || typeof node === 'symbol' || typeof node === 'bigint') return false; continue }
      if (seen.has(node)) return false
      seen.add(node)
      const proto = Object.getPrototypeOf(node)
      if (Array.isArray(node) ? proto !== Array.prototype || node.length > 1000 : proto !== Object.prototype && proto !== null) return false
      if (Array.isArray(node) && Array.from({ length: node.length }, (_, i) => Object.hasOwn(node, i)).some(present => !present)) return false
      const descriptors = Object.getOwnPropertyDescriptors(node)
      const keys = Reflect.ownKeys(descriptors)
      if (keys.length > (Array.isArray(node) ? 1001 : 200)) return false
      for (const key of keys) {
        if (typeof key !== 'string') return false
        const descriptor = descriptors[key]
        if (!('value' in descriptor)) return false
        stack.push({ value: descriptor.value, depth: entry.depth + 1 })
      }
    }
    return true
  } catch { return false }
}
function rows(data: unknown): Row[] | null {
  if (!object(data) || !Object.hasOwn(data, 'results') || !Object.hasOwn(data, 'resultCount') || !Array.isArray(data.results) || data.results.length > LIMIT + 1 || data.resultCount !== data.results.length || !data.results.every(object)) return null
  return data.results
}
/** Candidate editions from one bounded song response. Detail lookup remains authoritative. */
export function albumHintsFromSongs(data: unknown): readonly AlbumHint[] {
  if (!bounded(data)) return []
  const all = rows(data)
  if (!all || all.length > 200) return []
  const groups = new Map<number, { title: string; artist: string | null; artworkUrl?: string; count: number; valid: boolean }>()
  for (const row of all) {
    if (row.wrapperType !== 'track' || row.kind !== 'song' || !pos(row.collectionId) || !text(row.collectionName)) continue
    const artist = text(row.collectionArtistName) ? row.collectionArtistName : null
    const artwork = artworkUrl(row.artworkUrl100)
    const group = groups.get(row.collectionId)
    if (!group) groups.set(row.collectionId, {title:row.collectionName,artist,...(artwork ? {artworkUrl:artwork} : {}),count:1,valid:true})
    else {
      if (group.title !== row.collectionName || group.artist && artist && group.artist !== artist) group.valid = false
      if (!group.artist && artist) group.artist = artist
      group.count++
    }
  }
  return Object.freeze([...groups.entries()].filter(([,g])=>g.valid).sort((a,b)=>b[1].count-a[1].count).slice(0,100)
    .map(([id,g])=>Object.freeze({id,title:g.title,artist:g.artist,...(g.artworkUrl ? {artworkUrl:g.artworkUrl} : {})})))
}

/** Individual candidates from the existing bounded song search; no completeness claim. */
export function catalogSongsFromBatch(data:unknown):readonly CatalogSongHint[] {
 if(!bounded(data))return [];
 const all=rows(data);if(!all||all.length>200)return [];
 const found=new Map<string,CatalogSongHint|null>();
 for(const row of all){
  if(row.wrapperType!=='track'||row.kind!=='song'||!pos(row.collectionId)||!pos(row.trackId)||!pos(row.discNumber)||row.discNumber>20||!pos(row.trackNumber)||row.trackNumber>200||!text(row.trackName)||!text(row.artistName)||!text(row.collectionName)||!Number.isSafeInteger(row.trackTimeMillis)||(row.trackTimeMillis as number)<0||(row.trackTimeMillis as number)>86400000)continue;
  const art=artworkUrl(row.artworkUrl100);
  const song:CatalogSongHint={releaseId:row.collectionId,trackId:row.trackId,disc:row.discNumber,position:row.trackNumber,title:row.trackName,artist:row.artistName,...(text(row.collectionArtistName)?{primaryArtist:row.collectionArtistName}:{}),album:row.collectionName,durationMs:row.trackTimeMillis as number,...(art?{artworkUrl:art}:{})};
  const key=`${song.releaseId}:${song.disc}:${song.position}:${song.trackId}`,previous=found.get(key);
  if(previous===undefined)found.set(key,Object.freeze(song));
  else if(previous&&JSON.stringify(previous)!==JSON.stringify(song))found.set(key,null);
 }
 return Object.freeze([...found.values()].filter((song):song is CatalogSongHint=>song!==null));
}

/** Rejects ambiguous, missing, inconsistent or extra positions; preserves repeated track IDs. */
export function parseAlbumDetail(data: unknown, id: number): AlbumResult<AlbumDetail> {
  if (!bounded(data)) return fail('invalid')
  const all = rows(data)
  if (!all || !pos(id)) return fail('invalid')
  const collections = all.filter(r => r.wrapperType === 'collection')
  const collection = collections[0]
  const e = collections.length === 1 ? edition(collection) : null
  if (!e || e.id !== id) return fail('invalid')
  const raw = all.filter(r => r.wrapperType === 'track')
  if (raw.length !== e.trackCount || all.length !== raw.length + 1) return fail('incomplete')
  const discs = new Map<number, { count: number; tracks: AlbumTrack[] }>()
  let discCount = 0
  for (const r of raw) {
    if (!owns(r, ['wrapperType', 'kind', 'collectionId', 'trackId', 'discNumber', 'discCount', 'trackNumber', 'trackCount', 'trackName', 'artistName']) || r.kind !== 'song' || r.collectionId !== id || !pos(r.trackId) || !pos(r.discNumber) || !pos(r.discCount) || r.discCount > 20 || r.discNumber > r.discCount || !pos(r.trackNumber) || !pos(r.trackCount) || r.trackCount > LIMIT || !text(r.trackName) || !text(r.artistName) || !( !Object.hasOwn(r, 'trackTimeMillis') || r.trackTimeMillis == null || (typeof r.trackTimeMillis === 'number' && Number.isSafeInteger(r.trackTimeMillis) && r.trackTimeMillis >= 0 && r.trackTimeMillis <= 86400000))) return fail('invalid')
    if (discCount && discCount !== r.discCount) return fail('incomplete')
    discCount = r.discCount
    const group = discs.get(r.discNumber) ?? { count: r.trackCount, tracks: [] }
    if (group.count !== r.trackCount) return fail('incomplete')
    const primary = Object.hasOwn(collection, 'artistId') && Object.hasOwn(r, 'artistId') && pos(collection.artistId) && r.artistId === collection.artistId ? { primaryArtist: e.artist } : {}
    group.tracks.push(Object.freeze({ releaseId: id, trackId: r.trackId, disc: r.discNumber, position: r.trackNumber, title: r.trackName, artist: r.artistName, durationMs: Object.hasOwn(r, 'trackTimeMillis') && r.trackTimeMillis ? r.trackTimeMillis as number : null, ...primary }))
    discs.set(r.discNumber, group)
  }
  if (!discCount || discs.size !== discCount) return fail('incomplete')
  const tracks: AlbumTrack[] = []
  for (let d = 1; d <= discCount; d++) {
    const group = discs.get(d)
    if (!group || group.tracks.length !== group.count) return fail('incomplete')
    group.tracks.sort((a, b) => a.position - b.position)
    if (group.tracks.some((track, i) => track.position !== i + 1)) return fail('incomplete')
    tracks.push(...group.tracks)
  }
  Object.freeze(tracks)
  return { ok: true, value: Object.freeze({ edition: e, tracks }) }
}

/** No network or timers until search/load is called. Caller chooses an edition explicitly. */
export class AlbumCatalog {
  private readonly cache = new Map<string, { expires: number; value: unknown }>()
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async search(title: string, artist: string | null, request: AlbumRequest): Promise<AlbumResult<AlbumEdition[]>> {
    if (!text(title) || !(artist === null || artist === '' || text(artist))) return fail('invalid')
    const query = new URLSearchParams({ term: [title, artist].filter(Boolean).join(' '), country: 'US', media: 'music', entity: 'album', limit: '20' })
    return this.get(`/search?${query}`, request, data => {
      if (!bounded(data)) return fail('invalid')
      const all = rows(data)
      if (!all || all.length > 20) return fail('invalid')
      const editions = all.map(edition)
      if (editions.some(e => !e)) return fail('invalid')
      return { ok: true, value: Object.freeze(editions) as AlbumEdition[] }
    })
  }
  async searchArtists(term: string, request: AlbumRequest): Promise<AlbumResult<CatalogArtist[]>> {
    if (!text(term)) return fail('invalid')
    const query = new URLSearchParams({ term, country: 'US', media: 'music', entity: 'musicArtist', limit: '20' })
    return this.get(`/search?${query}`, request, data => {
      if (!bounded(data)) return fail('invalid')
      const all = rows(data)
      if (!all || all.length > 20) return fail('invalid')
      const ids = new Set<number>(), result: CatalogArtist[] = []
      for (const row of all) {
        if (!owns(row, ['wrapperType', 'artistId', 'artistName']) || row.wrapperType !== 'artist' || !pos(row.artistId) || !text(row.artistName) || ids.has(row.artistId)) return fail('invalid')
        ids.add(row.artistId); result.push(Object.freeze({id: row.artistId, name: row.artistName}))
      }
      return { ok: true, value: Object.freeze(result) as CatalogArtist[] }
    })
  }
  async artistAlbums(id: number, request: AlbumRequest): Promise<AlbumResult<AlbumEdition[]>> {
    if (!pos(id)) return fail('invalid')
    const query = new URLSearchParams({ id: String(id), country: 'US', entity: 'album', limit: '100' })
    return this.get(`/lookup?${query}`, request, data => {
      if (!bounded(data)) return fail('invalid')
      const all = rows(data)
      if (!all || all.length > 101) return fail('invalid')
      const artists = all.filter(row => row.wrapperType === 'artist')
      if (artists.length !== 1 || !owns(artists[0], ['artistId', 'artistName']) || artists[0].artistId !== id || !text(artists[0].artistName)) return fail('invalid')
      const albums = all.filter(row => row.wrapperType === 'collection')
      if (all.length !== albums.length + 1) return fail('invalid')
      const ids = new Set<number>(), result: AlbumEdition[] = []
      for (const row of albums) {
        const item = edition(row)
        // Artist lookups also return associated releases credited to a different
        // primary artist. Keep their literal credits; the parent artist must match.
        if (!item || !Object.hasOwn(row, 'artistId') || !pos(row.artistId) || ids.has(item.id)) return fail('invalid')
        ids.add(item.id); result.push(item)
      }
      return { ok: true, value: Object.freeze(result) as AlbumEdition[] }
    })
  }
  async load(id: number, request: AlbumRequest): Promise<AlbumResult<AlbumDetail>> {
    if (!pos(id)) return fail('invalid')
    return this.get(`/lookup?${new URLSearchParams({ id: String(id), entity: 'song', country: 'US', limit: String(LIMIT) })}`, request, data => parseAlbumDetail(data, id))
  }
  private async get<T>(path: string, request: AlbumRequest, parse: (data: unknown) => AlbumResult<T>): Promise<AlbumResult<T>> {
    const deadline = Date.now() + 15000
    let stopped: AlbumFailure | null = null
    let triggerTimeout = () => {}
    const active = () => { try { if (Date.now() >= deadline) triggerTimeout(); return !stopped && !request.signal.aborted && request.current() === true } catch { return false } }
    if (!active()) return fail('cancelled')
    const cached = this.cache.get(path)
    if (cached && cached.expires > Date.now()) return active() ? { ok: true, value: cached.value as T } : fail('cancelled')
    if (cached) this.cache.delete(path)
    const controller = new AbortController()
    let finish!: (value: AlbumResult<T>) => void
    const outcome = new Promise<AlbumResult<T>>(resolve => { finish = resolve })
    const stop = (reason: AlbumFailure) => { if (!stopped) { stopped = reason; controller.abort(); finish(fail(reason)) } }
    triggerTimeout = () => stop('timeout')
    const abort = () => stop('cancelled')
    request.signal.addEventListener('abort', abort, { once: true })
    if (request.signal.aborted) abort()
    const timer = setTimeout(() => stop('timeout'), Math.max(0, deadline - Date.now()))
    const previous = documentTail
    const work = (async () => {
      await previous
      if (!active()) return fail<T>(stopped ?? 'cancelled')
      while (active() && documentNext > Date.now()) {
        const delay = documentNext - Date.now()
        await new Promise<void>(resolve => { const done = () => { clearTimeout(wait); controller.signal.removeEventListener('abort', done); resolve() }; const wait = setTimeout(done, Math.min(delay, 2147483647)); controller.signal.addEventListener('abort', done, { once: true }); if (controller.signal.aborted) done() })
      }
      if (!active()) return fail<T>(stopped ?? 'cancelled')
      documentNext = Date.now() + 3100
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      let cancellation: Promise<unknown> | undefined
      const cancelReader = () => { if (reader && !cancellation) cancellation = reader.cancel().catch(() => {}) }
      try {
        if (!active()) return fail<T>(stopped ?? 'cancelled')
        const response = await catalogFetch(origin + path, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' }, this.fetcher)
        if (!active()) { await response.body?.cancel().catch(() => {}); return fail<T>(stopped ?? 'cancelled') }
        if (response.status === 429 || response.status === 503) {
          const retry = response.headers.get('retry-after')
          const milliseconds = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : NaN
          documentNext = Math.max(documentNext, Date.now() + (Number.isFinite(milliseconds) && milliseconds >= 0 ? Math.max(3100, milliseconds) : 60000))
          await response.body?.cancel().catch(() => {})
          return fail<T>(active() ? 'rate-limited' : stopped ?? 'cancelled')
        }
        if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) {
          const reason = response.ok ? 'too-large' : 'http'
          await response.body?.cancel().catch(() => {})
          if (active() && reason === 'http' && Number.isInteger(response.status) && response.status >= 400 && response.status <= 599) return { ok: false, reason, httpStatus: response.status } as AlbumResult<T>
          return fail<T>(active() ? reason : stopped ?? 'cancelled')
        }
        reader = response.body.getReader()
        controller.signal.addEventListener('abort', cancelReader, { once: true })
        if (controller.signal.aborted) cancelReader()
        const chunks: Uint8Array[] = []
        let size = 0
        while (true) {
          if (!active()) return fail<T>(stopped ?? 'cancelled')
          const part = await reader.read()
          if (!active()) return fail<T>(stopped ?? 'cancelled')
          if (part.done) break
          size += part.value.byteLength
          if (size > MAX_BYTES || chunks.length >= 8192) return fail<T>('too-large')
          chunks.push(part.value)
        }
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
        let data: unknown
        try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { return fail<T>('invalid') }
        if (!active()) return fail<T>(stopped ?? 'cancelled')
        const result = parse(data)
        if (!active()) return fail<T>(stopped ?? 'cancelled')
        return result
      } catch { return fail<T>(!active() ? stopped ?? 'cancelled' : 'network') }
      finally {
        controller.signal.removeEventListener('abort', cancelReader)
        if (reader) { cancelReader(); await cancellation; reader.releaseLock() }
      }
    })()
    const completed = work.then(result => {
      if (!active()) return fail<T>(stopped ?? 'cancelled')
      if (result.ok) { this.cache.set(path, { expires: Date.now() + 300000, value: result.value }); if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!) }
      return result
    })
    documentTail = completed.then(() => {}, () => {})
    void completed.then(result => { if (active()) finish(result); else finish(fail(stopped ?? 'cancelled')) }, () => finish(fail(stopped ?? 'network')))
    const result = await outcome
    clearTimeout(timer)
    request.signal.removeEventListener('abort', abort)
    return result
  }
}
