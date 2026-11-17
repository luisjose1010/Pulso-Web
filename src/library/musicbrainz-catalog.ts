import {bounded,type AlbumDetail,type AlbumEdition,type AlbumRequest,type AlbumResult,type CatalogArtist} from './album-catalog';
import {MB_UUID,musicBrainzArtwork,musicBrainzId,type CatalogId,type MusicBrainzId} from './catalog-id';
type Row=Record<string,unknown>;
const row=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=300;
const positive=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>0;
const id=(v:unknown):MusicBrainzId|null=>typeof v==='string'&&MB_UUID.test(v)?`musicbrainz:${v}`:null;
const same=(a:string,b:string)=>a.normalize('NFKC').toLocaleLowerCase().trim()===b.normalize('NFKC').toLocaleLowerCase().trim();
export function musicBrainzCredit(value:unknown):string|null{
 if(!Array.isArray(value)||!value.length||value.length>20)return null;
 let out='';for(const part of value){if(!row(part)||!text(part.name)||part.joinphrase!==undefined&&(typeof part.joinphrase!=='string'||part.joinphrase.length>40))return null;out+=part.name+(part.joinphrase??'');}
 return text(out)?out:null;
}
function edition(value:unknown,detail=false):AlbumEdition|null{
 if(!row(value)||!id(value.id)||!text(value.title))return null;
 const credit=musicBrainzCredit(value['artist-credit']);if(!credit)return null;
 const media=value.media;if(!Array.isArray(media)||!media.length||media.length>20)return null;
 let count=0;for(const m of media){if(!row(m)||!positive(m['track-count']))return null;count+=m['track-count'];}
 if(count>200||value['track-count']!==undefined&&value['track-count']!==count)return null;
 if(detail&&(!row(value['cover-art-archive'])||value['cover-art-archive'].front!==true))return {id:id(value.id)!,title:value.title,artist:credit,trackCount:count,releaseDate:text(value.date)?value.date:null};
 const art=musicBrainzArtwork(id(value.id)!);
 return {id:id(value.id)!,title:value.title,artist:credit,trackCount:count,releaseDate:text(value.date)?value.date:null,...(art?{artworkUrl:art}:{})};
}
export function parseMusicBrainzEditions(data:unknown):AlbumResult<AlbumEdition[]>{
 if(!bounded(data)||!row(data)||!Array.isArray(data.releases)||data.releases.length>100)return {ok:false,reason:'invalid'};
 const out:AlbumEdition[]=[],ids=new Set<CatalogId>();
 for(const r of data.releases){const e=edition(r);if(!e)continue;if(ids.has(e.id))return {ok:false,reason:'invalid'};ids.add(e.id);out.push(Object.freeze(e));}
 return {ok:true,value:out};
}
export function parseMusicBrainzArtists(data:unknown):AlbumResult<CatalogArtist[]>{
 if(!bounded(data)||!row(data)||!Array.isArray(data.artists)||data.artists.length>20)return {ok:false,reason:'invalid'};
 const out:CatalogArtist[]=[],ids=new Set<string>();for(const a of data.artists){if(!row(a)||!id(a.id)||!text(a.name)||ids.has(String(a.id)))return {ok:false,reason:'invalid'};ids.add(String(a.id));out.push({id:id(a.id)!,name:a.name});}
 return {ok:true,value:out};
}
/** Count, positions, disc order and full per-track credits are independently verified. */
export function parseMusicBrainzDetail(data:unknown,requested:CatalogId):AlbumResult<AlbumDetail>{
 if(!bounded(data)||!row(data)||!musicBrainzId(requested)||id(data.id)!==requested)return {ok:false,reason:'invalid'};
 const e=edition(data,true);if(!e||!Array.isArray(data.media))return {ok:false,reason:'invalid'};
 const tracks:AlbumDetail['tracks']=[],discs=data.media.slice().sort((a,b)=>row(a)&&row(b)?Number(a.position)-Number(b.position):0);
 for(let d=0;d<discs.length;d++){
  const m=discs[d];if(!row(m)||m.position!==d+1||!Array.isArray(m.tracks)||m.tracks.length!==m['track-count'])return {ok:false,reason:'incomplete'};
  const ordered=m.tracks.slice().sort((a,b)=>row(a)&&row(b)?Number(a.position)-Number(b.position):0);
  for(let i=0;i<ordered.length;i++){
   const t=ordered[i];if(!row(t)||t.position!==i+1||!text(t.title)||!row(t.recording)||!id(t.recording.id)||t.recording.video===true)return {ok:false,reason:'invalid'};
   const artist=musicBrainzCredit(t['artist-credit']??t.recording['artist-credit']);if(!artist)return {ok:false,reason:'invalid'};
   const duration=t.length??t.recording.length??null;if(duration!==null&&(!positive(duration)||duration>86400000))return {ok:false,reason:'invalid'};
   tracks.push({releaseId:requested,trackId:id(t.recording.id)!,disc:d+1,position:i+1,title:t.title,artist,durationMs:duration,primaryArtist:e.artist});
  }
 }
 if(tracks.length!==e.trackCount)return {ok:false,reason:'incomplete'};
 return {ok:true,value:{edition:e,tracks}};
}
/** No credentials or provider URLs supplied by the browser. Only the fixed relay. */
export class MusicBrainzCatalog{
 private readonly cache=new Map<string,{expires:number;data:unknown}>();
 constructor(private readonly fetcher:typeof fetch=fetch){}
 search(title:string,artist:string|null,request:AlbumRequest):Promise<AlbumResult<AlbumEdition[]>>{
  if(!text(title)||artist!==null&&artist!==''&&!text(artist))return Promise.resolve({ok:false,reason:'invalid'});
  return this.get('/search?'+new URLSearchParams({term:title,...(artist?{artist}:{})}),request,parseMusicBrainzEditions).then(result=>result.ok&&artist?{ok:true,value:result.value.filter(e=>same(e.title,title)&&same(e.artist,artist))}:result);
 }
 searchArtists(term:string,request:AlbumRequest):Promise<AlbumResult<CatalogArtist[]>>{
  if(!text(term))return Promise.resolve({ok:false,reason:'invalid'});
  return this.get('/artists?'+new URLSearchParams({term}),request,parseMusicBrainzArtists);
 }
 artistAlbums(artist:CatalogId,request:AlbumRequest):Promise<AlbumResult<AlbumEdition[]>>{
  if(!musicBrainzId(artist))return Promise.resolve({ok:false,reason:'invalid'});
  return this.get('/artist-albums?'+new URLSearchParams({id:artist.slice(12)}),request,parseMusicBrainzEditions);
 }
 load(release:CatalogId,request:AlbumRequest):Promise<AlbumResult<AlbumDetail>>{
  if(!musicBrainzId(release))return Promise.resolve({ok:false,reason:'invalid'});
  return this.get('/release?'+new URLSearchParams({id:release.slice(12)}),request,data=>parseMusicBrainzDetail(data,release));
 }
 private async get<T>(path:string,request:AlbumRequest,parse:(data:unknown)=>AlbumResult<T>):Promise<AlbumResult<T>>{
  const controller=new AbortController(),caller=()=>{try{return !request.signal.aborted&&request.current()===true;}catch{return false;}},active=()=>!controller.signal.aborted&&caller();
  if(!active())return {ok:false,reason:'cancelled'};
  const cached=this.cache.get(path);if(cached&&cached.expires>Date.now()){const value=parse(cached.data);return active()?value:{ok:false,reason:'cancelled'};}this.cache.delete(path);
  let timedOut=false;const cancel=()=>controller.abort();request.signal.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},15000);
  let rejectStop!:(reason:Error)=>void;const stopped=new Promise<never>((_,reject)=>{rejectStop=reject;});
  const onStop=()=>rejectStop(new Error('aborted'));controller.signal.addEventListener('abort',onStop,{once:true});
  const work=(async():Promise<AlbumResult<T>>=>{
   const url=typeof location==='undefined'?'https://pulso.invalid/catalog/musicbrainz'+path:new URL('/catalog/musicbrainz'+path,location.origin).href;
   const r=await this.fetcher(url,{signal:controller.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'});
   if(!active()){void r.body?.cancel().catch(()=>{});return {ok:false,reason:'cancelled'};}
   if(!r.ok){void r.body?.cancel().catch(()=>{});return {ok:false,reason:r.status===429||r.status===503?'rate-limited':'http',httpStatus:r.status};}
   if(!r.body||Number(r.headers.get('content-length'))>1048576){void r.body?.cancel().catch(()=>{});return {ok:false,reason:'too-large'};}
   const reader=r.body.getReader(),chunks:Uint8Array[]=[],stopReader=()=>{void reader.cancel().catch(()=>{});};let size=0;
   controller.signal.addEventListener('abort',stopReader,{once:true});
   try{while(true){if(!active())return {ok:false,reason:'cancelled'};const part=await reader.read();if(!active())return {ok:false,reason:'cancelled'};if(part.done)break;size+=part.value.length;if(size>1048576||chunks.length>=8192)return {ok:false,reason:'too-large'};chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
    let data:unknown;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return {ok:false,reason:'invalid'};}
    if(!active())return {ok:false,reason:'cancelled'};const result=parse(data);if(result.ok){this.cache.set(path,{data,expires:Date.now()+300000});while(this.cache.size>12)this.cache.delete(this.cache.keys().next().value!);}return result;
   }finally{controller.signal.removeEventListener('abort',stopReader);stopReader();try{reader.releaseLock();}catch{/* The cancelled read may still settle. */}}
  })();
  try{return await Promise.race([work,stopped]);}catch{return {ok:false,reason:!caller()?'cancelled':timedOut?'timeout':'network'};}finally{clearTimeout(timer);request.signal.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',onStop);controller.abort();}
 }
}
