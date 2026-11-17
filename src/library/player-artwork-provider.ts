import {MB_UUID,musicBrainzArtwork} from './catalog-id';
import {catalogFetch} from './catalog-fetch';
import {MAX_ARTWORK_BYTES, validateArtwork} from '../imports/artwork';

export interface PlayerArtworkQuery { title:string; artist:string; album:string|null; durationSeconds:number; editionId?:number; trackId?:number; musicbrainzReleaseId?:string }
export interface PlayerArtworkMatch { album:string; url:string }
const clean = (s:string) => s.normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en-US');
const validText = (s:unknown):s is string => typeof s==='string' && s.trim().length>0 && s.length<=300;
const hosts = new Set(['is1-ssl.mzstatic.com','is2-ssl.mzstatic.com','is3-ssl.mzstatic.com','is4-ssl.mzstatic.com','is5-ssl.mzstatic.com']);
export function artworkUrl(value:unknown):string|null {
 if(typeof value!=='string'||value.length>2048)return null;
 try { const u=new URL(value); if(u.protocol!=='https:'||!hosts.has(u.hostname)||u.port||u.username||u.password||u.hash)return null; return u.href; } catch{return null;}
}
/** Apple CDN size variants; never enlarge an arbitrary URL or change its host/path identity. */
export function artworkImageUrl(value:unknown):string|null {
 const safe=artworkUrl(value);if(!safe)return null;
 const url=new URL(safe);
 url.pathname=url.pathname.replace(/\/[1-9][0-9]{0,3}x[1-9][0-9]{0,3}(?:bb|cc)?\.(jpg|jpeg|png|webp)$/i,'/600x600bb.$1');
 return url.href;
}
function validIdentity(q:PlayerArtworkQuery):boolean {
 if(q.musicbrainzReleaseId!==undefined)return MB_UUID.test(q.musicbrainzReleaseId)&&q.editionId===undefined&&q.trackId===undefined&&q.album!==null;
 return q.editionId===undefined&&q.trackId===undefined||Number.isSafeInteger(q.editionId)&&q.editionId!>0&&Number.isSafeInteger(q.trackId)&&q.trackId!>0;
}
/** Only a single catalog edition with a consistent cover is safe to show. */
export function selectPlayerArtwork(data:unknown,q:PlayerArtworkQuery,limit=50):PlayerArtworkMatch|null {
 if(q.musicbrainzReleaseId!==undefined||!validIdentity(q)||!validText(q.title)||!validText(q.artist)||!Number.isFinite(q.durationSeconds)||q.durationSeconds<=0||q.durationSeconds>86400||q.album!==null&&!validText(q.album))return null;
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 const d=data as Record<string,unknown>;
 if(!Array.isArray(d.results)||d.results.length>=limit||d.resultCount!==d.results.length)return null;
 const matches: {id:number;album:string;url:string}[]=[];
 for(const item of d.results){
  if(!item||typeof item!=='object'||Array.isArray(item))return null;
  const r=item as Record<string,unknown>;
  if(r.wrapperType!=='track'||r.kind!=='song'||!validText(r.trackName)||!validText(r.artistName))continue;
  if(q.editionId!==undefined&&(r.collectionId!==q.editionId||r.trackId!==q.trackId))continue;
  const creditMatches=clean(r.artistName)===clean(q.artist)||q.editionId===undefined&&q.album!==null&&validText(r.collectionArtistName)&&clean(r.collectionArtistName)===clean(q.artist);
  if(clean(r.trackName)!==clean(q.title)||!creditMatches)continue;
  if(typeof r.trackTimeMillis!=='number'||!Number.isFinite(r.trackTimeMillis)||Math.abs(r.trackTimeMillis/1000-q.durationSeconds)>5)continue;
  if(!validText(r.collectionName)||q.album!==null&&clean(r.collectionName)!==clean(q.album))continue;
  const url=artworkImageUrl(r.artworkUrl100);
  if(!Number.isSafeInteger(r.collectionId)||(r.collectionId as number)<=0||!url)return null;
  matches.push({id:r.collectionId as number,album:r.collectionName,url});
 }
 if(!matches.length)return null;
 const first=matches[0];
 if(matches.some(m=>m.id!==first.id||clean(m.album)!==clean(first.album)||m.url!==first.url))return null;
 return {album:first.album,url:first.url};
}
let nextRequest=0;
let tail:Promise<void>=Promise.resolve();
async function bytes(response:Response,limit:number,signal:AbortSignal):Promise<Uint8Array> {
 if(!response.ok||!response.body||Number(response.headers.get('content-length'))>limit)throw Error('response');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[]; let size=0,done=false;
 const cancel=()=>{void reader.cancel().catch(()=>{});}; signal.addEventListener('abort',cancel,{once:true});
 try { while(true){if(signal.aborted)throw Error('aborted'); const part=await reader.read(); if(signal.aborted)throw Error('aborted'); if(part.done){done=true;break;} size+=part.value.length; if(size>limit||chunks.length>=8192)throw Error('size'); chunks.push(part.value);}
 const out=new Uint8Array(size);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;
 } finally {signal.removeEventListener('abort',cancel);if(!done)cancel();reader.releaseLock();}
}
export class PlayerArtworkProvider {
 private cache=new Map<string,{expires:number; value:{album:string;blob:Blob}}>();
 constructor(private fetcher:typeof fetch=fetch){}
 async load(q:PlayerArtworkQuery,request:{signal:AbortSignal;current:()=>boolean}):Promise<{album:string;blob:Blob}|null>{
  if(!validIdentity(q)||!validText(q.title)||!validText(q.artist)||!Number.isFinite(q.durationSeconds)||q.durationSeconds<=0||q.durationSeconds>86400||q.album!==null&&!validText(q.album))return null;
  const key=JSON.stringify([q.title,q.artist,q.album,q.durationSeconds,q.editionId,q.trackId,q.musicbrainzReleaseId]);
  const active=()=>{try{return !request.signal.aborted&&request.current();}catch{return false;}};
  if(!active())return null;
  const cached=this.cache.get(key);if(cached&&cached.expires>Date.now())return active()?cached.value:null;
  this.cache.delete(key);
  const controller=new AbortController(); const abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,15000); if(request.signal.aborted)abort();
  const live=()=>active()&&!controller.signal.aborted;
  const previous=tail;
  const task=(async()=>{
   await previous;if(!live())return null;
   const options:RequestInit={signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store'};
   let match:PlayerArtworkMatch|null=null;
   if(q.musicbrainzReleaseId){const url=musicBrainzArtwork(`musicbrainz:${q.musicbrainzReleaseId}`);if(!url||!q.album)return null;match={album:q.album,url};}
   else{
   const delay=Math.max(0,nextRequest-Date.now());
   if(delay)await new Promise<void>(resolve=>{const finish=()=>{clearTimeout(t);controller.signal.removeEventListener('abort',finish);resolve();};const t=setTimeout(finish,delay);controller.signal.addEventListener('abort',finish,{once:true});if(controller.signal.aborted)finish();});
   if(!live())return null;nextRequest=Date.now()+3100;
   const exact=q.editionId!==undefined;
   const query=new URLSearchParams(exact?{id:String(q.editionId),country:'US',entity:'song',limit:'200'}:{term:`${q.title} ${q.artist}`,country:'US',media:'music',entity:'song',limit:'50'});
   const response=await catalogFetch(`https://itunes.apple.com/${exact?'lookup':'search'}?${query}`,options,this.fetcher);
   if(response.status===429||response.status===503){nextRequest=Math.max(nextRequest,Date.now()+60000);await response.body?.cancel();return null;}
   const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(response,1048576,controller.signal))) as unknown;
   if(!live())return null;match=selectPlayerArtwork(data,q,exact?201:50);if(!match)return null;

   }
   if(!match)return null;
   const image=await catalogFetch(match.url,options,this.fetcher);const mime=image.headers.get('content-type')?.split(';')[0].trim().toLowerCase()??'';
   if(!['image/png','image/jpeg','image/webp'].includes(mime)){await image.body?.cancel();return null;}
   const raw=await bytes(image,MAX_ARTWORK_BYTES,controller.signal);if(!live())return null;
   const validated=await validateArtwork(new Blob([new Uint8Array(raw)],{type:mime}));if(!live())return null;
   const value={album:match.album,blob:validated.blob};this.cache.set(key,{expires:Date.now()+300000,value});if(this.cache.size>8)this.cache.delete(this.cache.keys().next().value!);return value;
  })().catch(()=>null);
  const outcome=Promise.race([task,new Promise<null>(resolve=>{if(controller.signal.aborted)resolve(null);else controller.signal.addEventListener('abort',()=>resolve(null),{once:true});})]);
  tail=outcome.then(()=>{},()=>{});
  try {return await outcome;}
  finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);}
 }
}
