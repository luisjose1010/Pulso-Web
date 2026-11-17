import {formatStorageMB} from './storage-format';
import {admittedTransaction,closeDatabase} from '../storage/database';
import {fail,issuedFailure,fromKnownError,makeFailure,nativeDOMName,type FailureV1} from '../errors/app-failure';
import {committed,openDatabase,readRecord} from '../storage/database';
import {ASSET_DIRECTORY,generationLock} from '../storage/asset-reader';
import {normalizeSnapshot} from '../playback/queue-restore';
import type {LocalAsset} from './library';
import {COPY_LIMITS,copyAsset,sameAsset,uuid,type RawInventory,type RawInventoryRow,type ReferencesV1,type CopyVerificationV1} from './local-copy-protocol';
import {runCopyWorker} from './local-copy-client';
export {COPY_LIMITS};
export type {CopyVerificationV1,Availability,Integrity,ReferencesV1} from './local-copy-protocol';
export interface CopyContext {signal:AbortSignal;current:()=>boolean}
declare const copyBrand:unique symbol;
declare const cursorBrand:unique symbol;
export interface CopyRef {readonly [copyBrand]:true}
export interface InventoryCursor {readonly [cursorBrand]:true}
export type InventoryRowV1=Omit<RawInventoryRow,'asset'> & {copyRef:CopyRef|null};
export interface InventoryPageV1 {version:1;snapshot:string;identity:'unknown';rows:InventoryRowV1[];partial:boolean;referencesComplete:boolean;observedBytes:number|null;logicalBytes:number|null;nextCursor:InventoryCursor|null;physicalComplete:boolean;metadataBytes:number;scannedRecords:number}
export interface PreparedAudioExport {readonly handle:object;readonly blob:Blob;readonly bytes:number;readonly mime:string;readonly verified:true;release():void}
export interface ExportProgress {phase:'verify'|'compose';bytes:number;total:number}
export function checkCopyContext(context:CopyContext):void {if(context.signal.aborted)fail('read','cancelled','cancelled','none');let current=false;try{current=context.current();}catch(error){const f=issuedFailure(error);if(f&&['cancelled','owner-unavailable','asset-changed'].includes(f.code))throw error;fail('read','internal','unknown','none');}if(!current)fail('read','internal','owner-unavailable','none');}
const references=new WeakMap<object,{snapshot:string;asset:LocalAsset}>();
const cursors=new WeakMap<object,{snapshot:string;index:number}>();
let generation=0;let saved:{snapshot:string;raw:RawInventory;rows:InventoryRowV1[]}|null=null;
export async function readLocalCopyInventory(options:CopyContext & {namespace:'local';cursor?:InventoryCursor;pageSize?:50}):Promise<InventoryPageV1> {
 checkCopyContext(options);if(options.namespace!=='local'||options.pageSize!==undefined&&options.pageSize!==50)fail('read','internal','input-invalid','none');
 let index=0;
 if(options.cursor){const c=cursors.get(options.cursor);if(!c||!saved||c.snapshot!==saved.snapshot)fail('read','integrity','asset-changed','none');index=c.index;}
 else{const mine=++generation;saved=null;const result=await runCopyWorker('inventory',null,options);checkCopyContext(options);if(mine!==generation)fail('read','integrity','asset-changed','none');if(result.kind!=='inventory')fail('read','internal','worker-protocol','none');const snapshot=crypto.randomUUID();const raw=result.inventory;
 const rows=raw.rows.map(({asset,...row})=>{let copyRef:CopyRef|null=null;if(asset&&row.manifestCount===1&&row.availability!=='changed'){copyRef=Object.freeze({}) as CopyRef;references.set(copyRef,{snapshot,asset:Object.freeze({...asset})});}return {...row,copyRef};});saved={snapshot,raw,rows};}
 const s=saved!;const next=index+50<s.rows.length?Object.freeze({}) as InventoryCursor:null;if(next)cursors.set(next,{snapshot:s.snapshot,index:index+50});
 checkCopyContext(options);return {version:1,snapshot:s.snapshot,identity:'unknown',rows:s.rows.slice(index,index+50),partial:s.raw.partial,referencesComplete:s.raw.referencesComplete,observedBytes:s.raw.observedBytes,logicalBytes:s.raw.logicalBytes,physicalComplete:s.raw.physicalComplete,metadataBytes:s.raw.metadataBytes,scannedRecords:s.raw.scannedRecords,nextCursor:next};
}
function resolveRef(ref:CopyRef):LocalAsset {const item=ref&&typeof ref==='object'?references.get(ref):undefined;if(!item||saved?.snapshot!==item.snapshot)fail('validate','integrity','asset-changed','none');return {...item.asset};}
let activeHash=false;
async function attempt(type:'verify'|'export',ref:CopyRef,options:CopyContext & {onProgress?:(progress:ExportProgress)=>void}) {
 checkCopyContext(options);const asset=resolveRef(ref);if(activeHash)fail('validate','internal','conflict','none');if(type==='export'&&asset.bytes>COPY_LIMITS.exportBytes)fail('validate','internal','limit-exceeded',asset.backend);
 const current=()=>{checkCopyContext(options);const now=resolveRef(ref);return sameAsset(asset,now);};
 activeHash=true;try{return await runCopyWorker(type,asset,{...options,current});}finally{activeHash=false;}
}
export async function verifyLocalCopy(options:CopyContext & {copyRef:CopyRef}):Promise<CopyVerificationV1>{const result=await attempt('verify',options.copyRef,options);if(result.kind!=='verified')fail('verify','internal','worker-protocol','none');return result.result;}
let prepared:object|null=null;const releases=new WeakMap<object,()=>void>();
export async function prepareIndividualAudioExport(copyRef:CopyRef,options:CopyContext & {onProgress?:(progress:ExportProgress)=>void}):Promise<PreparedAudioExport>{
 if(prepared)fail('validate','internal','conflict','none');const handle=Object.freeze({});prepared=handle;
 try{const result=await attempt('export',copyRef,options);if(result.kind!=='export')fail('read','internal','worker-protocol','none');checkCopyContext(options);const release=()=>{if(prepared===handle)prepared=null;releases.delete(handle);};releases.set(handle,release);return {handle,blob:result.blob,bytes:result.blob.size,mime:result.blob.type,verified:true,release};}
 catch(error){if(prepared===handle)prepared=null;throw error;}
}
/** Releases admission for another preparation. The document owns and revokes its URLs. */
export function releaseIndividualAudioExport(handle:object):void{releases.get(handle)?.();}
export type PersistenceResult={state:'granted'|'denied'|'unsupported'|'unknown';failure:FailureV1|null};
export function requestLocalPersistenceFromGesture():Promise<PersistenceResult> {
 try{if(typeof navigator==='undefined'||typeof navigator.storage?.persist!=='function')return Promise.resolve({state:'unsupported',failure:null});
 // Deliberately call native persist before the first await/microtask.
 const result=navigator.storage.persist();return Promise.resolve(result).then(value=>({state:value===true?'granted':value===false?'denied':'unknown',failure:null}) as PersistenceResult,error=>({state:'unknown',failure:fromKnownError(error,{phase:'open',backend:'none'})}));
 }catch(error){return Promise.resolve({state:'unknown',failure:fromKnownError(error,{phase:'open',backend:'none'})});}
}
export async function readLocalStorageStatus():Promise<{persisted:boolean|null;originUsageBytes:number|null;originQuotaBytes:number|null;failure:FailureV1|null}> {
 let persisted:boolean|null=null,originUsageBytes:number|null=null,originQuotaBytes:number|null=null,failure:FailureV1|null=null;
 try{if(typeof navigator.storage?.persisted==='function')persisted=await navigator.storage.persisted();if(typeof navigator.storage?.estimate==='function'){const e=await navigator.storage.estimate();if(Number.isSafeInteger(e.usage)&&e.usage!>=0)originUsageBytes=e.usage!;if(Number.isSafeInteger(e.quota)&&e.quota!>=0)originQuotaBytes=e.quota!;}}catch(error){failure=fromKnownError(error,{phase:'read',backend:'none'});}return {persisted,originUsageBytes,originQuotaBytes,failure};
}

// Worker-only implementation. Native cursors retain bounded metadata; no getAll.
interface Entry {key:IDBValidKey;value:unknown}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** Conservative retained-data charge, not a JS heap measurement. IndexedDB clones
 * one whole native record before this callback can inspect it. Oversize records
 * are discarded immediately; no code can cap that native transient allocation.
 * Iterate children lazily: Object.keys/spread would allocate all keys first.
 */
function metadataCost(value:unknown,remaining:number):number {
 let bytes=0;const seen=new Set<object>();const iterators:Iterator<unknown>[]=[[value][Symbol.iterator]()];
 function* fields(v:Record<string,unknown>){for(const key in v)if(Object.hasOwn(v,key)){yield key;yield v[key];}}
 function* mapFields(v:Map<unknown,unknown>){for(const [key,item] of v){yield key;yield item;}}
 while(iterators.length){
 const next=iterators[iterators.length-1].next();if(next.done){iterators.pop();continue;}const v=next.value;bytes+=32;
 if(typeof v==='string')bytes+=v.length*2;
 else if(v&&typeof v==='object'){
 if(seen.has(v)){if(bytes>remaining)return remaining+1;continue;}seen.add(v);bytes+=64;
 if(ArrayBuffer.isView(v))bytes+=v.byteLength;
 else if(v instanceof ArrayBuffer)bytes+=v.byteLength;
 else if(v instanceof Blob)bytes+=v.size+(typeof File!=='undefined'&&v instanceof File?v.name.length*2:0);
 else if(v instanceof Date)bytes+=8;
 else if(v instanceof Map){bytes+=v.size*32;if(bytes<=remaining)iterators.push(mapFields(v));}
 else if(v instanceof Set){bytes+=v.size*16;if(bytes<=remaining)iterators.push(v.values());}
 else if(Array.isArray(v)){bytes+=v.length*8;if(bytes<=remaining)iterators.push(fields(v as unknown as Record<string,unknown>));}
 else if(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null)iterators.push(fields(v as Record<string,unknown>));
 else return remaining+1; // Other native clone types have no reviewed cost model.
 }else if(!['undefined','boolean','number'].includes(typeof v)&&v!==null)return remaining+1;
 if(bytes>remaining)return remaining+1;
 }
 return bytes;
}
export async function readInventoryInWorker(context:CopyContext):Promise<RawInventory> {
 checkCopyContext(context);const db=await openDatabase();const entries:Record<string,Entry[]>={assets:[],tracks:[],playlists:[],settings:[],jobs:[]};let metadataBytes=0,scannedRecords=0,partial=false,referencesComplete=true,physicalComplete=true,playlistEntries=0;
 try{const tx=admittedTransaction(db,Object.keys(entries));const done=committed(tx);void done.catch(()=>{});
 await Promise.all(Object.keys(entries).map(store=>new Promise<void>((resolve,reject)=>{const limit=store==='assets'?COPY_LIMITS.manifests:store==='tracks'?COPY_LIMITS.tracks:COPY_LIMITS.recordsPerOtherStore;const req=tx.objectStore(store).openCursor();req.onerror=()=>reject(req.error);req.onsuccess=()=>{try{checkCopyContext(context);const c=req.result;if(!c){resolve();return;}scannedRecords++;const cost=metadataCost(c.value,COPY_LIMITS.metadataBytes-metadataBytes)+metadataCost(c.key,COPY_LIMITS.metadataBytes-metadataBytes);if(entries[store].length>=limit||metadataBytes+cost>COPY_LIMITS.metadataBytes){partial=true;referencesComplete=false;resolve();return;}metadataBytes+=cost;
 if(store==='playlists'&&record(c.value)&&Array.isArray(c.value.entries)){playlistEntries+=c.value.entries.length;if(playlistEntries>COPY_LIMITS.playlistEntries){partial=true;referencesComplete=false;resolve();return;}}
 entries[store].push({key:c.key,value:c.value});c.continue();}catch(error){reject(error);try{tx.abort();}catch{/* terminal */}}};})));
 await done;
 }finally{closeDatabase(db);}
 const groups=new Map<string,{row:RawInventoryRow;assets:LocalAsset[];key:string}>();
 const blank=():ReferencesV1=>({tracks:null,favorites:null,playlists:null,playlistEntries:null,queueOccurrences:null});
 const group=(backend:'idb'|'opfs'|'unknown',key:string)=>{const id=backend+':'+key;let g=groups.get(id);if(g)return g;if(groups.size>=COPY_LIMITS.generations){partial=true;physicalComplete=false;return null;}const row:RawInventoryRow={rowId:crypto.randomUUID(),backend,classification:'unclassified',manifestCount:0,trackIds:[],logicalBytes:null,observedBytes:null,availability:'unknown',integrity:'not-checked',references:blank(),protection:'unknown',asset:null,failure:null};g={row,assets:[],key};groups.set(id,g);return g;};
 for(const e of entries.assets){const a=copyAsset(e.value);if(!a||a.id!==e.key){const g=group('unknown',crypto.randomUUID());if(g)g.row.classification='invalid';referencesComplete=false;continue;}const g=group(a.backend,a.storageKey);if(!g)continue;g.assets.push(a);g.row.manifestCount++;g.row.logicalBytes=(g.row.logicalBytes??0)+a.bytes;g.row.classification='current-kept';g.row.protection='kept';g.row.asset=g.assets.length===1?a:null;}
 // Ownership only classifies provenance. No proof grants a cleanup action.
 for(const {key,value} of entries.settings){if(Array.isArray(key)&&key.length===3&&key[0]==='asset-ownership'&&(key[1]==='idb'||key[1]==='opfs')&&uuid(key[2])){const g=group(key[1],key[2]);if(g&&record(value)&&uuid(value.operationId)&&uuid(value.owner)&&typeof value.everPublished==='boolean'){if(value.everPublished){g.row.protection='kept';if(!g.assets.length)g.row.classification='previous-kept';}else if(!g.assets.length)g.row.classification='staging';}}}
 for(const {value} of entries.jobs){if(record(value)&&(value.backend==='idb'||value.backend==='opfs')&&uuid(value.storageKey)){group(value.backend,value.storageKey);}else{const g=group('unknown',crypto.randomUUID());if(g)g.row.classification='invalid';}}
 const tracks=new Map<string,{assetId:string|null;favorite:boolean}>();
 for(const {key,value} of entries.tracks){if(!record(value)||!uuid(value.id)||key!==value.id||!(value.assetId===null||uuid(value.assetId))||typeof value.favorite!=='boolean'||!Number.isSafeInteger(value.revision)||Number(value.revision)<1||typeof value.title!=='string'||value.title.length<1||value.title.length>300){referencesComplete=false;continue;}tracks.set(value.id,{assetId:value.assetId,favorite:value.favorite});}
 const lists:{id:string;entries:{trackId:string}[]}[]=[];
 for(const {key,value} of entries.playlists){if(!record(value)||!uuid(value.id)||value.id!==key||!Number.isSafeInteger(value.revision)||Number(value.revision)<1||typeof value.name!=='string'||value.name.length<1||value.name.length>100||!Array.isArray(value.entries)||!value.entries.every(e=>record(e)&&uuid(e.id)&&uuid(e.trackId))){referencesComplete=false;continue;}if(new Set(value.entries.map(e=>e.id)).size!==value.entries.length||value.entries.some(e=>!tracks.has(e.trackId)))referencesComplete=false;lists.push({id:value.id,entries:value.entries as {trackId:string}[]});}
 const queueEntry=entries.settings.find(e=>e.key==='library-playback');const queue=queueEntry?normalizeSnapshot(queueEntry.value):null;if(queueEntry&&!queue||queue?.snapshot.entries.some(e=>!tracks.has(e.trackId)))referencesComplete=false;
 for(const g of groups.values()){if(!g.assets.length)continue;const ids=new Set(g.assets.map(a=>a.id));const trackIds=[...tracks].filter(([,t])=>t.assetId!==null&&ids.has(t.assetId)).map(([id])=>id);g.row.trackIds=trackIds;const refs=new Set(trackIds);g.row.references={tracks:trackIds.length,favorites:trackIds.filter(id=>tracks.get(id)!.favorite).length,playlists:lists.filter(l=>l.entries.some(e=>refs.has(e.trackId))).length,playlistEntries:lists.reduce((n,l)=>n+l.entries.filter(e=>refs.has(e.trackId)).length,0),queueOccurrences:queue?.snapshot.entries.filter(e=>refs.has(e.trackId)).length??0};}
 // Discover IDB physical generations without retaining payloads. One record <=64KiB.
 const chunksDB=await openDatabase();try{const tx=admittedTransaction(chunksDB,'chunks');const done=committed(tx);void done.catch(()=>{});let count=0;
 await new Promise<void>((resolve,reject)=>{const req=tx.objectStore('chunks').openKeyCursor();req.onerror=()=>reject(req.error);req.onsuccess=()=>{try{checkCopyContext(context);const c=req.result;if(!c){resolve();return;}if(++count>COPY_LIMITS.chunkRecords){partial=true;physicalComplete=false;resolve();return;}const key=c.key;
 if(Array.isArray(key)&&key.length===2&&uuid(key[0])&&Number.isSafeInteger(key[1])&&Number(key[1])>=0){const g=group('idb',key[0]);if(g){/* key discovery only; observe payload under the generation lock below */}}
 else{const g=group('unknown',crypto.randomUUID());if(g)g.row.classification='invalid';physicalComplete=false;partial=true;}c.continue();}catch(error){reject(error);try{tx.abort();}catch{/* terminal */}}};});await done;
 }finally{closeDatabase(chunksDB);}
 let directory:FileSystemDirectoryHandle|null=null;let opfsFailure:FailureV1|null=null;let opfsAbsent=false;
 try{if(typeof navigator.storage?.getDirectory!=='function')opfsFailure=makeFailure('read','storage-unavailable','storage-unavailable','opfs');else directory=await(await navigator.storage.getDirectory()).getDirectoryHandle(ASSET_DIRECTORY,{create:false});}
 catch(error){if(nativeDOMName(error)==='NotFoundError')opfsAbsent=true;else opfsFailure=fromKnownError(error,{phase:'read',backend:'opfs'});}
 if(directory){let count=0;try{for await(const [key,handle] of directory as unknown as AsyncIterable<[string,FileSystemHandle]>){checkCopyContext(context);if(++count>COPY_LIMITS.generations){partial=true;physicalComplete=false;break;}const g=group('opfs',key);if(!g)break;if(handle.kind!=='file'){g.row.classification='invalid';continue;}try{const f=await(await directory.getFileHandle(key,{create:false})).getFile();g.row.observedBytes=f.size;}catch(error){g.row.failure=fromKnownError(error,{phase:'read',backend:'opfs'});g.row.availability='unknown';}}}catch(error){opfsFailure=fromKnownError(error,{phase:'read',backend:'opfs'});physicalComplete=false;}}
 if(opfsFailure){physicalComplete=false;partial=true;}
 for(const g of groups.values()){
 checkCopyContext(context);if(g.row.backend==='unknown')continue;
 await navigator.locks.request(generationLock({backend:g.row.backend,storageKey:g.key}),{mode:'shared',signal:context.signal},async()=>{
 checkCopyContext(context);
 for(const a of g.assets){const now=copyAsset(await readRecord('assets',a.id));if(!now||!sameAsset(a,now)){g.row.availability='changed';g.row.asset=null;return;}}
 if(g.row.backend==='opfs'){g.row.observedBytes=null;g.row.failure=null;}
 if(g.row.backend==='opfs'&&opfsFailure){g.row.availability='unknown';g.row.failure=opfsFailure;return;}
 if(g.row.backend==='opfs'&&!opfsAbsent&&directory){try{g.row.observedBytes=(await(await directory.getFileHandle(g.key,{create:false})).getFile()).size;}catch(error){if(nativeDOMName(error)!=='NotFoundError'){g.row.availability='unknown';g.row.failure=fromKnownError(error,{phase:'read',backend:'opfs'});return;}}}
 if(g.row.backend==='idb'){
 const physicalDB=await openDatabase();try{const tx=admittedTransaction(physicalDB,'chunks');const done=committed(tx);void done.catch(()=>{});let count=0,total=0,bad=false,found=false,payloadUnknown=false;
 await new Promise<void>((resolve,reject)=>{const req=tx.objectStore('chunks').openCursor(IDBKeyRange.bound([g.key,0],[g.key,[]]));req.onerror=()=>reject(req.error);req.onsuccess=()=>{try{checkCopyContext(context);const c=req.result;if(!c){resolve();return;}if(count>=1601){physicalComplete=false;partial=true;resolve();return;}found=true;const key=c.key as IDBValidKey[];const chunk=c.value;const valid=chunk instanceof Uint8Array&&chunk.byteLength>0&&chunk.byteLength<=65536;
 if(!valid)payloadUnknown=true;if(key.length!==2||key[1]!==count||!valid)bad=true;
 if(valid){total+=chunk.byteLength;if(g.assets.some(a=>chunk.byteLength!==Math.min(65536,a.bytes-count*65536)))bad=true;}
 count++;c.continue();}catch(error){reject(error);try{tx.abort();}catch{/* terminal */}}};});await done;g.row.observedBytes=payloadUnknown?null:found?total:null;if(bad)g.row.availability='corrupt';
 }finally{closeDatabase(physicalDB);}
 }
 if(g.row.availability!=='corrupt')g.row.availability=g.row.observedBytes===null?(physicalComplete?'missing':'unknown'):g.assets.some(a=>a.bytes!==g.row.observedBytes)?'corrupt':'present';
 for(const a of g.assets){const now=copyAsset(await readRecord('assets',a.id));if(!now||!sameAsset(a,now)){g.row.availability='changed';g.row.asset=null;}}
 });
 }
 if(!referencesComplete)for(const g of groups.values())g.row.references=blank();
 const rows=[...groups.values()].map(g=>g.row);const observedBytes=physicalComplete&&rows.every(r=>r.backend!=='unknown'&&r.availability!=='unknown'&&r.availability!=='changed'&&r.availability!=='corrupt')?rows.reduce((n,r)=>n+(r.observedBytes??0),0):null;
 const logicalBytes=!partial&&rows.every(r=>r.classification!=='invalid')?rows.reduce((n,r)=>n+(r.logicalBytes??0),0):null;
 checkCopyContext(context);return {rows,partial,referencesComplete,observedBytes,logicalBytes,metadataBytes,scannedRecords,physicalComplete};
}
/** Safe closed UI reason; never reads arbitrary Error properties. */
export function localCopyFailureReason(error:unknown):string {const f=fromKnownError(error,{phase:'read',backend:'none'});switch(f.code){case 'limit-exceeded':return `La exportación individual admite hasta ${formatStorageMB(8*1024*1024)} en esta fase. Conserva el archivo original.`;case 'cancelled':return 'Operación cancelada.';case 'asset-changed':return 'La copia cambió desde la revisión. Actualiza el inventario.';case 'asset-missing':return 'Faltan los bytes. Vuelve a importar el archivo original exacto.';case 'digest-mismatch':case 'length-mismatch':case 'local-corrupt':return 'La copia no superó la comprobación. Conserva el original.';case 'conflict':return 'Finaliza o libera la preparación anterior.';case 'storage-denied':return 'El navegador no permitió leer el almacenamiento.';case 'database-blocked':return 'La base local necesita una apertura compatible.';default:return 'No se pudo comprobar la copia. Los datos se conservan.';}}
