import {ACTIVE_LIBRARY_ACCOUNT,activeLibraryAccount} from '../accounts/library-local';
import {libraryMembershipKey,makeLibraryMembership,copyLibraryMembership,type LibraryMembership} from './library-membership';
import {copyLocalAlbumMetadata} from './album-metadata';
import {admittedTransaction,closeDatabase} from '../storage/database';
import {fromKnownError,nativeDOMName} from '../errors/app-failure';
import {mapBackup,type Phase,type Result} from '../diagnostics/contract';
import {featureObservation,notifyFeature,panelFailure,panelSuccess,type FeatureObservationV1,type ObserveFeature} from '../diagnostics/panel-mapping';
import {openDatabase, request} from '../storage/database';
import {transactionDone} from '../storage/transaction-done';
import {WRITER_LOCK} from '../storage/asset-reader';
import {assertImportsResolved} from '../storage/import-operations';
import {validAsset, validAudioFingerprint, type Track, type Playlist} from './library';
import {ORGANIZATION_LIMITS, OrganizationFormatError, parseOrganization, serializeOrganization, validateOrganization,
 type OrganizationExport, type OrganizationRef, type OrganizationTrack, type OrganizationTrackV2, type OrganizationAudio} from './organization-format';

const PREFIX = 'organization-backup:v1:';
const LIBRARY = PREFIX + 'library';
const MAX_PLANS = 8, MAX_RECORDS = 2048, MAX_ASSETS = 10000;
type SnapshotBudget = {left: number; nodes: number};
export type OrganizationChoice = 'keep-local' | 'use-backup';
export type OrganizationBackupErrorCode = 'format'|'version'|'limits'|'relations'|'local-corrupt'|'busy'|'imports-unresolved'|'stale-preview'|'plan-expired'|'invalid-choice'|'fingerprint-conflict'|'export-reused'|'cancelled'|'quota'|'storage'|'uncertain';
export class OrganizationBackupError extends Error {
 constructor(readonly code: OrganizationBackupErrorCode, readonly operationId?: string) {
  super(code === 'local-corrupt' ? 'La organización local está dañada. Repara sus fichas o relaciones antes de continuar.' : `Organización: ${code}`);
  this.name = 'OrganizationBackupError';
 }
}
// Only errors issued by this module carry feature provenance. The public legacy
// constructor intentionally grants no diagnostic authority.
const issued=new WeakMap<object,FeatureObservationV1>();
function ownObservation(error:unknown):FeatureObservationV1|undefined {
 return (typeof error==='object'&&error!==null||typeof error==='function')?issued.get(error as object):undefined;
}
export function organizationErrorObservation(error:unknown):FeatureObservationV1 {
 return ownObservation(error)??featureObservation(panelFailure(fromKnownError(error,{phase:'validate',backend:'unknown'})));
}
function domainError(code:OrganizationBackupErrorCode,operationId?:string,phase:Phase='validate',backend:Result['backend']='none'):OrganizationBackupError {
 const error=new OrganizationBackupError(code,operationId),r=mapBackup(code,phase);
 issued.set(error,featureObservation({...r,backend,transport:'none',outcome:code==='cancelled'?'cancelled':code==='busy'?'blocked':r.outcome}));return error;
}
function observedError(error:unknown,phase:Phase,backend:Result['backend']='idb'):OrganizationBackupError {
 if(ownObservation(error))return error as OrganizationBackupError;
 const f=fromKnownError(error,{phase,backend});
 const wrapped=new OrganizationBackupError(f.code==='quota-exceeded'?'quota':f.code==='imports-unresolved'?'imports-unresolved':'storage');
 issued.set(wrapped,featureObservation(panelFailure(f,'failed',phase)));return wrapped;
}
async function io<T>(phase:Phase,work:()=>Promise<T>|T,backend:Result['backend']='idb'):Promise<T> {
 try{return await work();}catch(error){throw observedError(error,phase,backend);}
}
function transaction(db:IDBDatabase,stores:string|string[],mode:IDBTransactionMode='readonly'):IDBTransaction {
 try{return admittedTransaction(db,stores,mode);}catch(error){throw observedError(error,'open');}
}
function doneTransaction(tx:IDBTransaction):Promise<void> {
 const done=io('commit',()=>transactionDone(tx));void done.catch(()=>{});return done;
}
// This call site owns the pure parser/validator. No foreign thrown value is
// classified by instanceof or by its public code/name/cause properties.
function formatCall<T>(work:()=>T,local=false):T {
 try{return work();}catch(error){
  if(ownObservation(error))throw error;
  if(!error||typeof error!=='object'||Object.getPrototypeOf(error)!==OrganizationFormatError.prototype)throw error;
  const d=typeof error==='object'&&error!==null?Object.getOwnPropertyDescriptor(error,'code'):undefined;
  const code=d&&'value'in d?d.value:undefined;
  if(code==='format'||code==='version'||code==='limits'||code==='relations'){
   const path=Object.getOwnPropertyDescriptor(error,'path');
   const phase=local||code!=='format'||path&&'value'in path&&path.value!=='$'?'validate':'parse';
   throw domainError(local?(code==='limits'?'limits':'local-corrupt'):code,undefined,phase,local?'idb':'none');
  }
  throw error;
 }
}
type Attempt={primary?:Readonly<Result>;cleanup?:Readonly<Result>;recovered?:boolean;result?:Readonly<Result>};
export interface OrganizationConflict {
 key: string; entity: 'track'|'playlist'; ref: OrganizationRef; choice: OrganizationChoice;
 localLabel: string; backupLabel: string;
 /** Explicit use-backup removes source data for a v1/null backup. Parent must expose this loss. */
 losesLocalAlbum?: boolean;
}
export interface OrganizationPreview {
 planId: string; exportId: string; operationId: string;
 counts: {tracks: number; playlists: number; favorites: number; entries: number; newTracks: number; newPlaylists: number};
 conflicts: OrganizationConflict[]; warnings: string[]; canApply: boolean;
}
export type OrganizationApplyResult = {state: 'committed'|'already-committed'; operationId: string};
export type OrganizationApplyInspection = {state: 'committed'|'not-committed'|'uncertain'; operationId: string; reason?: 'original-library-unavailable'};
type Row = {key: IDBValidKey; value: unknown};
interface Snapshot {tracks: Row[]; playlists: Row[]; assets: Row[]; own: Row[]; memberships:Row[]}
interface Receipt {version: 1; operationId: string; exportId: string; digest: string}
interface Plan {preview: OrganizationPreview; base: Snapshot; tracks: Track[]; playlists: Playlist[];memberships:LibraryMembership[]; digest: string; libraryId: string}
const plans = new Map<string, Plan>();
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const refKey = (r: OrganizationRef) => `${r.libraryId}/${r.id}`;
function fail(code: OrganizationBackupErrorCode): never {throw domainError(code,undefined,'validate',code==='local-corrupt'?'idb':'none');}
const positive = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0;
const equal = (a: unknown, b: unknown): boolean => {
 if (Object.is(a,b)) return true;
 if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
 if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return false;
 const ak = Object.keys(a), bk = Object.keys(b);
 return ak.length === bk.length && ak.every(k => Object.hasOwn(b,k) && equal((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));
};
// Restrict the complete CAS snapshot, including unknown local fields. Never retain Blob/audio data.
function bounded(value: unknown, budget: SnapshotBudget, depth = 0): void {
 if (--budget.nodes < 0 || depth > 20 || Array.isArray(value) && value.length > ORGANIZATION_LIMITS.entries) fail('local-corrupt');
 if (typeof value === 'string') budget.left -= value.length * 2;
 else if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) budget.left -= 16;
 else if (typeof value === 'object' && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype)) {
  for (const k of Object.keys(value)) {budget.left -= k.length * 2; bounded((value as Record<string,unknown>)[k],budget,depth+1);}
 } else fail('local-corrupt');
 if (budget.left < 0) throw domainError('limits',undefined,'read','idb');
}
function rows(store: IDBObjectStore, max: number, budget: SnapshotBudget, range?: IDBKeyRange): Promise<Row[]> {
 return new Promise((resolve,reject) => {
  const result: Row[] = [], req = store.openCursor(range);
  req.onerror = () => reject(observedError(req.error,'read'));
  req.onsuccess = () => {
   const c = req.result;
   if (!c) {resolve(result); return;}
   if (result.length >= max) {reject(domainError('limits',undefined,'read','idb')); return;}
   try {
    const row = {key:c.primaryKey,value:c.value};
    // Charge BEFORE retaining each row, across all four concurrent cursors.
    bounded(row,budget); result.push(row); c.continue();
   } catch(e) {reject(observedError(e,'read'));}
  };
 });
}
async function snapshot(tx: IDBTransaction): Promise<Snapshot> {
 const budget: SnapshotBudget = {left:24*1024*1024,nodes:500000};
 const [tracks,playlists,assets,own,memberships] = await Promise.all([
  rows(tx.objectStore('tracks'),ORGANIZATION_LIMITS.tracks,budget), rows(tx.objectStore('playlists'),ORGANIZATION_LIMITS.playlists,budget),
  rows(tx.objectStore('assets'),MAX_ASSETS,budget), rows(tx.objectStore('settings'),MAX_RECORDS,budget,IDBKeyRange.bound(PREFIX,PREFIX+'\uffff')),
  rows(tx.objectStore('settings'),ORGANIZATION_LIMITS.tracks,budget,IDBKeyRange.bound(['library-membership',1],['library-membership',2],false,true)),
 ]);
 const accountId=await request(tx.objectStore('settings').get(ACTIVE_LIBRARY_ACCOUNT));
 return {tracks:accountId?tracks.filter(r=>(r.value as Track).accountId===accountId):tracks,playlists:accountId?playlists.filter(r=>(r.value as Playlist).accountId===accountId):playlists,assets,own,memberships};
}
function own(s: Snapshot, key: string): unknown {return s.own.find(r=>r.key===key)?.value;}
function identity(s: Snapshot): string {const id = own(s,LIBRARY); if (!uuid(id)) fail('local-corrupt'); return id;}
function reference(entity: Track|Playlist, libraryId: string): OrganizationRef {
 return entity.organizationRef ?? {libraryId,id:entity.id};
}
function fingerprint(t: Track, assets: Map<unknown,unknown>): OrganizationAudio|null {
 if (t.audioFingerprint !== undefined && t.audioFingerprint !== null && !validAudioFingerprint(t.audioFingerprint)) fail('local-corrupt');
 const asset = t.assetId === null ? undefined : assets.get(t.assetId);
 if (asset !== undefined && (!validAsset(asset) || asset.id !== t.assetId)) fail('local-corrupt');
 const known = validAsset(asset) ? {algorithm:'sha256' as const,sha256:asset.sha256,bytes:asset.bytes} : null;
 if (known && t.audioFingerprint && !equal(known,t.audioFingerprint)) fail('local-corrupt');
 return known ?? t.audioFingerprint ?? null;
}
function membershipMap(s:Snapshot):Map<string,LibraryMembership>{
 const map=new Map<string,LibraryMembership>();for(const row of s.memberships){
  if(!Array.isArray(row.key)||row.key.length!==3||row.key[0]!=='library-membership'||row.key[1]!==1||typeof row.key[2]!=='string')fail('local-corrupt');
  const value=copyLibraryMembership(row.value,row.key[2]);if(!value)fail('local-corrupt');map.set(value.trackId,value);
 }return map;
}
function dto(s: Snapshot, warnings: string[]): OrganizationExport {
 const libraryId = identity(s), assets = new Map(s.assets.map(r=>[r.key,r.value])), memberships=membershipMap(s);
 const version=s.tracks.some(r=>memberships.get(String(r.key))?.added===false)?3:2;
 for (const row of s.own) {
  if (row.key === LIBRARY) continue;
  if (typeof row.key !== 'string') fail('local-corrupt');
  if (row.key.startsWith(PREFIX+'export:')) {
   if (!uuid(row.key.slice((PREFIX+'export:').length)) || typeof row.value !== 'string' || !/^[a-f0-9]{64}$/.test(row.value)) fail('local-corrupt');
  } else if (row.key.startsWith(PREFIX+'receipt:')) {
   const op = row.key.slice((PREFIX+'receipt:').length);
   if (operationLibrary(op)!==libraryId || !validReceipt(row.value,op) || own(s,PREFIX+'export:'+row.value.exportId)!==row.value.digest) fail('local-corrupt');
  } else fail('local-corrupt');
 }
 const localTracks = s.tracks.map(r=> {
  const t = r.value as Track;
  if (!t || !uuid(t.id) || r.key !== t.id || !positive(t.revision) || typeof t.favorite !== 'boolean' ||
      t.assetId !== null && !uuid(t.assetId)) fail('local-corrupt');
  const localAlbum=Object.hasOwn(t,'localAlbum')?copyLocalAlbumMetadata(t.localAlbum):null;
  if(Object.hasOwn(t,'localAlbum')&&!localAlbum)fail('local-corrupt');
  const audio = fingerprint(t,assets);
  if (!audio) warnings.push(`audio-unavailable:${t.id}`);
  return {ref:reference(t,libraryId), title:t.title, artist:t.artist, album:t.album, duration:t.duration,
   createdAt:t.createdAt, manualOverrides:t.manualOverrides, audio,localAlbum,...(version===3?{inLibrary:memberships.get(t.id)?.added!==false}:{})};
 });
 const refs = new Map(s.tracks.map((r,i)=>[r.key,localTracks[i].ref]));
 let entryCount = 0;
 const playlists = s.playlists.map(r=> {
  const p = r.value as Playlist;
  if (!p || !uuid(p.id) || r.key !== p.id || !positive(p.revision) || !Array.isArray(p.entries)) fail('local-corrupt');
  entryCount += p.entries.length; if (entryCount > ORGANIZATION_LIMITS.entries) fail('limits');
  return {ref:reference(p,libraryId),name:p.name,entries:p.entries.map(e=> {
   const track = refs.get(e?.trackId); if (!track) fail('local-corrupt'); return {id:e.id,track};
  })};
 });
 return formatCall(()=>validateOrganization({format:'pulso-web-organization',version,exportId:crypto.randomUUID(),libraryId,
  exportedAt:new Date().toISOString(),tracks:localTracks,favorites:s.tracks.filter(r=>(r.value as Track).favorite).map(r=>refs.get(r.key)),playlists}),true);
}
async function withWriter<T>(fn:()=>Promise<T>): Promise<T> {
 if (!navigator.locks) throw domainError('busy',undefined,'admit');
 return navigator.locks.request(WRITER_LOCK,{ifAvailable:true},lock=> {if (!lock) throw domainError('busy',undefined,'admit'); return fn();});
}
async function ensureIdentity(): Promise<void> {
 await withWriter(async()=> {
  const db = await io('open',()=>openDatabase());
  try {
   const tx = transaction(db,'settings','readwrite'), done = doneTransaction(tx);
   try {
    const id = await io('read',()=>request(tx.objectStore('settings').get(LIBRARY)));
    if (id === undefined) await io('write',()=>{tx.objectStore('settings').add(crypto.randomUUID(),LIBRARY);});
    else if (!uuid(id)) throw domainError('local-corrupt',undefined,'read','idb');
    await done;
   } catch(e) {try {tx.abort();} catch {/* settled */} await done.catch(()=>{}); throw e;}
  } finally {closeDatabase(db);}
 });
}
async function readSnapshot(): Promise<Snapshot> {
 const db = await io('open',()=>openDatabase());
 try {
  const tx = transaction(db,['tracks','playlists','assets','settings']), done = doneTransaction(tx);
  try {const s = await io('read',()=>snapshot(tx)); await done; return s;}
  catch(e) {try {tx.abort();} catch {/* settled */} await done.catch(()=>{}); throw e;}
 } finally {closeDatabase(db);}
}
async function boundary<T>(observe:ObserveFeature|undefined,fn:(attempt:Attempt)=>Promise<T>,success:Phase='commit'):Promise<T> {
 const attempt:Attempt={};
 try {
  const value=await fn(attempt);
  const primary=attempt.result??(attempt.primary?{...attempt.primary,outcome:attempt.recovered?'recovered' as const:attempt.primary.outcome}:panelSuccess(success));
  notifyFeature(observe,featureObservation(primary,attempt.cleanup??null));return value;
 }catch(error){
  const wrapped=observedError(error,'validate','unknown'),observation=organizationErrorObservation(wrapped);
  const final=featureObservation(attempt.primary?{...attempt.primary,outcome:observation.primary.outcome==='uncertain'?'uncertain':attempt.primary.outcome}:observation.primary,attempt.cleanup??observation.cleanup);
  issued.set(wrapped,final);notifyFeature(observe,final);throw wrapped;
 }
}
export function exportOrganization(observe?:ObserveFeature): Promise<Blob> {return boundary(observe,async()=> {
 await ensureIdentity(); const s = await readSnapshot();
 const memberships=membershipMap(s),referenced=new Set(s.playlists.flatMap(r=>(r.value as Playlist).entries.map(e=>e.trackId)));
 const exported={...s,tracks:s.tracks.filter(r=>memberships.get(String(r.key))?.added!==false||referenced.has(String(r.key))||(r.value as Track).favorite)};
 return new Blob([formatCall(()=>serializeOrganization(dto(exported,[])),true)],{type:'application/json;charset=utf-8'});
},'validate');}
function trackContent(t: OrganizationTrack|OrganizationTrackV2, favorite: boolean) {
 return {title:t.title,artist:t.artist,album:t.album,duration:t.duration,createdAt:t.createdAt,manualOverrides:t.manualOverrides,favorite,localAlbum:'localAlbum'in t?t.localAlbum:null};
}
function choose(choices: Readonly<Record<string,OrganizationChoice>>, key: string): OrganizationChoice {
 const c = Object.hasOwn(choices,key) ? choices[key] : 'keep-local';
 if (c !== 'keep-local' && c !== 'use-backup') fail('invalid-choice'); return c;
}
/** Conflict keys are `track:<libraryId>/<id>` or `playlist:<libraryId>/<id>`.
 * Each explicit preview is a new restoration intent. Retries use the SAME planId;
 * a new preview may intentionally restore an older export after subsequent edits.
 */
export function previewOrganization(file: Blob, choices: Readonly<Record<string,OrganizationChoice>> = {}, observe?:ObserveFeature): Promise<OrganizationPreview> {return boundary(observe,async()=> {
 if (!(file instanceof Blob)) fail('format');
 if (file.size > ORGANIZATION_LIMITS.jsonBytes) fail('limits');
 const bytes=await io('read',()=>file.arrayBuffer(),'none');
 let text: string;
 try {text = new TextDecoder('utf-8',{fatal:true}).decode(bytes);} catch {throw domainError('format',undefined,'parse');}
 const backup = formatCall(()=>parseOrganization(text));const accountId=await activeLibraryAccount();
 const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serializeOrganization(backup)))),b=>b.toString(16).padStart(2,'0')).join('');
 await ensureIdentity(); const base = await readSnapshot(), warnings: string[] = [], local = dto(base,warnings), libraryId = identity(base);
 const exportKey = PREFIX+'export:'+backup.exportId, previous = own(base,exportKey);
 if ([...plans.values()].some(p=>p.preview.exportId===backup.exportId && p.digest!==digest)) fail('export-reused');
 if (previous !== undefined && previous !== digest) fail('export-reused');
 const conflicts: OrganizationConflict[] = [], favorites = new Set(backup.favorites.map(refKey)), localFav = new Set(local.favorites.map(refKey));
 const trackByRef = new Map(local.tracks.map((t,i)=>[refKey(t.ref),{dto:t,raw:base.tracks[i].value as Track}]));
 const playlistByRef = new Map(local.playlists.map((p,i)=>[refKey(p.ref),{dto:p,raw:base.playlists[i].value as Playlist}]));
 const tracks = base.tracks.map(r=>r.value as Track), playlists = base.playlists.map(r=>r.value as Playlist);
 const trackIds = new Set(tracks.map(t=>t.id)), playlistIds = new Set(playlists.map(p=>p.id)), remap = new Map<string,string>();
 const memberships=membershipMap(base);
 let blocked = false, newTracks = 0, newPlaylists = 0;
 for (const t of backup.tracks) {
  const rk = refKey(t.ref), found = trackByRef.get(rk), key = 'track:'+rk;
  const favorite = favorites.has(rk), content = trackContent(t,favorite);
  let selected = true;
  if (found) {
   if (found.dto.audio && t.audio && !equal(found.dto.audio,t.audio)) {blocked=true; warnings.push(`fingerprint-conflict:${key}`);}
   if (!equal(trackContent(found.dto,localFav.has(rk)),content)||('inLibrary'in found.dto?found.dto.inLibrary:true)!==('inLibrary'in t?t.inLibrary:true)) {
    const choice = choose(choices,key); conflicts.push({key,entity:'track',ref:t.ref,choice,localLabel:found.dto.title,backupLabel:t.title,...('localAlbum'in found.dto&&found.dto.localAlbum!==null&&content.localAlbum===null?{losesLocalAlbum:true}:{})}); selected=choice==='use-backup';
   } else selected=false;
   remap.set(rk,found.raw.id);
   if(selected)memberships.set(found.raw.id,makeLibraryMembership(found.raw.id,'inLibrary'in t?t.inLibrary===true:true));
   // A portable fingerprint is recovery information, never proof of local bytes.
   // Enrich missing knowledge independently of the metadata conflict decision.
   const recoveredAudio = !found.dto.audio && t.audio;
   if (selected || recoveredAudio) {
   const next:Track = {
    ...found.raw,...(selected ? {...content,localAlbum:content.localAlbum??undefined} : {}),...(recoveredAudio ? {audioFingerprint:recoveredAudio} : {}),revision:found.raw.revision+1,
   };
   if(next.localAlbum===undefined)delete next.localAlbum;
   tracks[tracks.findIndex(x=>x.id===found.raw.id)] = next;
   }
  } else {
   let id = t.ref.id; while (trackIds.has(id)) id=crypto.randomUUID(); trackIds.add(id); remap.set(rk,id);
   if (!t.audio) warnings.push(`audio-unavailable:${id}`);
   const restored:Track={...(accountId?{accountId}:{}),id,assetId:null,audioFingerprint:t.audio,organizationRef:t.ref,...content,localAlbum:content.localAlbum??undefined,revision:1};
   if(restored.localAlbum===undefined)delete restored.localAlbum;
   tracks.push(restored);memberships.set(id,makeLibraryMembership(id,'inLibrary'in t?t.inLibrary===true:true)); newTracks++;
  }
 }
 for (const p of backup.playlists) {
  const rk=refKey(p.ref), found=playlistByRef.get(rk), key='playlist:'+rk;
  const entries=p.entries.map(e=>({id:e.id,trackId:remap.get(refKey(e.track))!}));
  if (found) {
   if (!equal({name:found.dto.name,entries:found.dto.entries},{name:p.name,entries:p.entries})) {
    const choice=choose(choices,key); conflicts.push({key,entity:'playlist',ref:p.ref,choice,localLabel:found.dto.name,backupLabel:p.name});
    if (choice==='use-backup') playlists[playlists.findIndex(x=>x.id===found.raw.id)]={...found.raw,name:p.name,entries,revision:found.raw.revision+1};
   }
  } else {
   let id=p.ref.id; while (playlistIds.has(id)) id=crypto.randomUUID(); playlistIds.add(id);
   playlists.push({...(accountId?{accountId}:{}),id,organizationRef:p.ref,name:p.name,entries,revision:1}); newPlaylists++;
  }
 }
 const conflictKeys = new Set(conflicts.map(c=>c.key));
 if (Object.keys(choices).length > ORGANIZATION_LIMITS.tracks+ORGANIZATION_LIMITS.playlists || Object.keys(choices).some(k=>!conflictKeys.has(k))) fail('invalid-choice');
 // Validate the FULL merged result too; no truncation or dangling kept relationships.
 const membershipRows=[...memberships.values()].map(value=>({key:libraryMembershipKey(value.trackId),value}));
 const merged = dto({...base,memberships:membershipRows,tracks:tracks.map(t=>({key:t.id,value:t})),playlists:playlists.map(p=>({key:p.id,value:p}))},[]);
 if (base.own.length+2 > MAX_RECORDS) fail('limits');
 const preview: OrganizationPreview = {planId:crypto.randomUUID(),exportId:backup.exportId,operationId:`${libraryId}:${crypto.randomUUID()}`,
  counts:{tracks:tracks.length,playlists:playlists.length,favorites:merged.favorites.length,entries:merged.playlists.reduce((n,p)=>n+p.entries.length,0),newTracks,newPlaylists},conflicts,warnings,canApply:!blocked};
 while (plans.size >= MAX_PLANS) plans.delete(plans.keys().next().value!);
 const originalTracks = new Map(base.tracks.map(r=>[r.key,r.value])), originalPlaylists = new Map(base.playlists.map(r=>[r.key,r.value]));
 // Prepare the exact write set outside IDB; apply does only CAS and queued IDB writes.
 plans.set(preview.planId,{preview:structuredClone(preview),base,
  memberships:[...memberships.values()].filter(value=>!equal(base.memberships.find(r=>Array.isArray(r.key)&&r.key[2]===value.trackId)?.value,value)),
  tracks:tracks.filter(t=>!equal(originalTracks.get(t.id),t)),playlists:playlists.filter(p=>!equal(originalPlaylists.get(p.id),p)),digest,libraryId});
 return preview;
},'validate');}
function operationLibrary(operationId: string): string|null {
 if (typeof operationId !== 'string') return null;
 const [lib,id,...rest] = operationId.split(':'); return !rest.length && uuid(lib) && uuid(id) ? lib : null;
}
function validReceipt(value: unknown, operationId: string): value is Receipt {
 const r = value as Receipt;
 return !!r && r.version===1 && r.operationId===operationId && uuid(r.exportId) && typeof r.digest==='string' && /^[a-f0-9]{64}$/.test(r.digest);
}
// Always opens a fresh connection. Absence is proof only in the SAME library incarnation,
// under the writer lock, after a successful readonly commit; a lost/deleted DB is uncertain.
async function inspectUnlocked(operationId: string, expected?: Pick<Receipt,'exportId'|'digest'>, attempt?:Attempt): Promise<OrganizationApplyInspection> {
 const lib=operationLibrary(operationId); if (!lib) {if(attempt)attempt.result=organizationErrorObservation(domainError('uncertain',undefined,'reconcile','idb')).primary;return {state:'uncertain',operationId};}
 try {
  const db=await io('open',()=>openDatabase());
  try {
   const tx=transaction(db,'settings'), done=doneTransaction(tx), store=tx.objectStore('settings');
   const [id,receipt] = await Promise.all([io('read',()=>request(store.get(LIBRARY))),io('read',()=>request(store.get(PREFIX+'receipt:'+operationId)))]);
   const exportDigest = validReceipt(receipt,operationId) ? await io('read',()=>request(store.get(PREFIX+'export:'+receipt.exportId))) : undefined;
   await done;
   if(attempt)attempt.result=organizationErrorObservation(domainError(uuid(id)||id===undefined?'uncertain':'local-corrupt',undefined,'reconcile','idb')).primary;
   if (id!==lib) return {state:'uncertain',operationId,...(id === undefined || uuid(id) ? {reason:'original-library-unavailable' as const} : {})};
   const state=receipt===undefined?'not-committed':validReceipt(receipt,operationId)&&exportDigest===receipt.digest&&(!expected || expected.exportId===receipt.exportId&&expected.digest===receipt.digest)?'committed':'uncertain';
   if(attempt)attempt.result=state==='uncertain'?{...organizationErrorObservation(domainError('local-corrupt',undefined,'reconcile','idb')).primary,outcome:'uncertain'}:panelSuccess('reconcile',state==='committed'?'recovered':'succeeded');
   return {state,operationId};
  } finally {closeDatabase(db);}
 } catch(error) {if(attempt)attempt.result={...organizationErrorObservation(observedError(error,'reconcile')).primary,outcome:'uncertain'};return {state:'uncertain',operationId};}
}
export function inspectOrganizationApply(operationId: string,observe?:ObserveFeature): Promise<OrganizationApplyInspection> {
 return boundary(observe,async attempt=>{
  try{return await withWriter(()=>inspectUnlocked(operationId,undefined,attempt));}
  catch(error){attempt.result={...organizationErrorObservation(observedError(error,'reconcile')).primary,outcome:'uncertain'};return {state:'uncertain',operationId};}
 },'reconcile');
}
/**
 * Explicitly leave tracking of a lost incarnation. This does not resolve the old
 * result or replay its plan. The caller must preserve the unknown operation ID.
 * Recheck under the writer lock; uncertainty in the current incarnation is unsafe.
 */
export function startOrganizationRecovery(operationId: string,observe?:ObserveFeature): Promise<OrganizationApplyInspection> {return boundary(observe,attempt=>withWriter(async()=> {
 const result=await inspectUnlocked(operationId,undefined,attempt);
 if (result.reason!=='original-library-unavailable') {
  if(result.state==='uncertain')attempt.primary=attempt.result;
  throw domainError('uncertain',operationId,'reconcile','idb');
 }
 const db=await io('open',()=>openDatabase());
 try {
  const tx=transaction(db,'settings','readwrite'), done=doneTransaction(tx);
  try {
   const store=tx.objectStore('settings'), id=await io('read',()=>request(store.get(LIBRARY)));
   if (id===operationLibrary(operationId)) throw domainError('uncertain',operationId,'reconcile','idb');
   if (id===undefined) await io('write',()=>{store.add(crypto.randomUUID(),LIBRARY);});
   else if (!uuid(id)) throw domainError('local-corrupt',undefined,'read','idb');
   await done;
  } catch(e) {try {tx.abort();} catch {/* settled */} await done.catch(()=>{}); throw e;}
 } finally {closeDatabase(db);}
 // Old plans can never become a restoration intent for the replacement store.
 for (const [key,plan] of plans) if (plan.libraryId===operationLibrary(operationId)) plans.delete(key);
 return result;
}));}
export function applyOrganization(planId: string, signal?: AbortSignal,observe?:ObserveFeature): Promise<OrganizationApplyResult> {return boundary(observe,async attempt=> {
 const plan=plans.get(planId); if (!plan) fail('plan-expired');
 const operationId=plan.preview.operationId;
 return withWriter(async()=> {
  const inspection:Attempt={};
  const inspected=await inspectUnlocked(operationId,{exportId:plan.preview.exportId,digest:plan.digest},inspection);
  if (inspected.state==='committed') {attempt.result=panelSuccess('reconcile','recovered');return {state:'already-committed',operationId};}
  if (inspected.state==='uncertain') {attempt.primary=inspection.result;throw domainError('uncertain',operationId,'reconcile','idb');}
  if (!plan.preview.canApply) fail('fingerprint-conflict');
  if (signal?.aborted) fail('cancelled');
  await io('read',()=>assertImportsResolved());
  const db=await io('open',()=>openDatabase()); let tx: IDBTransaction|undefined;
  const abort=()=> {try {tx?.abort();} catch(error) {
   // A settled transaction normally rejects abort; other cleanup failures are
   // secondary, never evidence that the organization itself was lost.
   if(nativeDOMName(error)!=='InvalidStateError')attempt.cleanup??=organizationErrorObservation(observedError(error,'cleanup')).primary;
  }};
  try {
   tx=transaction(db,['tracks','playlists','assets','settings'],'readwrite'); const done=doneTransaction(tx);
   signal?.addEventListener('abort',abort,{once:true}); if (signal?.aborted) abort();
   try {
    let current: Snapshot;
    try {current=await io('read',()=>snapshot(tx!));} catch(e) {
     // The preview base was validated. A now oversized/corrupt base is a stale
     // preview too; do not reinterpret or silently repair it during confirmation.
     const code=ownObservation(e)?.primary.code;
     if (code==='backup-limits' || code==='local-corrupt') throw domainError('stale-preview',undefined,'validate','idb');
     throw e;
    }
    if (!equal(current,plan.base)) throw domainError('stale-preview',undefined,'validate','idb');
    if (signal?.aborted) fail('cancelled');
    await io('write',()=>{
    for (const t of plan.tracks) tx!.objectStore('tracks').put(t,t.id);
    for (const p of plan.playlists) tx!.objectStore('playlists').put(p,p.id);
    const store=tx!.objectStore('settings');
    for(const member of plan.memberships)store.put(member,libraryMembershipKey(member.trackId));
    store.put(plan.digest,PREFIX+'export:'+plan.preview.exportId);
    store.add({version:1,operationId,exportId:plan.preview.exportId,digest:plan.digest} satisfies Receipt,PREFIX+'receipt:'+operationId);
    });
    await done;
    return {state:'committed',operationId};
   } catch(e) {
    // Capture BEFORE abort or receipt inspection can replace the first cause.
    const primary=organizationErrorObservation(observedError(e,'write')).primary;
    attempt.primary=primary;
    abort(); await done.catch(()=>{});
    // Even an abort/error acknowledgement can be lost after commit. Reopen first.
    const reconciliation:Attempt={};
    const outcome=await inspectUnlocked(operationId,{exportId:plan.preview.exportId,digest:plan.digest},reconciliation);
    if (outcome.state==='committed') {attempt.recovered=true;return {state:'committed',operationId};}
    if (outcome.state==='uncertain') {attempt.cleanup=reconciliation.result;throw domainError('uncertain',operationId,'reconcile','idb');}
    // A signal never overrides quota, IO or a domain rejection. Only a native
    // abort acknowledgment after requested cancellation proves cancellation here.
    if (signal?.aborted&&primary.code==='transaction-aborted') {attempt.primary={...primary,family:'cancelled',code:'cancelled',outcome:'cancelled'};throw domainError('cancelled');}
    throw e;
   }
  } finally {signal?.removeEventListener('abort',abort); closeDatabase(db);}
 });
});}
