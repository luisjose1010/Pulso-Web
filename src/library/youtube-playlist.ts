/** YouTube playlist link -> "Artist - Title" lines for the playlist importer.
 * The browser cannot read youtube.com, so /api/youtube-playlist (Vercel, official API) does. */

export interface YoutubeItem {readonly title:string;readonly channel:string}
export interface YoutubePlaylist {readonly name:string;readonly total:number|null;readonly truncated:boolean;readonly items:readonly YoutubeItem[]}
export type YoutubeFailure='bad-link'|'not-configured'|'not-found'|'private'|'quota'|'network'|'invalid'|'cancelled';
export type YoutubeResult={readonly ok:true;readonly value:YoutubePlaylist}|{readonly ok:false;readonly reason:YoutubeFailure};

/** Accepts a full link (playlist?list=…, watch?v=…&list=…) or a bare playlist id. */
export function parsePlaylistId(input:string):string|null {
 const text=input.trim();
 const fromLink=/[?&]list=([A-Za-z0-9_-]{10,64})(?:[&#]|$)/.exec(text)?.[1];
 if(fromLink)return fromLink;
 return /^[A-Za-z0-9_-]{10,64}$/.test(text)&&!/^https?:/i.test(text)?text:null;
}

// Not songs: shorts, "type beat" uploads, long mixes and compilations.
const NOT_A_SONG=/#shorts|#\w*ragebait|type beat|\bplaylist\b|\(pt\.|\bmix\b|\|\s|\bvods?\b|\[free\]/iu;
export interface YoutubeLines {readonly lines:readonly string[];readonly ignored:number}

/** "X - Topic" channels are auto-generated artist channels: the channel is the artist.
 * A video title that already reads "Artist - Title" is kept as it is; otherwise the channel
 * name is used as the artist, which is wrong for fan uploads (those simply won't be found). */
export function youtubeItemsToLines(items:readonly YoutubeItem[]):YoutubeLines {
 const lines:string[]=[];let ignored=0;
 for(const {title,channel} of items){
  if(NOT_A_SONG.test(title)){ignored++;continue;}
  const topic=/\s-\s*Topic$/iu.test(channel);
  const artist=channel.replace(/\s*-\s*Topic$/iu,'').replace(/\s*official$/iu,'').trim();
  const line=/\s[-–—]\s/u.test(title)&&!topic?title:artist?`${artist} - ${title}`:title;
  lines.push(line.replace(/\s+/gu,' ').trim());
 }
 return {lines,ignored};
}

const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max;
function validate(raw:unknown):YoutubePlaylist|null {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const r=raw as Record<string,unknown>;
 if(!text(r.name,300)||typeof r.truncated!=='boolean'||!(r.total===null||Number.isSafeInteger(r.total))||!Array.isArray(r.items)||r.items.length>1500)return null;
 const items:YoutubeItem[]=[];
 for(const item of r.items){
  if(!item||typeof item!=='object')return null;
  const {title,channel}=item as Record<string,unknown>;
  if(!text(title,300)||!title.trim()||!text(channel,300))return null;
  items.push(Object.freeze({title,channel}));
 }
 return Object.freeze({name:r.name,total:r.total as number|null,truncated:r.truncated,items:Object.freeze(items)});
}

export async function loadYoutubePlaylist(input:string,o:{signal:AbortSignal;fetcher?:typeof fetch}):Promise<YoutubeResult> {
 const id=parsePlaylistId(input);
 if(!id)return {ok:false,reason:'bad-link'};
 const fetcher=o.fetcher??((...args:Parameters<typeof fetch>)=>fetch(...args));
 try{
  const response=await fetcher(`/api/youtube-playlist?list=${encodeURIComponent(id)}`,{signal:o.signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
  if(!response.ok){
   const known:Record<number,YoutubeFailure>={404:'not-found',403:'private',429:'quota'};
   const body=await response.json().catch(()=>null) as {error?:string}|null;
   return {ok:false,reason:body?.error==='not-configured'?'not-configured':known[response.status]??'network'};
  }
  const value=validate(await response.json());
  return value?{ok:true,value}:{ok:false,reason:'invalid'};
 }catch{return {ok:false,reason:o.signal.aborted?'cancelled':'network'};}
}

export const youtubeFailureText:Record<Exclude<YoutubeFailure,'cancelled'>,string>={
 'bad-link':'Ese texto no parece un enlace de playlist de YouTube (debe llevar «list=…»).',
 'not-configured':'La lectura de YouTube no está configurada en este sitio (falta YOUTUBE_API_KEY).',
 'not-found':'No se encontró esa playlist.',
 private:'La playlist es privada o no se puede leer. Debe ser pública o «no listada».',
 quota:'YouTube agotó la cuota diaria. Inténtalo mañana.',
 network:'No se pudo contactar con el servicio. Inténtalo de nuevo.',
 invalid:'La respuesta no se pudo verificar.',
};
