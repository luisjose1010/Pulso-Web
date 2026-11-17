import {libraryMembershipKey,makeLibraryMembership,copyLibraryMembership} from '../library/library-membership';
import {copyAccountCatalog} from '../accounts/library-document.mjs';
import {copyLocalAlbumMetadata} from '../library/album-metadata';
import {assertDatabaseUse,type DatabaseUseKind} from './database';
import {admittedTransaction,closeDatabase} from './database';
import {AppFailure,atBoundary,fail,fromKnownError,nativeDOMName} from '../errors/app-failure';
import {Attempt,type RecoveryAttemptResult} from '../imports/import-outcome';
import {transactionDone} from './transaction-done';
import {all as allRaw,validAsset,validAudioFingerprint,type LocalAsset,type Track,type LinkedTrack} from '../library/library';
import {openDatabase,readRecord as readRecordRaw,request} from './database';
import {ASSET_DIRECTORY,generationLock,openAssetReader,WRITER_LOCK} from './asset-reader';
export type ImportOperationGuard=()=>boolean;
function checkUse(kind:DatabaseUseKind,guard?:ImportOperationGuard):void {assertDatabaseUse(kind);let current=true;try{current=guard?.()??true;}catch{current=false;}if(!current)fail(null,'storage-unavailable','storage-unavailable','idb');}
async function existingDirectory(kind:DatabaseUseKind,guard?:ImportOperationGuard){return atBoundary('open','opfs',async()=>{checkUse(kind,guard);const root=await navigator.storage.getDirectory();checkUse(kind,guard);return root.getDirectoryHandle(ASSET_DIRECTORY,{create:false});});}
const readRecord=<T>(store:string,key:IDBValidKey)=>atBoundary('read','idb',()=>readRecordRaw<T>(store,key));
const all=<T>(store:string)=>atBoundary('read','idb',()=>allRaw<T>(store));
export type ImportState='writing'|'verifying'|'ready'|'publishing'|'uncertain'|'cleanup'|'discarded'|'sealed';
export interface ImportResult {track:LinkedTrack;duplicate:boolean}
export interface ImportOperation {
 accountId?:string;
 version:1;operationId:string;owner:string;revision:number;state:ImportState;
 backend:'idb'|'opfs';storageKey:string;bytes:number;expectedBytes:number;cause?:string;libraryMode?:'cache';
 asset?:LocalAsset;track?:LinkedTrack;expectedAssetRevision?:number;result?:ImportResult;
}
export const terminal=(job:ImportOperation)=>job.state==='sealed'||job.state==='discarded';
interface Ownership {operationId:string;owner:string;everPublished:boolean}
const ownershipKey=(job:Pick<ImportOperation,'backend'|'storageKey'>)=>['asset-ownership',job.backend,job.storageKey];
const uuid=(s:unknown)=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s);
const positive=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>0;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
function validStoredTrack(value:unknown):value is Track {
 if(!record(value))return false;const t=value as unknown as Track;
 if(t.accountId!==undefined&&!uuid(t.accountId))return false;if(t.catalogChoice!==undefined){try{if(!copyAccountCatalog(t.catalogChoice))return false;}catch{return false;}}
 return (!Object.hasOwn(t,'localAlbum')||copyLocalAlbumMetadata(t.localAlbum)!==null)&&uuid(t.id)&&(t.assetId===null||uuid(t.assetId))&&(t.audioFingerprint==null||record(t.audioFingerprint)&&validAudioFingerprint(t.audioFingerprint))&&typeof t.title==='string'&&t.title.length>0&&t.title.length<=300&&
 [t.artist,t.album].every(v=>v===null||typeof v==='string'&&v.length<=300)&&Number.isFinite(t.duration)&&t.duration>0&&
 (t.organizationRef===undefined||record(t.organizationRef)&&uuid(t.organizationRef.libraryId)&&uuid(t.organizationRef.id))&&
 typeof t.favorite==='boolean'&&positive(t.revision)&&typeof t.createdAt==='string'&&Number.isFinite(Date.parse(t.createdAt))&&
 record(t.manualOverrides)&&Object.entries(t.manualOverrides).every(([k,v])=>['title','artist','album'].includes(k)&&(typeof v==='string'&&v.length<=300||k!=='title'&&v===null));
}
function validTrack(value:unknown):value is LinkedTrack {return validStoredTrack(value)&&uuid(value.assetId);}
function matchesAsset(track:Track,asset:LocalAsset){
 const f=track.audioFingerprint;return f==null||validAudioFingerprint(f)&&f.sha256===asset.sha256&&f.bytes===asset.bytes;
}
export function validImportOperation(value:unknown,key:IDBValidKey):value is ImportOperation {
 // Persisted malformed nested values must remain enumerable as issues.
 try{return validateImportOperation(value,key);}catch{return false;}
}
function validateImportOperation(value:unknown,key:IDBValidKey):value is ImportOperation {
 if(!record(value))return false;const j=value as unknown as ImportOperation;
 if(j.version!==1||!uuid(j.operationId)||j.operationId!==key||!uuid(j.owner)||!positive(j.revision)||j.accountId!==undefined&&!uuid(j.accountId)||j.accountId!==undefined&&j.track!==undefined&&j.track.accountId!==j.accountId||
 !['writing','verifying','ready','publishing','uncertain','cleanup','discarded','sealed'].includes(j.state)||
 !['idb','opfs'].includes(j.backend)||!uuid(j.storageKey)||!positive(j.expectedBytes)||j.expectedBytes>100*1024*1024||
 !Number.isSafeInteger(j.bytes)||j.bytes<0||j.bytes>j.expectedBytes||j.cause!==undefined&&typeof j.cause!=='string'||j.libraryMode!==undefined&&j.libraryMode!=='cache')return false;
 if(j.asset!==undefined||j.track!==undefined||j.expectedAssetRevision!==undefined){
 if(!record(j.asset)||!validAsset(j.asset)||!validTrack(j.track)||!matchesAsset(j.track,j.asset)||j.track.assetId!==j.asset.id||j.asset.backend!==j.backend||j.asset.storageKey!==j.storageKey||
 j.asset.bytes!==j.expectedBytes||j.bytes!==j.expectedBytes||!Number.isSafeInteger(j.expectedAssetRevision)||j.expectedAssetRevision!<0||j.asset.revision!==j.expectedAssetRevision!+1)return false;
 }
 if(['verifying','ready','publishing','sealed'].includes(j.state)&&!j.asset)return false;
 if(j.result!==undefined&&(!record(j.result)||!validTrack(j.result.track)||typeof j.result.duplicate!=='boolean'||!j.asset||
 j.result.track.assetId!==j.asset.id||!matchesAsset(j.result.track,j.asset)||!j.result.duplicate&&(j.result.track.id!==j.track?.id||JSON.stringify(copyLocalAlbumMetadata(j.result.track.localAlbum))!==JSON.stringify(copyLocalAlbumMetadata(j.track?.localAlbum)))))return false;
 return j.state!=='sealed'||!!j.result;
}
async function jobEntries(){
 const db=await openDatabase();try{const tx=admittedTransaction(db,'jobs');const done=transactionDone(tx);const store=tx.objectStore('jobs');
 const keys=await request(store.getAllKeys());const values=await request<unknown[]>(store.getAll());await done;return keys.map((key,i)=>({key,value:values[i]}));}finally{closeDatabase(db);}
}
async function owned(job:ImportOperation){const proof=await readRecord<Ownership>('settings',ownershipKey(job));return proof?.operationId===job.operationId&&proof.owner===job.owner&&typeof proof.everPublished==='boolean'&&(!proof.everPublished||job.state==='sealed')?proof:undefined;}
// Include non-JSON structured-clone values and cycles so malformed records remain reviewable.
function issueSnapshot(value:unknown):string {
 const seen=new Map<object,number>();
 const encode=(v:unknown):unknown=>{
 if(v===undefined)return ['undefined'];if(typeof v==='bigint')return ['bigint',String(v)];
 if(typeof v==='number'&&!Number.isFinite(v))return ['number',String(v)];
 if(v===null||typeof v!=='object')return [typeof v,v];
 const previous=seen.get(v);if(previous!==undefined)return ['ref',previous];seen.set(v,seen.size);
 if(v instanceof Date)return ['date',v.getTime()];
 if(v instanceof ArrayBuffer)return ['buffer',Array.from(new Uint8Array(v))];
 if(ArrayBuffer.isView(v))return [v.constructor.name,Array.from(new Uint8Array(v.buffer,v.byteOffset,v.byteLength))];
 if(v instanceof Map)return ['map',Array.from(v,([k,item])=>[encode(k),encode(item)])];
 if(v instanceof Set)return ['set',Array.from(v,encode)];
 return [Array.isArray(v)?'array':'object',Object.keys(v).sort().map(k=>[k,encode((v as Record<string,unknown>)[k])])];
 };return JSON.stringify(encode(value));
}
export interface ImportIssue {key:IDBValidKey;kind:'legacy'|'invalid';snapshot:string;retained:boolean}
export async function importIssues():Promise<ImportIssue[]> {
 const issues:ImportIssue[]=[];
 for(const {key,value} of await jobEntries()){
 if(validImportOperation(value,key)&&await owned(value))continue;
 const snapshot=issueSnapshot(value);const receipt=await readRecord<{snapshot:string}>('settings',['import-issue-retained',key]);
 issues.push({key,kind:!!value&&typeof value==='object'&&!('version' in value)?'legacy':'invalid',snapshot,retained:receipt?.snapshot===snapshot});
 }return issues;
}
/** Explicit review: preserves the job and every byte, and never confers ownership. */
export async function retainImportIssue(issue:ImportIssue):Promise<void>{
 await navigator.locks.request(WRITER_LOCK,async()=>{
 const db=await openDatabase();try{const tx=admittedTransaction(db,['jobs','settings'],'readwrite');const done=transactionDone(tx);
 try{const value=await request(tx.objectStore('jobs').get(issue.key));const present=await request(tx.objectStore('jobs').count(issue.key));if(!present||issueSnapshot(value)!==issue.snapshot)fail('commit','internal','conflict','idb');
 tx.objectStore('settings').put({snapshot:issue.snapshot,classification:'retained'},['import-issue-retained',issue.key]);await done;
 }catch(error){try{tx.abort();}catch{/* settled */}await done.catch(()=>{});throw error;}}finally{closeDatabase(db);}
 });
}
export async function importOperations():Promise<ImportOperation[]> {
 const jobs:ImportOperation[]=[];for(const {key,value} of await jobEntries())if(validImportOperation(value,key)&&await owned(value))jobs.push(value);return jobs;
}
async function importOperationCore(operationId:string){
 const job=await readRecord<unknown>('jobs',operationId);return validImportOperation(job,operationId)&&await owned(job)?job:undefined;
}
async function updateOperationCore(job:ImportOperation,patch:Partial<Omit<ImportOperation,'operationId'|'owner'|'revision'|'version'>>,guard?:ImportOperationGuard):Promise<ImportOperation>{
 checkUse('write',guard);const db=await openDatabase();try{
 checkUse('write',guard);const tx=admittedTransaction(db,['jobs','settings'],'readwrite');const done=transactionDone(tx);const store=tx.objectStore('jobs');
 try{const now=await request<ImportOperation|undefined>(store.get(job.operationId));
 const proof=await request<Ownership|undefined>(tx.objectStore('settings').get(ownershipKey(job)));
 if(!proof||proof.owner!==job.owner||proof.operationId!==job.operationId||JSON.stringify(now)!==JSON.stringify(job)||!now||now.version!==1||now.owner!==job.owner||now.state!==job.state||now.revision!==job.revision){fail('write','internal','conflict','idb');}
 checkUse('write',guard);const next={...job,...patch,revision:job.revision+1};if(next.backend!==job.backend||next.storageKey!==job.storageKey||next.expectedBytes!==job.expectedBytes||next.libraryMode!==job.libraryMode||!validImportOperation(now,job.operationId)||!validImportOperation(next,job.operationId))fail('validate','internal','input-invalid','idb');store.put(next,job.operationId);await done;return next;
 }catch(error){try{tx.abort();}catch{/* settled */}await done.catch(()=>{});throw error;}
 }finally{closeDatabase(db);}
}
/** Caller owns WRITER_LOCK; key absence is checked before any ownership is minted. */
async function createOperationCore(job:ImportOperation){
 if(!validImportOperation(job,job.operationId)||job.state!=='writing'||job.bytes!==0||job.revision!==1||job.asset||job.result)fail('validate','internal','input-invalid','idb');
 if(job.backend==='opfs')try{await(await existingDirectory('read')).getFileHandle(job.storageKey);fail('open','internal','conflict','opfs');}catch(error){if(nativeDOMName(error)!=='NotFoundError')throw AppFailure.create(fromKnownError(error,{phase:'open',backend:'opfs'}));}
 const db=await openDatabase();try{const tx=admittedTransaction(db,['jobs','settings','chunks','assets'],'readwrite');const done=transactionDone(tx);
 try{
 const proof=await request(tx.objectStore('settings').get(ownershipKey(job)));
 const chunks=await request(tx.objectStore('chunks').count(IDBKeyRange.bound([job.storageKey],[job.storageKey+'\0'],false,true)));
 const assets=await request<LocalAsset[]>(tx.objectStore('assets').getAll());
 if(proof||chunks||assets.some(a=>a.backend===job.backend&&a.storageKey===job.storageKey))fail('write','internal','conflict','idb');
 tx.objectStore('jobs').add(job,job.operationId);tx.objectStore('settings').add({operationId:job.operationId,owner:job.owner,everPublished:false} satisfies Ownership,ownershipKey(job));await done;
 }catch(error){try{tx.abort();}catch{/* settled */}await done.catch(()=>{});throw error;}
 }finally{closeDatabase(db);}
}
export async function assertImportsResolved(){
 if((await importOperations()).some(job=>!terminal(job))||(await importIssues()).some(issue=>!issue.retained))fail('reconcile','write-uncertain','imports-unresolved','idb');
}
/** Keep keys and values together and validate the entire snapshot before any link/write.
 * A mismatched key may alias a healthy identity: neither row is safe to reconcile. */
async function publicationTracks(store:IDBObjectStore,asset:LocalAsset):Promise<Track[]> {
 const keys=await request(store.getAllKeys());const values=await request<unknown[]>(store.getAll());
 if(keys.length!==values.length||values.some((value,i)=>!validStoredTrack(value)||keys[i]!==value.id||
 value.assetId===asset.id&&!matchesAsset(value,asset)))fail('commit','integrity','relations-invalid','idb');
 return values as Track[];
}
/** Publication-only: current records were validated in this transaction, after byte verification. */
function linkRestoredTracks(store:IDBObjectStore,tracks:Track[],asset:LocalAsset):LinkedTrack[] {
 const linked:LinkedTrack[]=[];
 for(const track of tracks){
 const f=track.audioFingerprint;
 if(track.assetId!==null||!validAudioFingerprint(f)||f.sha256!==asset.sha256||f.bytes!==asset.bytes)continue;
 const next:LinkedTrack={...track,assetId:asset.id,audioFingerprint:{algorithm:'sha256',sha256:asset.sha256,bytes:asset.bytes},revision:track.revision+1};
 store.put(next,next.id);linked.push(next);
 }return linked;
}
async function promoteMembership(settings:IDBObjectStore,trackId:string){
 const key=libraryMembershipKey(trackId),value=await request(settings.get(key)),present=await request(settings.getKey(key));
 if(present===undefined)return;const member=copyLibraryMembership(value,trackId);if(!member)fail('commit','integrity','relations-invalid','idb');
 if(!member.added)settings.put(makeLibraryMembership(trackId,true),key);
}
/** Shared by normal import and recovery: verifies the existing generation before a short CAS. */
async function deduplicateOperationCore(job:ImportOperation,signal?:AbortSignal,guard?:ImportOperationGuard):Promise<ImportOperation|undefined>{
 checkUse('publish',guard);if(!validImportOperation(job,job.operationId)||!job.asset)fail('commit','internal','conflict','idb');
 const existing=await atBoundary('read','idb',()=>readRecord<LocalAsset>('assets',job.asset!.id));
 if(!existing)return;
 if(!validAsset(existing))fail('verify','integrity','local-corrupt','idb');
 if(existing.sha256!==job.asset.sha256||existing.bytes!==job.asset.bytes)return;
 let reader;
 try{reader=await openAssetReader(existing);}catch(error){
 const f=fromKnownError(error,{phase:'open',backend:existing.backend});
 if(f.code==='asset-missing')return;throw AppFailure.create(f);
 }
 try{const verified=await reader.verifyDetailed();if(verified.state==='unknown')throw AppFailure.create(verified.failure);if(verified.state!=='valid')return;}finally{reader.release();}
 const db=await openDatabase();let next:ImportOperation|undefined;
 try{const tx=admittedTransaction(db,['assets','tracks','jobs','settings'],'readwrite');const done=transactionDone(tx);const detach=abortOnSignal(tx,signal);
 try{
 const now=await request<LocalAsset|undefined>(tx.objectStore('assets').get(existing.id));
 const current=await request<unknown>(tx.objectStore('jobs').get(job.operationId));
 const proof=await request<Ownership|undefined>(tx.objectStore('settings').get(ownershipKey(job)));
 if(!proof||proof.owner!==job.owner||proof.operationId!==job.operationId||proof.everPublished!==false)fail('commit','internal','conflict','idb');
 const tracks=(await publicationTracks(tx.objectStore('tracks'),existing)).filter(t=>t.accountId===job.track?.accountId);const track=tracks.find((t):t is LinkedTrack=>t.assetId===existing.id);
 if(JSON.stringify(now)===JSON.stringify(existing)&&now?.revision===existing.revision&&now.storageKey===existing.storageKey&&now.backend===existing.backend&&validImportOperation(current,job.operationId)&&JSON.stringify(current)===JSON.stringify(job)&&current.owner===job.owner&&current.revision===job.revision&&current.state===job.state){
 checkUse('publish',guard);const linked=linkRestoredTracks(tx.objectStore('tracks'),tracks,existing);
 const resultTrack=track??linked[0];
 if(!resultTrack){await done;return;}
 if(job.libraryMode!=='cache')await promoteMembership(tx.objectStore('settings'),resultTrack.id);checkUse('publish',guard);
 next={...job,state:'cleanup',revision:job.revision+1,result:{track:resultTrack,duplicate:true}};tx.objectStore('jobs').put(next,job.operationId);
 }await done;
 }catch(error){try{tx.abort();}catch{/* Already committed/aborted. */}
 let aborted:unknown;await done.catch(cause=>{aborted=cause;});
 // Only a confirmed transaction abort can make its own cancellation (or a
 // derivative put on the inactive transaction) win over the raw rejection.
 // Independent failures such as quota keep their primary cause despite signal.
 if(fromKnownError(aborted,{phase:'commit',backend:'idb'}).code==='transaction-aborted'&&
 (nativeDOMName(error)==='TransactionInactiveError'||fromKnownError(error,{phase:'commit',backend:'idb'}).code==='transaction-aborted')){
 if(signal?.aborted)fail('commit','cancelled','cancelled','idb');
 fail('commit','storage-unavailable','transaction-aborted','idb');
 }
 throw error;}finally{detach();}
 }finally{closeDatabase(db);}
 if(next){checkUse('cleanup',guard);next=await cleanupOperation(next,guard);return updateOperation(next,{state:'sealed'},guard);}
}
function abortOnSignal(tx:IDBTransaction,signal?:AbortSignal){
 const abort=()=>{try{tx.abort();}catch{/* Commit already settled: preserve it. */}};
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 return ()=>signal?.removeEventListener('abort',abort);
}
async function publishOperationCore(job:ImportOperation,signal?:AbortSignal,guard?:ImportOperationGuard):Promise<ImportResult>{
 checkUse('publish',guard);if(!validImportOperation(job,job.operationId)||job.state!=='publishing'||!job.asset||!job.track)fail('commit','internal','conflict','idb');
 const db=await openDatabase();try{
 const tx=admittedTransaction(db,['assets','tracks','jobs','settings'],'readwrite');const done=transactionDone(tx);const detach=abortOnSignal(tx,signal);
 try{
 const current=await request<ImportOperation|undefined>(tx.objectStore('jobs').get(job.operationId));
 const previous=await request<LocalAsset|undefined>(tx.objectStore('assets').get(job.asset.id));
 const proof=await request<Ownership|undefined>(tx.objectStore('settings').get(ownershipKey(job)));
 if(!proof||proof.owner!==job.owner||proof.operationId!==job.operationId||proof.everPublished!==false||JSON.stringify(current)!==JSON.stringify(job)||!validImportOperation(current,job.operationId)||current.owner!==job.owner||current.revision!==job.revision||current.state!==job.state||(previous?.revision??0)!==job.expectedAssetRevision){fail('commit','internal','conflict','idb');}
 // Re-read inside the publication transaction: never put a stale Track over current edits.
 const tracks=(await publicationTracks(tx.objectStore('tracks'),job.asset)).filter(t=>t.accountId===job.track?.accountId);
 const existing=tracks.find((t):t is LinkedTrack=>t.assetId===job.asset!.id);
 if(signal?.aborted){tx.abort();await done;signal.throwIfAborted();}
 checkUse('publish',guard);const linked=linkRestoredTracks(tx.objectStore('tracks'),tracks,job.asset);
 const track=existing??linked[0]??job.track;const result={track,duplicate:!!existing||linked.length>0};
 tx.objectStore('settings').put({...proof,everPublished:true},ownershipKey(job));
 tx.objectStore('assets').put(job.asset,job.asset.id);
 if(!existing&&!linked.length){tx.objectStore('tracks').add(track,track.id);if(job.libraryMode==='cache')tx.objectStore('settings').add(makeLibraryMembership(track.id,false),libraryMembershipKey(track.id));}
 if(job.libraryMode!=='cache')await promoteMembership(tx.objectStore('settings'),track.id);checkUse('publish',guard);
 tx.objectStore('jobs').put({...job,state:'sealed',revision:job.revision+1,result},job.operationId);
 try{await done;}catch(error){if(signal?.aborted&&nativeDOMName(error)==='AbortError')fail('commit','cancelled','cancelled','idb');throw error;}return result;
 }catch(error){try{tx.abort();}catch{/* Already committed/aborted. */}
 let aborted:unknown;await done.catch(cause=>{aborted=cause;});
 // A put after our observed abort can throw TransactionInactiveError synchronously.
 // Prefer that confirmed abort over the derivative inactive-transaction exception.
 if(nativeDOMName(error)==='TransactionInactiveError'&&fromKnownError(aborted,{phase:'commit',backend:'idb'}).code==='transaction-aborted'){
 if(signal?.aborted)fail('commit','cancelled','cancelled','idb');
 fail('commit','storage-unavailable','transaction-aborted','idb');
 }
 throw error;}finally{detach();}
 }finally{closeDatabase(db);}
}
// Caller holds WRITER_LOCK. Only a reviewed staging generation in cleanup state is eligible.
async function cleanupOperationCore(job:ImportOperation,guard?:ImportOperationGuard):Promise<ImportOperation>{
 checkUse('cleanup',guard);if(!validImportOperation(job,job.operationId)||job.state!=='cleanup')fail('cleanup','internal','conflict','idb');
 return navigator.locks.request(generationLock(job),async()=>{
 checkUse('cleanup',guard);
 const current=await importOperation(job.operationId);
 if(JSON.stringify(current)!==JSON.stringify(job)||!current||current.owner!==job.owner||current.revision!==job.revision||current.state!=='cleanup')fail('cleanup','internal','conflict','idb');
 const proof=await owned(job);if(!proof||proof.everPublished)fail('cleanup','internal','conflict','idb');
 const references=await all<LocalAsset>('assets');
 if(references.some(a=>a.backend===job.backend&&a.storageKey===job.storageKey))fail('cleanup','internal','conflict','idb');
 if(job.backend==='opfs'){
 try{checkUse('cleanup',guard);const directory=await existingDirectory('cleanup',guard);checkUse('cleanup',guard);await directory.removeEntry(job.storageKey);}catch(error){if(nativeDOMName(error)!=='NotFoundError')throw error;}
 }else{
 const db=await openDatabase();try{const tx=admittedTransaction(db,'chunks','readwrite');const done=transactionDone(tx);
 const cursor=tx.objectStore('chunks').openCursor(IDBKeyRange.bound([job.storageKey,0],[job.storageKey,Number.MAX_SAFE_INTEGER]));
 cursor.onsuccess=()=>{try{checkUse('cleanup',guard);const c=cursor.result;if(c){c.delete();c.continue();}}catch{try{tx.abort();}catch{/* terminal */}}};await done;
 }finally{closeDatabase(db);}
 }
 return updateOperation(job,{state:'discarded'},guard);
 });
}
/** UI entry point. Acquires the same writer lock as importFile; do not wrap in that lock.
 * resume reopens and verifies before publication. discard explicitly reviews only staging;
 * published/kept generations are never deleted. expectedRevision prevents stale UI actions.
 */
async function recoverImportOperationCore(operationId:string,expectedRevision:number,action:'resume'|'discard',guard?:ImportOperationGuard):Promise<ImportOperation>{
 checkUse('read',guard);let job=await importOperation(operationId);
 if(!job||job.revision!==expectedRevision)fail('reconcile','internal','conflict','idb');
 if(terminal(job))return job;
 if(job.state==='cleanup'&&job.result){const cleaned=await cleanupOperation(job,guard);return updateOperation(cleaned,{state:'sealed'},guard);}
 // A fresh connection resolves post-commit uncertainty before any deletion or publication.
 const assets=await all<LocalAsset>('assets');
 if(assets.some(a=>a.backend===job!.backend&&a.storageKey===job!.storageKey))fail('reconcile','internal','conflict','idb');
 if(action==='discard'){
 // Reopen even for explicit discard. Missing staging is safe; other errors keep the operation paused.
 if(job.backend==='opfs')try{await(await(await existingDirectory('read',guard)).getFileHandle(job.storageKey)).getFile();}catch(error){if(nativeDOMName(error)!=='NotFoundError')throw AppFailure.create(fromKnownError(error,{phase:'open',backend:'opfs'}));}
 job=await updateOperation(job,{state:'cleanup'},guard);return cleanupOperation(job,guard);
 }
 if(!job.asset||!job.track)fail('validate','internal','input-invalid','idb');
 checkUse('read',guard);const reader=await openAssetReader(job.asset,false);try{checkUse('read',guard);const verified=await reader.verifyDetailed(true,{check:()=>checkUse('read',guard)});if(verified.state!=='valid')throw AppFailure.create(verified.failure);}finally{reader.release();}
 checkUse('publish',guard);const duplicate=await deduplicateOperation(job,undefined,guard);if(duplicate)return duplicate;
 job=await updateOperation(job,{state:'publishing'},guard);
 const result=await publishOperation(job,undefined,guard);
 // The observed native commit is terminal even if admission closes immediately afterwards.
 return {...job,state:'sealed',revision:job.revision+1,result};
}

export async function updateOperation(job:ImportOperation,patch:Partial<Omit<ImportOperation,'operationId'|'owner'|'revision'|'version'>>,guard?:ImportOperationGuard):Promise<ImportOperation>{return atBoundary('write','idb',()=>updateOperationCore(job,patch,guard));}

export async function createOperation(job:ImportOperation){return atBoundary('write','idb',()=>createOperationCore(job));}

export async function publishOperation(job:ImportOperation,signal?:AbortSignal,guard?:ImportOperationGuard):Promise<ImportResult>{return atBoundary('commit','idb',async()=>{try{return await publishOperationCore(job,signal,guard);}catch(error){const f=fromKnownError(error,{phase:'commit',backend:'idb'});if(signal?.aborted&&f.code==='transaction-aborted')fail('commit','cancelled','cancelled','idb');throw error;}});}

export async function deduplicateOperation(job:ImportOperation,signal?:AbortSignal,guard?:ImportOperationGuard){return atBoundary('commit','idb',()=>deduplicateOperationCore(job,signal,guard));}

export async function cleanupOperation(job:ImportOperation,guard?:ImportOperationGuard):Promise<ImportOperation>{return atBoundary('cleanup',job.backend,()=>cleanupOperationCore(job,guard));}

/** Same core and writer lock for legacy and detailed recovery. No historical cause strings are inspected. */
export async function recoverImportOperationDetailed(operationId:string,expectedRevision:number,action:'resume'|'discard',guard?:ImportOperationGuard):Promise<RecoveryAttemptResult>{
 let entered=false;
 try{return await navigator.locks.request(WRITER_LOCK,async()=>{
 entered=true;
 const attempt=new Attempt();attempt.started=true;
 try{
 const operation=await atBoundary('reconcile','idb',()=>recoverImportOperationCore(operationId,expectedRevision,action,guard));
 attempt.backend=operation.backend;attempt.closeState=operation.backend==='idb'?'not-applicable':'unknown';
 if(!terminal(operation))fail('reconcile','write-uncertain','write-uncertain',operation.backend);
 return {kind:'confirmed',operation,outcome:attempt.confirmed(operation.state==='sealed')};
 }catch(error){
 attempt.failure(fromKnownError(error,{phase:'reconcile',backend:'unknown'}));
 if(attempt.primary?.phase==='cleanup')attempt.secondary('cleanup',attempt.primary);
 try{
 const reopened=await atBoundary('reconcile','idb',()=>importOperation(operationId));
 if(reopened){if(reopened.state==='cleanup'&&reopened.result)attempt.pendingPublication=true;attempt.backend=reopened.backend;attempt.closeState=reopened.backend==='idb'?'not-applicable':'unknown';}
 if(reopened&&terminal(reopened)&&attempt.primary?.code!=='conflict'&&attempt.primary?.code!=='input-invalid')return {kind:'confirmed',operation:reopened,outcome:attempt.confirmed(reopened.state==='sealed')};
 }catch(reconcile){attempt.secondary('reconcile',fromKnownError(reconcile,{phase:'reconcile',backend:'idb'}));}
 return {kind:'failed',outcome:attempt.outcome('unknown')};
 } });}catch(error){
 const attempt=new Attempt();attempt.failure(fromKnownError(error,{phase:entered?null:'admit',backend:'unknown'}));
 return {kind:'failed',outcome:attempt.outcome(entered?'unknown':'not-started')};
 }
}

export async function recoverImportOperation(operationId:string,expectedRevision:number,action:'resume'|'discard',guard?:ImportOperationGuard):Promise<ImportOperation>{
 const result=await recoverImportOperationDetailed(operationId,expectedRevision,action,guard);
 if(result.kind==='confirmed')return result.operation;
 throw AppFailure.create(result.outcome.primary!);
}

export async function importOperation(operationId:string){return atBoundary('read','idb',()=>importOperationCore(operationId));}
