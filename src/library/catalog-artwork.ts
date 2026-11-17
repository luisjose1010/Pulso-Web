import {musicBrainzArtworkUrl} from './catalog-id';
import {catalogFetch} from './catalog-fetch';
import {MAX_ARTWORK_BYTES,validateArtwork} from '../imports/artwork';
import {artworkImageUrl,selectPlayerArtwork,type PlayerArtworkQuery} from './player-artwork-provider';

// The catalog returns all candidate tracks in one request for a search, not one
// search per row. Ambiguous editions are intentionally left without artwork.
const searchCache=new Map<string,{data:unknown;expires:number}>();
let searchTail:Promise<void>=Promise.resolve(),nextSearch=0;
export async function searchArtwork(query:string,signal:AbortSignal):Promise<unknown|null>{
 if(query.trim().length<3||query.length>160)return null;
 const hit=searchCache.get(query);if(hit&&hit.expires>Date.now())return signal.aborted?null:hit.data;if(hit)searchCache.delete(query);
 const previous=searchTail;let releaseSearch!:()=>void;searchTail=new Promise<void>(resolve=>{releaseSearch=resolve;});
 const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,15000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 try{
  await previous;if(controller.signal.aborted)return null;
  const delay=Math.max(0,nextSearch-Date.now());if(delay)await new Promise<void>(resolve=>{const done=()=>{clearTimeout(wait);controller.signal.removeEventListener('abort',done);resolve();};const wait=setTimeout(done,delay);controller.signal.addEventListener('abort',done,{once:true});if(controller.signal.aborted)done();});
  if(controller.signal.aborted)return null;nextSearch=Date.now()+3100;
  const params=new URLSearchParams({term:query,country:'US',media:'music',entity:'song',limit:'200'});
  const r=await fetchResponse(`https://itunes.apple.com/search?${params}`,controller.signal);
  if(r.status===429||r.status===503)nextSearch=Math.max(nextSearch,Date.now()+60000);
  if(!r.ok){await r.body?.cancel();return null;}
  const raw=await limited(r,1048576,controller.signal);const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)) as unknown;if(controller.signal.aborted)return null;
  searchCache.set(query,{data,expires:Date.now()+300000});while(searchCache.size>30)searchCache.delete(searchCache.keys().next().value!);return data;
 }catch{return null;}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);releaseSearch();}
}
export function songArtwork(data:unknown,query:PlayerArtworkQuery):string|null{return selectPlayerArtwork(data,query,200)?.url??null;}
async function fetchResponse(url:string,signal:AbortSignal):Promise<Response>{
 const work=catalogFetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store'}).then(response=>{if(signal.aborted)void response.body?.cancel().catch(()=>{});return response;});
 return abortable(work,signal);
}
async function abortable<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted)throw Error('aborted');let abort!:()=>void;const cancelled=new Promise<never>((_,reject)=>{abort=()=>reject(Error('aborted'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
 try{return await Promise.race([work,cancelled]);}finally{signal.removeEventListener('abort',abort);}
}
async function limited(r:Response,max:number,signal:AbortSignal):Promise<Uint8Array>{
 if(!r.ok||!r.body||Number(r.headers.get('content-length'))>max)throw Error('response');
 const reader=r.body.getReader(),chunks:Uint8Array[]=[];let size=0,done=false;const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{while(true){if(signal.aborted)throw Error('aborted');const part=await abortable(reader.read(),signal);if(signal.aborted)throw Error('aborted');if(part.done){done=true;break;}size+=part.value.length;if(size>max||chunks.length>=8192)throw Error('size');chunks.push(part.value);}const out=new Uint8Array(size);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;}
 finally{signal.removeEventListener('abort',cancel);if(!done)cancel();try{reader.releaseLock();}catch{/* An outstanding read can settle later. */}}
}
const cache=new Map<string,{blob:Blob;expires:number}>();
const pending=new Map<string,Promise<Blob|null>>();
let running=0;const queue:(()=>void)[]=[];
async function acquire(){if(running>=4){await new Promise<void>(resolve=>queue.push(resolve));return;}running++;}
function release(){const next=queue.shift();if(next)next();else running--;}
/** Shared, bounded, anonymous image transport. Only decoded validated blobs leave it. */
export async function catalogArtwork(url:string):Promise<Blob|null>{
 const safe=musicBrainzArtworkUrl(url)??artworkImageUrl(url);if(!safe)return null;
 const hit=cache.get(safe);if(hit&&hit.expires>Date.now())return hit.blob;if(hit)cache.delete(safe);
 const existing=pending.get(safe);if(existing)return existing;if(pending.size>=80)return null;
 const task=(async()=>{await acquire();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{
  const response=await fetchResponse(safe,controller.signal);
  const mime=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()??'';
  if(!['image/png','image/jpeg','image/webp'].includes(mime)){await response.body?.cancel();return null;}
  const raw=await limited(response,MAX_ARTWORK_BYTES,controller.signal);const result=await validateArtwork(new Blob([new Uint8Array(raw)],{type:mime}));
  cache.set(safe,{blob:result.blob,expires:Date.now()+300000});while(cache.size>16)cache.delete(cache.keys().next().value!);return result.blob;
 }catch{return null;}finally{clearTimeout(timer);release();}})();
 pending.set(safe,task);try{return await task;}finally{pending.delete(safe);}
}
