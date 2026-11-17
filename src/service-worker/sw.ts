/// <reference lib="webworker" />
import {readRecord, openDatabase, committed, request, registerDatabaseAdmissionPolicy, revalidateDatabaseRealm, subscribeDatabaseLifecycle, retireDatabaseRealm, admittedTransaction, assertDatabaseUse, closeDatabase, type DatabaseLifecycleState} from '../storage/database';
import {copyRealmControl} from '../storage/database-realm-protocol';
import type {Manifest} from '../storage/assets';
import {openAssetReader,verificationFailure} from '../storage/asset-reader';
import {validAsset} from '../library/library';
import {fixtures} from '../fixtures';
import {validManifest} from '../storage/manifest';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {resolveRange} from './ranges';
import {cachedShellResponse} from './shell-response';
import {appDocumentPath,cachedAppDocument,freshShellDocument,migrateLegacyShells} from './shell-updates';
import {copySourceAsset,copySourceRequest,sameSourceAsset,sourceUUID,sourceProof,type SourceCause,type PinnedRequest,type ReleaseRequest} from '../playback/local-source-protocol';
import type {LocalAsset} from '../library/library';
declare const self: ServiceWorkerGlobalScope;
interface Ticket { assetId: string; namespace: 'local'; owner: string; generation: string; ownerProof: string; version?:2; asset?:LocalAsset }
const PROTOCOL='pulso-idb-realm';
let lifecycle:DatabaseLifecycleState|null=null;
let schemaNotReady=false;
let revalidating=false;
let epoch=0;
type ActiveRead={client:Client;invalidate:()=>void};
// Only events currently owned by this worker; no subscription/history survives restart.
const active=new Set<ActiveRead>();
const fatal=()=>lifecycle==='versionchange'||lifecycle==='version-incompatible';
const notice=()=>lifecycle?{protocol:PROTOCOL,version:1,type:'sw-anomaly',state:lifecycle}:null;
function check(){if(lifecycle||schemaNotReady)throw new Error('storage-unavailable');assertDatabaseUse('read');}
function tell(client:Client){const message=notice();if(message)try{client.postMessage(message);}catch{/* Client may have closed. */}}
// Install before any event handler. Work permission never includes schema authority.
registerDatabaseAdmissionPolicy({open:phase=>{
 if(phase==='upgrade'){schemaNotReady=true;return false;}
 return revalidating&&!fatal()||!lifecycle&&!schemaNotReady;
},use:()=>revalidating&&!fatal()||!lifecycle&&!schemaNotReady,revalidate:()=>revalidating&&!fatal()});
subscribeDatabaseLifecycle(state=>{
 if(!fatal())lifecycle=state;
 epoch++;
 for(const item of [...active]){try{item.invalidate();}finally{tell(item.client);}}
 retireDatabaseRealm();
});
async function ownerAllowed(ownerProof:unknown):Promise<boolean>{
 if(typeof ownerProof!=='string'||!/^pulso-web:local:owner:[a-f0-9-]{36}$/.test(ownerProof))return false;
 const locks=await self.navigator.locks.query();
 const proof=locks.held?.find(lock=>lock.name===ownerProof);
 return !!proof&&!!locks.held?.some(lock=>lock.name==='pulso-web:local:playback'&&lock.clientId===proof.clientId);
}
async function actualClient(id:string):Promise<Client|null>{
 if(!id)return null;const client=await self.clients.get(id);
 return client&&new URL(client.url).origin===self.location.origin?client:null;
}
const SHELL = 'pulso-shell-BUILD_ID';
const FILES: string[] = SHELL_FILES;
self.addEventListener('install', event => { event.waitUntil((async()=>{
 await (await caches.open(SHELL)).addAll(FILES);
 // Migrate navigation entries only after the new complete shell was cached.
 // The older worker remains active, including its audio readers and tickets.
 await migrateLegacyShells(caches,SHELL);
})()); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
// No skipWaiting: una versión nueva espera el cierre de clientes anteriores.
self.addEventListener('message',event=>{
 const source=event.source as Client|null;const port=event.ports[0];const m=event.data;
 if(!source||!port||new URL(source.url).origin!==self.location.origin||m?.version!==1)return;
 if(m.type==='transport-capabilities'){
 port.postMessage({version:1,type:'transport-capabilities',readerProtocol:'local-assets-v1',backends:['idb','opfs'],idbLifecycle:1,physicalSources:1});port.close();return;
 }
 if(m.type==='pinned-local-sources'||m.type==='release-local-sources'){event.waitUntil(physicalSources(source,port,m));return;}
 if(m.type!=='fixture-tickets'&&!(m.protocol===PROTOCOL&&m.type==='revalidate'))return;
 if(m.type==='revalidate'&&copyRealmControl(m)?.type!=='revalidate'){port.postMessage({version:1,error:'No se pudo autorizar la lectura local.',status:403});port.close();return;}
 event.waitUntil((async()=>{
 const client=await actualClient(source.id);if(!client){port.close();return;}
 let db:IDBDatabase|undefined;
 const item:ActiveRead={client,invalidate:()=>{}};active.add(item);
 try{
 if(!await ownerAllowed(m.ownerProof)){port.postMessage({version:1,error:'No se pudo autorizar la lectura local.',status:403});return;}
 if(m.type==='revalidate'){
 if(typeof m.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(m.requestId))return;
 if(!fatal()){
 const observed=epoch;revalidating=true;
 try{
 await revalidateDatabaseRealm();db=await openDatabase();
 const tx=admittedTransaction(db,'settings');const done=committed(tx);void done.catch(()=>{});
 await request(tx.objectStore('settings').get('queue'));await done;
 if(epoch!==observed||!await ownerAllowed(m.ownerProof))throw new Error('storage-unavailable');
 if(epoch!==observed)throw new Error('storage-unavailable');
 lifecycle=null;schemaNotReady=false;
 }finally{revalidating=false;}
 }
 port.postMessage({protocol:PROTOCOL,version:1,type:'revalidated',requestId:m.requestId,state:lifecycle??(schemaNotReady?'schema-not-ready':'ready')});return;
 }
 const ids=m.assetIds as unknown;
 if(!Array.isArray(ids)||ids.length>1000||ids.some(id=>typeof id!=='string'||!/^(fixture-[ABC]|[a-f0-9-]{36})$/.test(id)))throw new Error('invalid-request');
 check();db=await openDatabase();check();
 if(!await ownerAllowed(m.ownerProof))throw new Error('owner-required');check();
 const generation=crypto.randomUUID();const tokens=ids.map(()=>crypto.randomUUID());
 const tx=admittedTransaction(db,'tickets','readwrite');const done=committed(tx);const store=tx.objectStore('tickets');
 const cursor=store.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if((c.value as Ticket).version!==2&&(c.value as Ticket).owner===client.id&&(c.value as Ticket).generation!==generation)c.delete();c.continue();}};
 ids.forEach((assetId,i)=>store.put({assetId,namespace:'local',owner:client.id,generation,ownerProof:m.ownerProof} satisfies Ticket,tokens[i]));
 await done;check();if(!await ownerAllowed(m.ownerProof))throw new Error('owner-required');check();
 port.postMessage({version:1,tokens});
 }catch{
 tell(client);
 if(m.type==='revalidate'&&(lifecycle||schemaNotReady))port.postMessage({protocol:PROTOCOL,version:1,type:'revalidated',requestId:m.requestId,state:lifecycle??'schema-not-ready'});
 else port.postMessage({version:1,error:'No se pudo autorizar la lectura local.',status:503,...(notice()?{notice:notice()}:{})});
 }finally{if(db)closeDatabase(db);active.delete(item);port.close();}
 })());
});
// These RPCs own ticket metadata only. They never delete assets or other bundles.
async function physicalSources(source:Client,port:MessagePort,value:unknown):Promise<void> {
 const m=copySourceRequest(value);const observed=epoch;
 let db:IDBDatabase|undefined;let client:Client|null=null;
 let cause:SourceCause='storage-unavailable';
 const respondFailure=()=>port.postMessage({version:1,type:m?.type??(value as {type?:unknown})?.type,requestId:m?.requestId??(value as {requestId?:unknown})?.requestId,status:cause==='owner-unavailable'?403:['asset-changed','asset-missing','local-corrupt'].includes(cause)?409:503,cause,...(notice()?{notice:notice()}:{})});
 try{
 if(!m){cause='worker-protocol';respondFailure();return;}
 client=await actualClient(source.id);if(!client){cause='owner-unavailable';respondFailure();return;}
 const current=()=>{check();if(epoch!==observed)throw new Error('storage-unavailable');};
 current();
 // Release may run after the proof lock was dropped: exact stored proof + client
 // + request + token identify only that resource. It grants no media authority.
 if(m.type==='pinned-local-sources'&&!await ownerAllowed(m.ownerProof)){cause='owner-unavailable';respondFailure();return;}
 current();db=await openDatabase();current();
 const result=await ticketTransaction(db,m,client.id,current);
 if(result){cause=result;respondFailure();return;}
 current();
 if(m.type==='pinned-local-sources'){
 if(!await ownerAllowed(m.ownerProof)){cause='owner-unavailable';respondFailure();return;}current();
 port.postMessage({version:1,type:m.type,requestId:m.requestId,tokens:m.tokens,assets:m.expected});
 }else port.postMessage({version:1,type:m.type,requestId:m.requestId,released:true});
 }catch{if(client)tell(client);respondFailure();}
 finally{if(db)closeDatabase(db);port.close();}
}
async function ticketTransaction(db:IDBDatabase,m:PinnedRequest|ReleaseRequest,clientId:string,current:()=>void):Promise<SourceCause|null> {
 const tx=admittedTransaction(db,m.type==='pinned-local-sources'?['assets','tickets']:['tickets'],'readwrite');
 const done=committed(tx);void done.catch(()=>{});const tickets=tx.objectStore('tickets');let failure:SourceCause|null=null;
 try{
 // Queue all native requests synchronously. No locks, hashing or other async IO
 // inside the transaction; success is exposed only after its oncomplete.
 if(m.type==='pinned-local-sources'){
 const assets=tx.objectStore('assets');
 m.expected.forEach((expected,i)=>{
 const get=assets.get(expected.id);get.onsuccess=()=>{
 try{
 current();const actual=copySourceAsset(get.result);
 if(!actual||!sameSourceAsset(actual,expected)){failure=get.result===undefined?'asset-missing':!actual?'local-corrupt':'asset-changed';tx.abort();return;}
 tickets.add({version:2,assetId:actual.id,asset:actual,namespace:'local',owner:clientId,generation:m.requestId,ownerProof:m.ownerProof} satisfies Ticket,m.tokens[i]);
 }catch{try{tx.abort();}catch{/* already terminal */}}
 };
 });
 }else m.tokens.forEach(token=>{
 const get=tickets.get(token);get.onsuccess=()=>{
 try{current();const ticket=get.result as Ticket|undefined;
 if(ticket?.version===2&&ticket.owner===clientId&&ticket.ownerProof===m.ownerProof&&ticket.generation===m.requestId)tickets.delete(token);
 }catch{try{tx.abort();}catch{/* already terminal */}}
 };
 });
 await done;current();return null;
 }catch(error){if(failure)return failure;throw error;}
}
async function media(event: FetchEvent): Promise<Response> {
  const req = event.request; const url = new URL(req.url);
  const fail = (status: number) => new Response(null, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
  if (req.mode === 'navigate' || !['GET','HEAD'].includes(req.method)) return fail(403);
  const token = url.pathname.slice('/_pulso/media/'.length);
  if (!/^[a-f0-9-]{36}$/.test(token)) return fail(403);
  const client=await actualClient(event.clientId);if(!client)return fail(403);
  let db:IDBDatabase|undefined;let streamOwns=false;let released=false;let readerRelease=()=>{};
  let streamController:ReadableStreamDefaultController<Uint8Array>|null=null;
  const release=()=>{if(released)return;released=true;req.signal.removeEventListener('abort',abort);readerRelease();if(db)closeDatabase(db);active.delete(item);};
  const invalidate=()=>{if(streamController)try{streamController.error(new Error('storage-unavailable'));}catch{/* terminal */}release();};
  const abort=()=>invalidate();
  const item:ActiveRead={client,invalidate};active.add(item);
  req.signal.addEventListener('abort',abort,{once:true});
  const current=()=>{check();if(released||req.signal.aborted)throw new Error('storage-unavailable');};
  try{
  current();db=await openDatabase();current();
  const ticket = await readRecord<Ticket>('tickets', token);
  if (!ticket || ticket.namespace !== 'local' || (!event.clientId || event.clientId !== ticket.owner)) return fail(403);
  current();const owner = await self.clients.get(ticket.owner);
  if (!owner || new URL(owner.url).origin !== self.location.origin) return fail(403);
  const locks = await self.navigator.locks.query();
  const proof = locks.held?.find(lock => lock.name === ticket.ownerProof);
  if (!proof || !locks.held?.some(lock => lock.name === 'pulso-web:local:playback' && lock.clientId === proof.clientId)) return fail(403);
  if(ticket.version!==undefined&&ticket.version!==2||ticket.version!==2&&Object.hasOwn(ticket,'asset'))return fail(403);
  const pinned=ticket.version===2?copySourceAsset(ticket.asset):null;
  if(ticket.version===2&&(!pinned||pinned.id!==ticket.assetId||!sourceUUID(ticket.generation)||!sourceProof(ticket.ownerProof)))return fail(403);
  current();const asset = await readRecord<Manifest>('assets', ticket.assetId);current();
  if(pinned){const actual=copySourceAsset(asset);if(!actual||!sameSourceAsset(actual,pinned))return fail(409);}
  const fixture = fixtures.find(f => f.id === ticket.assetId);
  if (!fixture) {
    if (!validAsset(asset)) return fail(409);
    const range = resolveRange(req.method === 'HEAD' ? null : req.headers.get('Range'), asset.bytes);
    if (!range) return new Response(null, {status:416,headers:{'Content-Range':`bytes */${asset.bytes}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    const headers = new Headers({'Content-Type':asset.mime,'Content-Length':String(range.end-range.start),'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"});
    if(range.partial)headers.set('Content-Range',`bytes ${range.start}-${range.end-1}/${asset.bytes}`);
    if(req.method==='HEAD')return new Response(null,{status:200,headers});
    let reader:Awaited<ReturnType<typeof openAssetReader>>;
    try{reader=await openAssetReader(asset);}catch(error){const verification=verificationFailure(error,asset.backend);return fail(verification.state==='missing'||verification.state==='corrupt'?409:503);}
    readerRelease=()=>reader.release();
    try{current();if(pinned){const actual=copySourceAsset(await readRecord<unknown>('assets',pinned.id));current();if(!actual||!sameSourceAsset(actual,pinned))return fail(409);}}catch(error){reader.release();throw error;}
    const verification=await reader.verifyDetailed(true,{check:current});current();
    if(verification.state!=='valid')return fail(verification.state==='unknown'?503:409);
    if(pinned){const actual=copySourceAsset(await readRecord<unknown>('assets',pinned.id));current();if(!actual||!sameSourceAsset(actual,pinned))return fail(409);}
    let position=range.start;
    const stream=new ReadableStream<Uint8Array>({start(controller){streamController=controller;},async pull(controller){
      try{
        current();
        if(position>=range.end){release();controller.close();return;}
        const end=Math.min(position+65536,range.end);
        const bytes=await reader.readRange(position,end);current();
        controller.enqueue(bytes);position=end;
        if(position>=range.end){release();controller.close();}
      }catch(error){release();controller.error(error);}
    },cancel(){release();}});
    streamOwns=true;return new Response(stream,{status:range.partial?206:200,headers});
  }
  if (!validManifest(asset, fixture)) return fail(404);
  const range = resolveRange(req.method === 'HEAD' ? null : req.headers.get('Range'), asset.bytes);
  if (!range) return new Response(null, {status: 416, headers: {'Content-Range': `bytes */${asset.bytes}`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
  const headers = new Headers({'Content-Type': asset.mime, 'Content-Length': String(range.end-range.start), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'"});
  if (range.partial) headers.set('Content-Range', `bytes ${range.start}-${range.end-1}/${asset.bytes}`);
  if (req.method === 'HEAD') return new Response(null, {status: 200, headers});
  // Las fixtures son pequeñas; lectura acotada por chunk. No depende de una ventana Telegram viva.
  const hash = sha256.create();
  let offset = 0; const selected: Uint8Array[] = [];
  for (let i=0; i<asset.chunks; i++) {
    current();const chunk = await readRecord<Uint8Array>('chunks', [asset.storageKey, i]);current(); if (!(chunk instanceof Uint8Array) || !chunk.length || chunk.length > 65536 || offset + chunk.length > asset.bytes) return fail(409);
    hash.update(chunk);
    const from = Math.max(0, range.start-offset); const to = Math.min(chunk.length, range.end-offset);
    if (to > from) selected.push(chunk.slice(from,to)); offset += chunk.length;
  }
  if (offset !== asset.bytes || bytesToHex(hash.digest()) !== asset.sha256) return fail(409);
  current();return new Response(new Blob(selected as BlobPart[], {type: asset.mime}), {status: range.partial ? 206 : 200, headers});
  }catch{tell(client);return fail(503);}finally{if(!streamOwns)release();}
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_pulso/media/')) { event.respondWith(media(event).catch(() => new Response(null, {status: 503}))); return; }
  if(event.request.method==='GET'&&event.request.mode==='navigate'&&appDocumentPath(url.pathname)){
    event.respondWith(freshShellDocument(event.request,async()=> cachedAppDocument(await caches.open(SHELL),url.pathname,FILES)));return;
  }
  if (event.request.method === 'GET' && FILES.includes(url.pathname)) {
    event.respondWith(caches.open(SHELL).then(async cache => {const cached=await cache.match(url.pathname,{ignoreVary:true});return cached?cachedShellResponse(cached):fetch(event.request);}));
  }
});
declare const SHELL_FILES: string[];

// Only our own download notifications can focus/open Pulso. Never start audio
// or accept a navigation URL from notification payload data.
self.addEventListener('notificationclick',event=>{
 if(event.notification.data?.kind!=='pulso-download'||event.notification.data?.version!==1)return;
 event.notification.close();
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const client=windows.find(client=>new URL(client.url).origin===self.location.origin);
  if(client){await (client as WindowClient).focus();return;}
  await self.clients.openWindow(new URL('/open.html',self.location.origin).href);
 })());
});
