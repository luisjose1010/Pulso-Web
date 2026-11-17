import {ACTIVE_LIBRARY_ACCOUNT} from '../accounts/library-local';
/** Collection metadata CAS and explicit retirement of unreferenced copies.
 * The host supplies real reservations and fresh runtime-bound contexts. */
import {admittedTransaction, closeDatabase, openExistingDatabase, request} from '../storage/database';
import {transactionDone} from '../storage/transaction-done';
import {WRITER_LOCK} from '../storage/asset-reader';
import {groupAlbums} from './groups';
import {listeningCacheAssets} from './listening-cache';
import {copyLibraryMembership, libraryMembershipKey, makeLibraryMembership} from './library-membership';
import {describeRemovalData, validateTrack} from './local-copy-removal-snapshot';
import {copySourceAsset,sameSourceAsset} from '../playback/local-source-protocol';
import {normalizeSnapshot} from '../playback/queue-restore';
import type {LocalAsset, Playlist, Track} from './library';
import {discoverCopyRemoval,planUnreferencedCopyRemoval,confirmCopyRemoval,acknowledgeUnreferencedCopyRemoval,readCopyRemovalTarget,releaseCopyRemovalPlan,type RemovalContext,type RemovalReadContext,type RemovalTracking} from './local-copy-removal';

export type CollectionSelection = {kind:'playlist'; id:string; revision:number} | {kind:'album'; scope:'global-library'; key:string} | {kind:'cache'; scope:'global-listening-cache'};
export interface CollectionContext {readonly signal:AbortSignal; current():boolean}
declare const previewBrand: unique symbol;
export interface CollectionPreviewToken {readonly [previewBrand]:true}
export interface CollectionConsent {readonly confirm:true; readonly acceptPossibleOnlyCopyLoss:true}
export interface CollectionPreview {readonly token:CollectionPreviewToken; readonly tracks:number; readonly copiesEligible:number; readonly estimatedBytes:number; readonly retainedShared:number; readonly cleanupAvailable:true}
export interface CollectionOutcome {readonly metadata:'committed'|'not-committed'|'unknown'; readonly cleanup:'complete'|'stopped'|'not-started'; readonly freedBytes:number; readonly removed:number; readonly skipped:number; readonly skipReasons:readonly string[]; readonly reason:string|null}
/** Host must create a fresh context AFTER reservation; release settles its resources. */
export interface CollectionCleanupHost {readContext():RemovalReadContext;settlementReadContext?():RemovalReadContext;reserve(target:Readonly<LocalAsset>):Promise<{kind:'reserved';context:RemovalContext;release():Promise<void>}|{kind:'blocked';reason:string}>;record(tracking:RemovalTracking):Promise<boolean>;forget(tracking:RemovalTracking):Promise<boolean>}
type Row={key:IDBValidKey; value:unknown};
type Snapshot={accountId?:string;tracks:Track[]; playlists:Playlist[]; assets:LocalAsset[]; membership:Map<string,boolean>; queued:Set<string>; canonical:string};
type Data={selection:CollectionSelection; snapshot:Snapshot; affected:string[]; context:CollectionContext};
const previews=new WeakMap<CollectionPreviewToken,Data>();
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function check(c:CollectionContext):void {if(c.signal.aborted||c.current()!==true)throw new Error('collection-stale');}
async function rows(tx:IDBTransaction, name:string):Promise<Row[]> {
 const store=tx.objectStore(name);const [keys,values]=await Promise.all([request(store.getAllKeys()),request(store.getAll())]);
 if(keys.length>20000||keys.length!==values.length)throw new Error('collection-limit');
 return keys.map((key,i)=>({key,value:values[i]}));
}
async function snapshot(tx:IDBTransaction,c:CollectionContext):Promise<Snapshot> {
 check(c);const [tr,pl,as]=await Promise.all(['tracks','playlists','assets'].map(n=>rows(tx,n)));check(c);
 const tracks=tr.map(r=>validateTrack(r.value,r.key)); const ids=new Set(tracks.map(t=>t.id));
 const playlists=pl.map(({key,value})=>{
  if(!value||typeof value!=='object')throw new Error('collection-invalid');const p=value as Playlist;
  if(!uuid(p.id)||key!==p.id||!Number.isSafeInteger(p.revision)||p.revision<1||typeof p.name!=='string'||!Array.isArray(p.entries)||p.entries.length>20000)throw new Error('collection-invalid');
  const entryIds=new Set<string>();for(const e of p.entries){if(!e||!uuid(e.id)||!uuid(e.trackId)||!ids.has(e.trackId)||entryIds.has(e.id))throw new Error('collection-invalid');entryIds.add(e.id);}return p;
 });
 const assets=as.map(({key,value})=>{const a=copySourceAsset(value);if(!a||a.id!==key)throw new Error('collection-invalid');return a;});
 const generations=new Set(assets.map(a=>JSON.stringify([a.backend,a.storageKey])));if(generations.size!==assets.length)throw new Error('collection-invalid');
 const assetIds=new Set(assets.map(a=>a.id));if(tracks.some(t=>t.assetId!==null&&!assetIds.has(t.assetId)))throw new Error('collection-invalid');
 const membership=new Map(tracks.map(t=>[t.id,true]));
 const store=tx.objectStore('settings');const relevant=(await Promise.all(tracks.map(async t=>{const key=libraryMembershipKey(t.id);const [value,present]=await Promise.all([request(store.get(key)),request(store.getKey(key))]);return present===undefined?null:{key,value};}))).filter(r=>r!==null);
 for(const r of relevant){const key=r.key as [string,number,string];const m=copyLibraryMembership(r.value,key[2]);if(!m)throw new Error('collection-invalid');membership.set(m.trackId,m.added);}
 const rawQueue=await request(store.get('library-playback'));const queued=new Set<string>();if(rawQueue!==undefined){const q=normalizeSnapshot(rawQueue);if(!q||q.warnings.length||describeRemovalData(rawQueue)!==describeRemovalData(q.snapshot)||q.snapshot.entries.some(e=>!ids.has(e.trackId)))throw new Error('collection-invalid');for(const entry of q.snapshot.entries)queued.add(entry.trackId);}
 const accountId=await request<string|undefined>(store.get(ACTIVE_LIBRARY_ACCOUNT));const canonical=describeRemovalData([tr,pl,as,relevant,rawQueue,accountId]);return {accountId,tracks,playlists,assets,membership,queued,canonical};
}
function affectedFor(s:Snapshot,selection:CollectionSelection):string[] {
 if(selection.kind==='playlist') {const p=s.playlists.find(p=>p.id===selection.id&&p.revision===selection.revision&&p.accountId===s.accountId);if(!p)throw new Error('collection-changed');return [...new Set(p.entries.map(e=>e.trackId))];}
 if(selection.kind==='cache'){
  if(selection.scope!=='global-listening-cache')throw new Error('collection-invalid');
  const assets=listeningCacheAssets({tracks:s.tracks,assets:s.assets,libraryTrackIds:new Set([...s.membership].filter(([,added])=>added).map(([id])=>id)),playlists:s.playlists});
  const ids=new Set(assets.map(a=>a.id));return s.tracks.filter(t=>t.assetId!==null&&ids.has(t.assetId)).map(t=>t.id);
 }
 if(selection.scope!=='global-library')throw new Error('collection-invalid');
 const group=groupAlbums(s.tracks.filter(t=>s.membership.get(t.id)&&t.accountId===s.accountId)).find(g=>g.key===selection.key);
 if(!group||group.unknown)throw new Error('collection-changed');return [...new Set(group.trackIds)];
}
async function read(c:CollectionContext):Promise<Snapshot>{check(c);const db=await openExistingDatabase();try{check(c);const tx=admittedTransaction(db,['tracks','playlists','assets','settings']);const done=transactionDone(tx);try{const s=await snapshot(tx,c);await done;check(c);return s;}catch(e){try{tx.abort();}catch{}await done.catch(()=>{});throw e;}}finally{closeDatabase(db);}}
export async function previewCollectionRemoval(selection:CollectionSelection,c:CollectionContext):Promise<CollectionPreview>{
 if(selection.kind==='playlist'&&(!uuid(selection.id)||!Number.isSafeInteger(selection.revision)||selection.revision<1)||selection.kind==='album'&&(selection.scope!=='global-library'||typeof selection.key!=='string')||selection.kind==='cache'&&selection.scope!=='global-listening-cache'||!['playlist','album','cache'].includes(selection.kind))throw new Error('collection-invalid');
 const s=await read(c);const affected=affectedFor(s,selection);const affectedSet=new Set(affected);
 const remainingLists=selection.kind==='playlist'?s.playlists.filter(p=>p.id!==selection.id):s.playlists;
 const protectedIds=new Set(remainingLists.flatMap(p=>p.entries.map(e=>e.trackId)));
 const candidateAssets=s.assets.filter(a=>s.tracks.some(t=>affectedSet.has(t.id)&&t.assetId===a.id));let eligible=0,estimatedBytes=0,shared=0;
 for(const a of candidateAssets){const related=s.tracks.filter(t=>t.assetId===a.id||t.assetId===null&&t.audioFingerprint?.sha256===a.sha256&&t.audioFingerprint.bytes===a.bytes);
  const protectedCopy=related.some(t=>t.favorite||protectedIds.has(t.id)||s.queued.has(t.id)||s.membership.get(t.id)&&!(selection.kind==='album'&&affectedSet.has(t.id)));
  if(protectedCopy)shared++;else{eligible++;estimatedBytes+=a.bytes;}}
 const token=Object.freeze({}) as CollectionPreviewToken;previews.set(token,{selection:{...selection},snapshot:s,affected,context:c});
 return Object.freeze({token,tracks:affected.length,copiesEligible:eligible,estimatedBytes,retainedShared:shared,cleanupAvailable:true});
}
export function releaseCollectionRemovalPreview(token:CollectionPreviewToken):void {previews.delete(token);}
export async function confirmCollectionRemoval(token:CollectionPreviewToken,consent:CollectionConsent,c:CollectionContext,host:CollectionCleanupHost):Promise<CollectionOutcome>{
 const d=previews.get(token);previews.delete(token);const rejected=(reason:string):CollectionOutcome=>({metadata:'not-committed',cleanup:'not-started',freedBytes:0,removed:0,skipped:0,skipReasons:[],reason});
 if(!d||d.context!==c||consent?.confirm!==true||consent.acceptPossibleOnlyCopyLoss!==true)return rejected('invalid-preview-or-consent');
 if(!host||typeof host.readContext!=='function'||typeof host.reserve!=='function'||typeof host.record!=='function'||typeof host.forget!=='function')return rejected('invalid-cleanup-host');
 let metadata:CollectionOutcome;
 try{metadata=await navigator.locks.request(WRITER_LOCK,{signal:c.signal},async()=>{
  check(c);const db=await openExistingDatabase();let tx:IDBTransaction|undefined;let done:Promise<void>|undefined;let dispatched=false;
  try{check(c);tx=admittedTransaction(db,['tracks','playlists','assets','settings'],'readwrite');done=transactionDone(tx);const native=tx;
   const abort=()=>{try{native.abort();}catch{}};c.signal.addEventListener('abort',abort,{once:true});
   try{const s=await snapshot(tx,c);if(s.canonical!==d.snapshot.canonical)throw new Error('collection-changed');const ids=affectedFor(s,d.selection);if(describeRemovalData(ids)!==describeRemovalData(d.affected))throw new Error('collection-changed');check(c);
    if(d.selection.kind==='playlist')tx.objectStore('playlists').delete(d.selection.id);
    else if(d.selection.kind==='album')for(const id of ids)tx.objectStore('settings').put(makeLibraryMembership(id,false),libraryMembershipKey(id));
    dispatched=true;await done;return {metadata:'committed',cleanup:'not-started',freedBytes:0,removed:0,skipped:0,skipReasons:[],reason:null} as CollectionOutcome;
   }finally{c.signal.removeEventListener('abort',abort);}
  }catch(e){if(tx&&done){try{tx.abort();}catch{}let aborted=false;await done.catch(()=>{aborted=true;});if(dispatched&&!aborted)return {...rejected('commit-settlement-unknown'),metadata:'unknown'} as CollectionOutcome;}return rejected(e instanceof Error?e.message:'collection-failed');}
  finally{closeDatabase(db);}
 });}catch(e){return rejected(e instanceof Error?e.message:'collection-failed');}
 if(metadata.metadata!=='committed')return metadata;
 let freedBytes=0,removed=0,skipped=0;const skipReasons:string[]=[];const skip=(reason:string)=>{skipped++;skipReasons.push(reason);};
 const affected=new Set(d.affected),assets=d.snapshot.assets.filter(a=>d.snapshot.tracks.some(t=>affected.has(t.id)&&t.assetId===a.id));
 const stop=(reason:string):CollectionOutcome=>({metadata:'committed',cleanup:'stopped',freedBytes,removed,skipped,skipReasons,reason});
 for(const asset of assets){
  try{check(c);const track=d.snapshot.tracks.find(t=>t.assetId===asset.id&&affected.has(t.id))!;
   const discovery=await discoverCopyRemoval({namespace:'local',trackId:track.id,expectedTrackRevision:track.revision},host.readContext());
   if(discovery.kind!=='candidate'){skip(discovery.reason);continue;}
   const reserved=await host.reserve(discovery.target);if(reserved.kind==='blocked'){skip(reserved.reason);continue;}
   try{check(c);const context:RemovalContext={signal:c.signal,current:()=>c.current()&&reserved.context.current(),runtimeProtectionCurrent:a=>c.current()&&reserved.context.runtimeProtectionCurrent(a)};const planned=await planUnreferencedCopyRemoval(discovery.candidate,context);if(planned.kind!=='ready'){skip(planned.reason);continue;}
    if(c.signal.aborted||!c.current()){releaseCopyRemovalPlan(planned.plan);return stop('cancelled');}
    let recorded=false;try{recorded=await host.record(planned.tracking);}catch{/* fail closed */}if(!recorded){releaseCopyRemovalPlan(planned.plan);return stop('tracking-unavailable');}
    const result=await confirmCopyRemoval(planned.plan,{planRevision:planned.planRevision,declaration:'accept-possible-only-original-loss',confirmRemoveThisCopy:true},context);
    if(result.preparation==='not-dispatched'||result.preparation==='aborted'){if(!await host.forget(planned.tracking))return stop('tracking-uncertain');skip(result.primary?`${result.primary.phase}:${result.primary.code}`:'not-committed');continue;}
    if(result.recoveryRequired||result.state!=='removed'&&result.state!=='not-committed')return stop('receipt-uncertain');
    // Keep the durable terminal receipt until the independent tab pointer is
    // cleared. A failed pointer clear can then still be inspected; deleting the
    // journal first could strand a pointer with no recoverable receipt.
    if(!await host.forget(planned.tracking))return stop('tracking-uncertain');
    if(!await acknowledgeUnreferencedCopyRemoval(result,context)){
     // ACK may have committed before its caller observed cancellation. Restore
     // discovery only if a fresh read proves the original journal still exists;
     // never create a pointer to an already-pruned journal or repeat a deletion.
     const settled=host.settlementReadContext?.()??host.readContext();
     const retained=await readCopyRemovalTarget(planned.tracking,settled);
     if(retained&&sameSourceAsset(retained,discovery.target)&&!await host.record(planned.tracking))return stop('tracking-uncertain');
     return stop('acknowledgement-uncertain');
    }
    if(result.state==='removed'){removed++;freedBytes+=asset.bytes;}else skip(result.primary?.code??'not-committed');
   }finally{await reserved.release();}
  }catch{return stop(c.signal.aborted?'cancelled':'cleanup-failed');}
 }
 if(c.signal.aborted||!c.current())return stop('cancelled');return {metadata:'committed',cleanup:'complete',freedBytes,removed,skipped,skipReasons,reason:null};
}
