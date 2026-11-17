import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {AppFailure,fail,fromKnownError,makeFailure,nativeDOMName,type FailureV1} from '../errors/app-failure';
import {admittedTransaction,assertDatabaseUse,closeDatabase,openExistingDatabase,request} from '../storage/database';
import {transactionDone} from '../storage/transaction-done';
import {ASSET_DIRECTORY,generationLock,WRITER_LOCK,openAssetReader} from '../storage/asset-reader';
import {copySourceAsset,closedObject,sameSourceAsset} from '../playback/local-source-protocol';
import {runCopyWorker} from './local-copy-client';
import {copyLibraryMembership,libraryMembershipKey} from './library-membership';
import {normalizeSnapshot} from '../playback/queue-restore';
import type {LocalAsset} from './library';
import {REMOVAL_LIMITS as L,removalUUID as uuid,positive,journalKey,markerKey,copyRemovalConsent,copyRemovalTracking,type RemovalTracking,type RemovalCandidate,type RemovalPlan,type RemovalContinuation,type RemovalReadContext,type RemovalContext,type RemovalDiscovery,type RemovalPreview,type RemovalBlocked,type RemovalSummary,type RemovalJournalV1,type RemovalConsent,type RemovalOutcome,type RemovalInspection} from './local-copy-removal-contract';
import {removalStores,scanRemovalSnapshot,scanRemovalPrefix,validateRemovalSnapshot,validateRemovalPrefix,validateTrack,identityKey,describeRemovalData,changed,corrupt,checkRemovalChunks,type RemovalSnapshot} from './local-copy-removal-snapshot';
export type * from './local-copy-removal-contract';
export {copyRemovalConsent,copyRemovalTracking} from './local-copy-removal-contract';
const digest=(s:string)=>bytesToHex(sha256(new TextEncoder().encode(s)));
const candidates=new WeakMap<RemovalCandidate,{target:LocalAsset;trackId:string;revision:number}>();
interface PlanData {target:LocalAsset;snapshot:RemovalSnapshot;summary:RemovalSummary;tracking:RemovalTracking;planRevision:number;context:RemovalContext;used:boolean;controller:AbortController;settlement:Promise<RemovalOutcome>|null;detachedDigest:string;planDigest:string;preparedDispatched:boolean;strict:boolean}
const plans=new WeakMap<RemovalPlan,PlanData>();
const settledOutcomes=new WeakMap<RemovalOutcome,{context:RemovalContext;target:LocalAsset;tracking:RemovalTracking;state:'removed'|'not-committed';revision:number}>();
const strictOutcomeResults=new WeakSet<RemovalOutcome>();
const continuations=new WeakMap<RemovalContinuation,{journal:RemovalJournalV1;context:RemovalContext;planRevision:number;used:boolean}>();
let activePlan:RemovalPlan|null=null;
let planning=false;
const confirmedAborts=new WeakSet<object>();
function checkRead(c:RemovalReadContext,ignoreAbort=false){if(!ignoreAbort&&c.signal.aborted)fail('validate','cancelled','cancelled','none');let live=false;try{live=c.current()===true;}catch{/* fail closed */}if(!live)fail('validate','internal','owner-unavailable','none');assertDatabaseUse('read');}
function check(c:RemovalContext,a:LocalAsset,ignoreAbort=false){checkRead(c,ignoreAbort);let protectedRuntime=false;try{protectedRuntime=c.runtimeProtectionCurrent(a)===true;}catch{/* closed */}if(!protectedRuntime)fail('validate','internal','owner-unavailable','none');}
async function transaction<T>(stores:string[],mode:IDBTransactionMode,c:RemovalReadContext,fn:(tx:IDBTransaction)=>Promise<T>,ignoreAbort=false,onDispatch?:()=>void):Promise<T>{
 checkRead(c,ignoreAbort);const db=await openExistingDatabase();let tx:IDBTransaction|undefined;
 try{checkRead(c,ignoreAbort);tx=admittedTransaction(db,stores,mode);onDispatch?.();const native=tx,done=transactionDone(tx);let ownAbort=false;
 const abort=()=>{try{native.abort();ownAbort=true;}catch{/* native committed winner */}};
 if(!ignoreAbort)c.signal.addEventListener('abort',abort,{once:true});
 try{if(!ignoreAbort&&c.signal.aborted)abort();const value=await fn(tx);await done;return value;}
 catch(e){try{tx.abort();}catch{/* settled */}let aborted:unknown,confirmedAbort=false;await done.catch(v=>{aborted=v;confirmedAbort=true;});if(confirmedAbort&&e&&typeof e==='object')confirmedAborts.add(e);const f=fromKnownError(e,{phase:mode==='readwrite'?'commit':'read',backend:'idb'});
 if(ownAbort&&fromKnownError(aborted,{phase:'commit',backend:'idb'}).code==='transaction-aborted'&&(['transaction-aborted','cancelled'].includes(f.code)||nativeDOMName(e)==='TransactionInactiveError')){const cancelled=AppFailure.create(makeFailure('commit','cancelled','cancelled','idb'));confirmedAborts.add(cancelled);throw cancelled;}throw e;
 }finally{if(!ignoreAbort)c.signal.removeEventListener('abort',abort);}
 }finally{closeDatabase(db);}
}
const scan=(c:RemovalReadContext)=>transaction(removalStores,'readonly',c,tx=>scanRemovalSnapshot(tx,()=>checkRead(c)));
async function locked<T>(name:string,work:()=>Promise<T>):Promise<T>{return navigator.locks.request(name,{ifAvailable:true},lock=>{if(!lock)fail('validate','internal','conflict','none');return work();});}
// A verify worker releases its shared lock asynchronously after its terminal
// message. Give that release a bounded chance to settle, without waiting on
// WRITER_LOCK or holding it while another reader is active.
async function boundedGeneration<T>(name:string,work:()=>Promise<T>):Promise<T>{
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),250);let acquired=false;
 try{return await navigator.locks.request(name,{signal:controller.signal},async()=>{acquired=true;clearTimeout(timer);return work();});}
 catch(e){if(!acquired&&controller.signal.aborted)fail('validate','internal','conflict','none');throw e;}
 finally{clearTimeout(timer);}
}
const fenced=<T>(j:Pick<RemovalJournalV1,'operationId'|'target'>,fn:()=>Promise<T>,bounded=false)=>locked('pulso-web:local:copy-removal:'+j.operationId,()=>(bounded?boundedGeneration:locked)(generationLock(j.target),()=>locked(WRITER_LOCK,fn)));
function blocked(e:unknown):RemovalBlocked {
 const f=fromKnownError(e,{phase:'validate',backend:'idb'});const reason=f.code==='conflict'?'busy':f.code==='limit-exceeded'?'limit':f.code==='asset-missing'?'missing':['local-corrupt','relations-invalid','digest-mismatch','length-mismatch'].includes(f.code)?'corrupt':f.code==='asset-changed'?'changed':f.code==='owner-unavailable'?'runtime-unknown':f.code==='cancelled'?'cancelled':'unavailable';return {kind:'blocked',reason,failure:f};
}
function outcome(j:RemovalJournalV1|null,primary:FailureV1|null=null,physical?:RemovalOutcome['physical'],publication?:RemovalOutcome['publication']):RemovalOutcome {
 const unlinked=!!j&&['detached','deleting','removed'].includes(j.state);
 return {tracking:j?{incarnation:j.incarnation,operationId:j.operationId}:null,state:j?.state??'unknown',journalRevision:j?.revision??null,publication:publication??(unlinked?'unpublished':j?.state==='not-committed'?'linked':'unknown'),physical:physical??(j?.state==='removed'?'absent':'unknown'),recoveryRequired:!j||!['removed','not-committed'].includes(j.state),preparation:j?'recorded':'uncertain',primary,secondary:[]};
}
function snapshotCAS(s:RemovalSnapshot,j:RemovalJournalV1,detached:boolean,expectedCanonical?:string){validateRemovalSnapshot(s,j.target,detached,j);if(expectedCanonical===undefined?digest(s.canonical)!==(detached?j.detachedDigest:j.planDigest):s.canonical!==expectedCanonical)changed();const p=validateRemovalPrefix(s);if(p.incarnation!==j.incarnation)changed();const now=p.journals.find(x=>x.operationId===j.operationId);if(!now||describeRemovalData(now)!==describeRemovalData(j))changed();return p;}
function putJournal(tx:IDBTransaction,j:RemovalJournalV1){const st=tx.objectStore('settings');st.put(j,journalKey(j.operationId));if(j.state==='not-committed')st.delete(markerKey(j.target));else st.put({version:1,incarnation:j.incarnation,operationId:j.operationId,revision:j.revision},markerKey(j.target));}
async function transition(j:RemovalJournalV1,state:RemovalJournalV1['state'],c:RemovalContext,ignoreAbort=false):Promise<RemovalJournalV1>{
 const settlementContext=ignoreAbort?{...c,signal:new AbortController().signal}:c;const expected=await coherent(j,settlementContext);
 return transaction(removalStores,'readwrite',c,async tx=>{check(c,j.target,ignoreAbort);const s=await scanRemovalSnapshot(tx,()=>check(c,j.target,ignoreAbort));snapshotCAS(s,j,j.state!=='prepared',expected.canonical);check(c,j.target,ignoreAbort);const next={...j,state,revision:j.revision+1};putJournal(tx,next);return next;},ignoreAbort);
}
function detachedProjection(s:RemovalSnapshot,a:LocalAsset):string {
 return removalStores.map(n=>n+':'+s.entries[n].filter(e=>n!=='assets'||e.key!==a.id).map(e=>{
 if(n!=='tracks')return e.descriptor;const t=validateTrack(e.value,e.key);return t.assetId===a.id?describeRemovalData([e.key,{...t,assetId:null,audioFingerprint:{algorithm:'sha256',sha256:a.sha256,bytes:a.bytes},revision:t.revision+1}]):e.descriptor;
 }).join('|')).join('\n');
}
/** Short read, no Activity held, no durable writes. Root must reserve AFTER this
 * settles and create a NEW context because reserve invalidates old guards. */
export async function discoverCopyRemoval(input:{namespace:'local';trackId:string;expectedTrackRevision:number},c:RemovalReadContext):Promise<RemovalDiscovery>{
 try{const m=closedObject(input,['namespace','trackId','expectedTrackRevision']);if(!m||m.namespace!=='local'||!uuid(m.trackId)||!positive(m.expectedTrackRevision))corrupt();checkRead(c);const s=await scan(c);checkRead(c);validateRemovalPrefix(s);const row=s.entries.tracks.find(e=>e.key===m.trackId);if(!row)changed();const t=validateTrack(row.value,row.key);if(t.revision!==m.expectedTrackRevision||!t.assetId)changed();const a=copySourceAsset(s.entries.assets.find(e=>e.key===t.assetId)?.value);if(!a)corrupt();if(a.bytes>L.audioBytes)fail('validate','internal','limit-exceeded',a.backend);validateRemovalSnapshot(s,a);
 const candidate=Object.freeze({}) as RemovalCandidate;candidates.set(candidate,{target:a,trackId:t.id,revision:t.revision});return {kind:'candidate',candidate,target:Object.freeze({...a})};
 }catch(e){return blocked(e);}
}
async function verifyPublished(a:LocalAsset,c:RemovalContext){check(c,a);const r=await runCopyWorker('verify',a,{signal:c.signal,current:()=>{check(c,a);return true;}});check(c,a);if(r.kind!=='verified')fail('verify','internal','worker-protocol',a.backend);if(r.result.availability!=='present'||r.result.integrity!=='verified')throw AppFailure.create(r.result.failure??makeFailure('verify','integrity','local-corrupt',a.backend));}
export async function planCopyRemoval(candidate:RemovalCandidate,c:RemovalContext):Promise<RemovalPreview>{
 return plan(candidate,c,false);
}
/** Restrictive collection policy; this entry point cannot grant manual removal authority. */
export async function planUnreferencedCopyRemoval(candidate:RemovalCandidate,c:RemovalContext):Promise<RemovalPreview>{
 return plan(candidate,c,true);
}
async function strictPolicy(tx:IDBTransaction,s:RemovalSnapshot,a:LocalAsset,c:RemovalContext):Promise<void>{
 const tracks=s.entries.tracks.map(e=>validateTrack(e.value,e.key));
 const related=tracks.filter(t=>t.assetId===a.id||t.assetId===null&&t.audioFingerprint?.algorithm==='sha256'&&t.audioFingerprint.sha256===a.sha256&&t.audioFingerprint.bytes===a.bytes);
 const ids=new Set(related.map(t=>t.id));if(related.some(t=>t.favorite))changed();
 for(const row of s.entries.playlists){const p=row.value as {entries:{trackId:string}[]};if(p.entries.some(e=>ids.has(e.trackId)))changed();}
 for(const row of s.entries.settings)if(row.key==='library-playback'){const q=normalizeSnapshot(row.value);if(!q||q.warnings.length||q.snapshot.entries.some(e=>ids.has(e.trackId)))changed();}
 const settings=tx.objectStore('settings');const values=await Promise.all(related.map(async t=>{const key=libraryMembershipKey(t.id);const [value,present]=await Promise.all([request(settings.get(key)),request(settings.getKey(key))]);return {id:t.id,value,present};}));
 for(const v of values){if(v.present===undefined)changed();const membership=copyLibraryMembership(v.value,v.id);if(!membership)corrupt();if(membership.added)changed();}check(c,a);
}
async function strictScan(c:RemovalContext,a:LocalAsset):Promise<RemovalSnapshot>{return transaction(removalStores,'readonly',c,async tx=>{const s=await scanRemovalSnapshot(tx,()=>check(c,a));validateRemovalSnapshot(s,a);await strictPolicy(tx,s,a,c);return s;});}
async function plan(candidate:RemovalCandidate,c:RemovalContext,strict:boolean):Promise<RemovalPreview>{
 if(planning)return blocked(AppFailure.create(makeFailure('validate','internal','conflict','none')));planning=true;
 try{const d=candidates.get(candidate);if(!d)changed();if(activePlan)fail('validate','internal','conflict','none');check(c,d.target);let s=await scan(c);check(c,d.target);const p=validateRemovalPrefix(s);const v=validateRemovalSnapshot(s,d.target);const t=v.aliases.find(t=>t.id===d.trackId);if(!t||t.revision!==d.revision)changed();if(s.prefix.some(e=>e.key===markerKey(d.target))||p.journals.length>=L.journals)fail('validate','internal','conflict','idb');
 if(strict)await strictScan(c,d.target);await verifyPublished(d.target,c);const after=strict?await strictScan(c,d.target):await scan(c);check(c,d.target);if(s.canonical!==after.canonical||describeRemovalData(s.prefix)!==describeRemovalData(after.prefix))changed();s=after;
 // Identity initialization is deferred to explicit confirmation, atomically with
 // prepared. Merely opening/previewing does not create a removal epoch.
 const tracking=Object.freeze({incarnation:p.incarnation??crypto.randomUUID(),operationId:crypto.randomUUID()});const plan=Object.freeze({}) as RemovalPlan;
 plans.set(plan,{target:d.target,snapshot:s,summary:v.summary,tracking,planRevision:1,context:c,used:false,controller:new AbortController(),settlement:null,detachedDigest:digest(detachedProjection(s,d.target)),planDigest:digest(s.canonical),preparedDispatched:false,strict});activePlan=plan;candidates.delete(candidate);return {kind:'ready',plan,tracking,planRevision:1,summary:Object.freeze({...v.summary})};
 }catch(e){return blocked(e);}finally{planning=false;}
}
async function prepare(d:PlanData,consent:RemovalConsent,c:RemovalContext):Promise<RemovalJournalV1>{
 return transaction(removalStores,'readwrite',c,async tx=>{check(c,d.target);const s=await scanRemovalSnapshot(tx,()=>check(c,d.target));const p=validateRemovalPrefix(s);if(s.canonical!==d.snapshot.canonical||describeRemovalData(s.prefix)!==describeRemovalData(d.snapshot.prefix))changed();const v=validateRemovalSnapshot(s,d.target);if(p.journals.length>=L.journals||p.incarnation!==null&&p.incarnation!==d.tracking.incarnation||s.prefix.some(e=>e.key===markerKey(d.target)))changed();
 if(d.strict)await strictPolicy(tx,s,d.target,c);
 const j:RemovalJournalV1={version:1,namespace:'local',...d.tracking,revision:1,state:'prepared',target:d.target,planRevision:d.planRevision,planDigest:d.planDigest,detachedDigest:d.detachedDigest,consent,tracks:v.aliases.map(t=>({id:t.id,beforeRevision:t.revision,afterRevision:t.revision+1})),summary:v.summary};
 // Charge the actual persistent prefix INCLUDING the new marker/identity.
 const projected=[...s.prefix.map(e=>[e.key,e.value]),[identityKey,{version:1,incarnation:j.incarnation}],[journalKey(j.operationId),j],[markerKey(j.target),{version:1,incarnation:j.incarnation,operationId:j.operationId,revision:1}]];describeRemovalData(projected,{left:L.prefixBytes});check(c,d.target);if(!p.incarnation)tx.objectStore('settings').add({version:1,incarnation:j.incarnation},identityKey);putJournal(tx,j);return j;
 },false,()=>{d.preparedDispatched=true;});
}
async function detach(j:RemovalJournalV1,c:RemovalContext):Promise<RemovalJournalV1>{
 const expected=await coherent(j,c);
 return transaction(removalStores,'readwrite',c,async tx=>{check(c,j.target);const s=await scanRemovalSnapshot(tx,()=>check(c,j.target));snapshotCAS(s,j,false,expected.canonical);const {aliases}=validateRemovalSnapshot(s,j.target);check(c,j.target);
 for(const t of aliases)tx.objectStore('tracks').put({...t,assetId:null,revision:t.revision+1,audioFingerprint:{algorithm:'sha256',sha256:j.target.sha256,bytes:j.target.bytes}},t.id);
 tx.objectStore('assets').delete(j.target.id);const next={...j,state:'detached' as const,revision:j.revision+1};putJournal(tx,next);return next;
 });
}
async function coherent(j:RemovalJournalV1,c:RemovalContext){check(c,j.target);const s=await scan(c);check(c,j.target);snapshotCAS(s,j,['detached','deleting','removed'].includes(j.state));return s;}
async function directory(c:RemovalContext,a:LocalAsset){check(c,a);const root=await navigator.storage.getDirectory();check(c,a);const dir=await root.getDirectoryHandle(ASSET_DIRECTORY,{create:false});check(c,a);return dir;}
async function physical(j:RemovalJournalV1,c:RemovalContext):Promise<'present'|'absent'> {
 check(c,j.target);if(j.target.backend==='idb')return transaction(['chunks'],'readonly',c,tx=>checkRemovalChunks(tx,j.target,()=>check(c,j.target),true));
 try{const dir=await directory(c,j.target);check(c,j.target);const handle=await dir.getFileHandle(j.target.storageKey,{create:false});check(c,j.target);const f=await handle.getFile();check(c,j.target);if(f.size!==j.target.bytes)corrupt();return 'present';}catch(e){if(nativeDOMName(e)==='NotFoundError'){check(c,j.target);return 'absent';}throw e;}
}
async function remove(j:RemovalJournalV1,c:RemovalContext,observe:(j:RemovalJournalV1)=>void=()=>{}):Promise<RemovalJournalV1>{
 try{return await removeCore(j,c,observe);}catch(e){throw AppFailure.create(fromKnownError(e,{phase:'cleanup',backend:j.target.backend}));}
}
async function removeCore(j:RemovalJournalV1,c:RemovalContext,observe:(j:RemovalJournalV1)=>void):Promise<RemovalJournalV1>{
 // Existing durable detached/deleting journal, generation exclusive AND writer
 // retained through the native syscall and receipt even when abort/stale arrives.
 await coherent(j,c);check(c,j.target);if(j.state==='detached'){j=await transition(j,'deleting',c);observe(j);}await coherent(j,c);check(c,j.target);
 if(j.target.backend==='idb'){
 const expected=await coherent(j,c);
 const next=await transaction([...removalStores,'chunks'],'readwrite',c,async tx=>{check(c,j.target);const s=await scanRemovalSnapshot(tx,()=>check(c,j.target));snapshotCAS(s,j,true,expected.canonical);const state=await checkRemovalChunks(tx,j.target,()=>check(c,j.target),true);check(c,j.target);if(state==='present')for(let i=0;i<j.target.chunks;i++){check(c,j.target);tx.objectStore('chunks').delete([j.target.storageKey,i]);}
 const next={...j,state:'removed' as const,revision:j.revision+1};putJournal(tx,next);return next;});return next;
 }
 const present=await physical(j,c);await coherent(j,c);check(c,j.target);
 if(present==='present'){const dir=await directory(c,j.target);await coherent(j,c);check(c,j.target);try{await dir.removeEntry(j.target.storageKey);}catch(e){if(nativeDOMName(e)!=='NotFoundError')throw e;}check(c,j.target);}
 await coherent(j,c);if(await physical(j,c)!=='absent')corrupt();await coherent(j,c);check(c,j.target);return transition(j,'removed',c);
}
function attemptOutcome(d:PlanData,j:RemovalJournalV1|null,e:unknown,primary:FailureV1):RemovalOutcome {
 const preparation=j?'recorded' as const:!d.preparedDispatched?'not-dispatched' as const:e&&typeof e==='object'&&confirmedAborts.has(e)?'aborted' as const:'uncertain' as const;
 return {...outcome(j,primary),tracking:d.tracking,preparation,recoveryRequired:j?outcome(j).recoveryRequired:preparation==='uncertain'};
}
export function releaseCopyRemovalPlan(plan:RemovalPlan):void {const d=plans.get(plan);if(!d||d.settlement)return;d.used=true;plans.delete(plan);if(activePlan===plan)activePlan=null;}
export async function confirmCopyRemoval(plan:RemovalPlan,value:RemovalConsent,c:RemovalContext):Promise<RemovalOutcome>{
 const d=plans.get(plan),consent=copyRemovalConsent(value);if(!d||d.used||d.context!==c||!consent||consent.planRevision!==d.planRevision){const started=d?.preparedDispatched===true;return {...outcome(null,makeFailure('validate','internal','input-invalid','none')),tracking:d?.tracking??null,preparation:started?'uncertain':'not-dispatched',recoveryRequired:started};}
 d.used=true;const abort=()=>d.controller.abort();c.signal.addEventListener('abort',abort,{once:true});if(c.signal.aborted)abort();const owned:RemovalContext={signal:d.controller.signal,current:()=>c.current(),runtimeProtectionCurrent:a=>c.runtimeProtectionCurrent(a)};
 d.settlement=(async()=>{let j:RemovalJournalV1|null=null;try{
 check(owned,d.target);await verifyPublished(d.target,owned);
 return await fenced({operationId:d.tracking.operationId,target:d.target},async()=>{try{check(owned,d.target);j=await prepare(d,consent,owned);check(owned,d.target);j=await detach(j,owned);check(owned,d.target);j=await remove(j,owned,now=>{j=now;});return outcome(j);}
 catch(e){const primary=fromKnownError(e,{phase:'commit',backend:d.target.backend});const secondary:RemovalOutcome['secondary'][number][]=[];
 if(j?.state==='prepared'){try{check(owned,d.target,true);j=await transition(j,'not-committed',owned,true);}catch(cleanup){secondary.push({phase:'reconcile',failure:fromKnownError(cleanup,{phase:'reconcile',backend:'idb'})});}}
 return {...attemptOutcome(d,j,e,primary),secondary};}},true);
 }catch(e){return attemptOutcome(d,j,e,fromKnownError(e,{phase:'verify',backend:d.target.backend}));}
 finally{c.signal.removeEventListener('abort',abort);if(activePlan===plan)activePlan=null;}
 })();const result=await d.settlement;if((result.state==='removed'||result.state==='not-committed')&&result.preparation==='recorded'&&result.journalRevision!==null){settledOutcomes.set(result,{context:c,target:d.target,tracking:d.tracking,state:result.state,revision:result.journalRevision});if(d.strict)strictOutcomeResults.add(result);}return result;
}
/** Cancels only this private attempt and awaits native settlement. Caller keeps
 * the reservation occupied until this promise resolves. Never republish. */
export async function cancelCopyRemoval(plan:RemovalPlan):Promise<RemovalOutcome>{
 const d=plans.get(plan);if(!d)return outcome(null,makeFailure('validate','internal','input-invalid','none'));d.controller.abort();if(d.settlement)return d.settlement;releaseCopyRemovalPlan(plan);return {...outcome(null,makeFailure('validate','cancelled','cancelled','none')),tracking:d.tracking,recoveryRequired:false,preparation:'not-dispatched'};
}
async function readPrefix(c:RemovalReadContext){const s=await transaction(['settings'],'readonly',c,tx=>scanRemovalPrefix(tx,()=>checkRead(c)));checkRead(c);return validateRemovalPrefix(s);}
async function getJournal(tracking:RemovalTracking,c:RemovalReadContext){const r=copyRemovalTracking(tracking);if(!r)corrupt();const p=await readPrefix(c);if(p.incarnation!==r.incarnation)changed();const j=p.journals.find(j=>j.operationId===r.operationId);if(!j)changed();return {j};}
/** Acknowledge only the fresh, private result of a strict collection operation. */
export async function acknowledgeUnreferencedCopyRemoval(result:RemovalOutcome,c:RemovalContext):Promise<boolean>{
 if(!strictOutcomeResults.has(result))return false;return acknowledgeCopyRemoval(result,c);
}
/** Prune only a privately branded, fresh terminal result in its original live
 * reservation. Never accepts a deserialized receipt or an uncertain attempt. */
export async function acknowledgeCopyRemoval(result:RemovalOutcome,c:RemovalContext):Promise<boolean>{
 const d=settledOutcomes.get(result);if(!d||d.context!==c||result.recoveryRequired)return false;settledOutcomes.delete(result);strictOutcomeResults.delete(result);
 try{return await fenced({operationId:d.tracking.operationId,target:d.target},async()=>{
  check(c,d.target);const {j}=await getJournal(d.tracking,c);if(j.state!==d.state||j.revision!==d.revision||!sameSourceAsset(j.target,d.target))changed();
  if(j.state==='removed'&&await physical(j,c)!=='absent')changed();
  return transaction(['settings'],'readwrite',c,async tx=>{check(c,d.target);const snapshot=await scanRemovalPrefix(tx,()=>check(c,d.target)),p=validateRemovalPrefix(snapshot);const now=p.journals.find(x=>x.operationId===d.tracking.operationId);if(p.incarnation!==d.tracking.incarnation||!now||describeRemovalData(now)!==describeRemovalData(j))changed();const marker=snapshot.prefix.find(e=>e.key===markerKey(j.target));if(j.state==='removed'){const expected={version:1,incarnation:j.incarnation,operationId:j.operationId,revision:j.revision};if(!marker||describeRemovalData(marker.value)!==describeRemovalData(expected))changed();}else if(marker)changed();check(c,d.target);tx.objectStore('settings').delete(journalKey(j.operationId));if(j.state==='removed')tx.objectStore('settings').delete(markerKey(j.target));return true;});
 });}catch{return false;}
}
/** Trusted root-only target discovery for a recorded operation, no writes. */
export async function readCopyRemovalTarget(tracking:RemovalTracking,c:RemovalReadContext):Promise<Readonly<LocalAsset>|null>{try{return Object.freeze({...((await getJournal(tracking,c)).j.target)});}catch{return null;}}
export async function readPendingCopyRemovals(c:RemovalReadContext):Promise<readonly RemovalTracking[]>{const p=await readPrefix(c);return p.journals.filter(j=>!['removed','not-committed'].includes(j.state)).map(j=>Object.freeze({incarnation:j.incarnation,operationId:j.operationId}));}
async function verifyDetached(j:RemovalJournalV1,c:RemovalContext):Promise<void>{
 // The only current=false reader is a journal-authorized UNPUBLISHED generation.
 // Published assets always use bound current-manifest worker verification above.
 await coherent(j,c);const reader=await openAssetReader(j.target,false);try{await coherent(j,c);const r=await reader.verifyDetailed(true,{check:()=>check(c,j.target)});check(c,j.target);if(r.state!=='valid')throw AppFailure.create(r.failure);await coherent(j,c);}finally{reader.release();}
}
/** Explicit inspection may settle an EXISTING receipt under fences. It never
 * initializes a namespace, deletes bytes, republishes, or invokes continuation. */
export async function inspectCopyRemoval(tracking:RemovalTracking,c:RemovalContext):Promise<RemovalInspection>{
 let j:RemovalJournalV1|null=null;
 try{j=(await getJournal(tracking,c)).j;check(c,j.target);const initial=j;
 return await fenced(j,async()=>{j=(await getJournal(tracking,c)).j;if(describeRemovalData(initial)!==describeRemovalData(j))changed();check(c,j.target);
 if(j.state==='prepared'){await coherent(j,c);j=await transition(j,'not-committed',c);return {outcome:outcome(j),continuation:null,planRevision:null,summary:j.summary};}
 if(j.state==='not-committed'||j.state==='removed'){
 // Terminal receipts certify THIS operation, not an immutable future library.
 // Never demand its historical global CAS to acknowledge a completed receipt.
 // Identity+journal+marker were validated under the same operation/gen/writer
 // fences; only observe the exact old generation, without any mutation.
 let result:RemovalOutcome;
 if(j.state==='removed'){
 let presence:RemovalOutcome['physical']='unknown',observationFailure:FailureV1|null=null;try{presence=await physical(j,c);}catch(e){observationFailure=fromKnownError(e,{phase:'reconcile',backend:j.target.backend});}check(c,j.target);const reread=(await getJournal(tracking,c)).j;check(c,j.target);if(describeRemovalData(reread)!==describeRemovalData(j))changed();result=presence==='present'?{...outcome(j,makeFailure('reconcile','integrity','local-corrupt',j.target.backend),'present','unknown'),recoveryRequired:true}:outcome(j,observationFailure,presence);
 }else{const now=await transaction(['assets'],'readonly',c,tx=>request(tx.objectStore('assets').get(j!.target.id)));check(c,j.target);const a=copySourceAsset(now);result=outcome(j,null,'unknown',a&&sameSourceAsset(a,j.target)?'linked':'unknown');}
 return {outcome:result,continuation:null,planRevision:null,summary:j.summary};
 }
 await coherent(j,c);const presence=await physical(j,c);await coherent(j,c);if(presence==='absent'){j=await transition(j,'removed',c);return {outcome:outcome(j),continuation:null,planRevision:null,summary:j.summary};}
 // Shared verification must run outside exclusive generation fence; mint below
 // only after another fenced CAS recheck. Return internal sentinel here.
 return {outcome:outcome(j,null,'present'),continuation:null,planRevision:j.revision+1,summary:j.summary};
 }).then(async result=>{
 if(!j||!['detached','deleting'].includes(j.state)||result.outcome.physical!=='present')return result;
 const captured=j;await verifyDetached(captured,c);return fenced(captured,async()=>{await coherent(captured,c);check(c,captured.target);const token=Object.freeze({}) as RemovalContinuation;const revision=captured.revision+1;continuations.set(token,{journal:captured,context:c,planRevision:revision,used:false});return {...result,continuation:token,planRevision:revision};});
 });
 }catch(e){return {outcome:{...outcome(j,fromKnownError(e,{phase:'reconcile',backend:j?.target.backend??'idb'}),'unknown','unknown'),state:'unknown',recoveryRequired:true},continuation:null,planRevision:null,summary:null};}
}
export async function continueCopyRemoval(token:RemovalContinuation,value:RemovalConsent,c:RemovalContext):Promise<RemovalOutcome>{
 const d=continuations.get(token),consent=copyRemovalConsent(value);if(!d||d.used||d.context!==c||!consent||consent.planRevision!==d.planRevision)return outcome(d?.journal??null,makeFailure('validate','internal','input-invalid','none'));d.used=true;let j=d.journal;
 try{await verifyDetached(j,c);return await fenced(j,async()=>{const expected=await coherent(j,c);check(c,j.target);
 // Store NEW explicit declaration with CAS before authorizing this deletion.
 j=await transaction(removalStores,'readwrite',c,async tx=>{const s=await scanRemovalSnapshot(tx,()=>check(c,j.target));snapshotCAS(s,j,true,expected.canonical);check(c,j.target);const next={...j,revision:j.revision+1,planRevision:consent.planRevision,consent};putJournal(tx,next);return next;});j=await remove(j,c,now=>{j=now;});return outcome(j);});
 }catch(e){return outcome(j,fromKnownError(e,{phase:'cleanup',backend:j.target.backend}));}
}
