import {admittedTransaction,openDatabase,openExistingDatabase,closeDatabase,request,readRecord} from '../storage/database';
import {transactionDone} from '../storage/transaction-done';
import {WRITER_LOCK} from '../storage/asset-reader';
import {validImportOperation,type ImportOperation} from '../storage/import-operations';
import type {Track,Playlist} from '../library/library';
import {copyLibraryMembership,libraryMembershipKey,makeLibraryMembership} from '../library/library-membership';
import {copyLocalAlbumMetadata} from '../library/album-metadata';
import {validateAccountLibrary,emptyLibrary,mergeAccountLibraries,libraryUuid,type AccountLibraryDocument} from './library-document.mjs';
export const ACTIVE_LIBRARY_ACCOUNT='pulso-account-library-active';
const LEGACY_OWNER='pulso-account-library-legacy-owner';
const baseKey=(id:string)=>['account-library-base',1,id];
const check=(current:()=>boolean)=>{if(!current())throw Error('account-changed');};
export async function activeLibraryAccount():Promise<string|undefined>{const value=await readRecord<unknown>('settings',ACTIVE_LIBRARY_ACCOUNT);return libraryUuid(value)?value:undefined;}
async function write<T>(current:()=>boolean,fn:(tx:IDBTransaction)=>Promise<T>,create=false):Promise<T>{
 check(current);return navigator.locks.request(WRITER_LOCK,async()=>{check(current);const db=await (create?openDatabase():openExistingDatabase());let tx:IDBTransaction|undefined;let done:Promise<void>|undefined;
  try{tx=admittedTransaction(db,['settings','tracks','playlists','jobs'],'readwrite');done=transactionDone(tx);try{const value=await fn(tx);check(current);await done;return value;}catch(e){try{tx.abort();}catch{/* committed winner */}await done.catch(()=>{});throw e;}}finally{closeDatabase(db);}
 });
}
/** A legacy browser is assigned once. Later accounts cannot upload its records. */
export async function prepareAccountLibrary(accountId:string,current:()=>boolean):Promise<void>{
 if(!libraryUuid(accountId))throw Error('account');
 await write(current,async tx=>{const settings=tx.objectStore('settings');let legacy=await request<string|undefined>(settings.get(LEGACY_OWNER));
  if(legacy===undefined){legacy=accountId;settings.put(accountId,LEGACY_OWNER);}if(!libraryUuid(legacy))throw Error('owner');
  const tracks=await request<Track[]>(tx.objectStore('tracks').getAll()),lists=await request<Playlist[]>(tx.objectStore('playlists').getAll());check(current);
  for(const t of tracks)if(t.accountId===undefined)tx.objectStore('tracks').put({...t,accountId:legacy},t.id);
  for(const p of lists)if(p.accountId===undefined)tx.objectStore('playlists').put({...p,accountId:legacy},p.id);
  const jobs=await request<ImportOperation[]>(tx.objectStore('jobs').getAll());check(current);
  for(const job of jobs)if(validImportOperation(job,job.operationId)&&job.accountId===undefined)tx.objectStore('jobs').put({...job,accountId:legacy,...(job.track?{track:{...job.track,accountId:legacy}}:{}),...(job.result?{result:{...job.result,track:{...job.result.track,accountId:legacy}}}:{})},job.operationId);
  settings.put(accountId,ACTIVE_LIBRARY_ACCOUNT);
 },true);
}
async function snapshot(tx:IDBTransaction,accountId:string):Promise<AccountLibraryDocument>{
 const [tracks,playlists]=await Promise.all([request<Track[]>(tx.objectStore('tracks').getAll()),request<Playlist[]>(tx.objectStore('playlists').getAll())]);
 const lists=playlists.filter(p=>p.accountId===accountId),referenced=new Set(lists.flatMap(p=>p.entries.map(e=>e.trackId)));
 const owned=tracks.filter(t=>t.accountId===accountId),rows=await Promise.all(owned.map(async t=>{
  const value=await request(tx.objectStore('settings').get(libraryMembershipKey(t.id))),member=value===undefined?true:copyLibraryMembership(value,t.id)?.added;if(member===undefined)throw Error('membership');
  return {t,member};
 }));
 return validateAccountLibrary({version:1,tracks:rows.filter(({t,member})=>member||t.favorite||referenced.has(t.id)).map(({t,member})=>({id:t.id,title:t.title,artist:t.artist,album:t.album,duration:t.duration,favorite:t.favorite,inLibrary:member,createdAt:t.createdAt,localAlbum:t.localAlbum?copyLocalAlbumMetadata(t.localAlbum):null,catalog:t.catalogChoice??null})),playlists:lists.map(p=>({id:p.id,name:p.name,entries:p.entries}))});
}
export async function readAccountLibrary(accountId:string,current:()=>boolean):Promise<{document:AccountLibraryDocument;base:AccountLibraryDocument}>{
 check(current);const db=await openExistingDatabase();try{const tx=admittedTransaction(db,['tracks','playlists','settings']),done=transactionDone(tx);
  const [document,raw]=await Promise.all([snapshot(tx,accountId),request(tx.objectStore('settings').get(baseKey(accountId)))]);await done;check(current);return {document,base:raw===undefined?emptyLibrary():validateAccountLibrary(raw)};
 }finally{closeDatabase(db);}
}
/** Never changes assets/chunks/leases/queue or claims that a cloud row is downloaded.
 * Merge edits committed during the HTTP request before updating the checkpoint. */
export async function applyAccountLibrary(accountId:string,sent:AccountLibraryDocument,cloud:AccountLibraryDocument,current:()=>boolean):Promise<void>{
 cloud=validateAccountLibrary(cloud);
 await write(current,async tx=>{
  const active=await request(tx.objectStore('settings').get(ACTIVE_LIBRARY_ACCOUNT));if(active!==accountId)throw Error('account-changed');
  const latest=await snapshot(tx,accountId),merged=mergeAccountLibraries(sent,latest,cloud);
  const rows=await request<Track[]>(tx.objectStore('tracks').getAll()),lists=await request<Playlist[]>(tx.objectStore('playlists').getAll()),trackById=new Map(rows.map(t=>[t.id,t])),listById=new Map(lists.map(p=>[p.id,p]));
  const ids=new Set(merged.tracks.map(t=>t.id)),listIds=new Set(merged.playlists.map(p=>p.id));
  for(const dto of merged.tracks){const old=trackById.get(dto.id);if(old&&old.accountId!==accountId)throw Error('identity-collision');
   const next:Track={...(old??{assetId:null,revision:0,manualOverrides:{}}),id:dto.id,accountId,title:dto.title,artist:dto.artist,album:dto.album,duration:dto.duration,favorite:dto.favorite,createdAt:dto.createdAt,revision:(old?.revision??0)+1,manualOverrides:old?.manualOverrides??{},...(dto.localAlbum?{localAlbum:dto.localAlbum}:{})};
   next.manualOverrides={...next.manualOverrides};for(const field of ['title','artist','album'] as const)if(Object.hasOwn(next.manualOverrides,field)){if(field==='title')next.manualOverrides.title=dto.title;else next.manualOverrides[field]=dto[field];}
   if(!dto.localAlbum)delete next.localAlbum;if(dto.catalog)next.catalogChoice=dto.catalog;else delete next.catalogChoice;
   // Avoid revision churn when only synchronizing an unchanged document.
   if(!old||JSON.stringify({...next,revision:old.revision})!==JSON.stringify(old))tx.objectStore('tracks').put(next,next.id);
   const key=libraryMembershipKey(dto.id),membership=await request(tx.objectStore('settings').get(key));if(membership===undefined&&dto.inLibrary===false||membership!==undefined&&copyLibraryMembership(membership,dto.id)?.added!==dto.inLibrary)tx.objectStore('settings').put(makeLibraryMembership(dto.id,dto.inLibrary),key);
  }
  // Removing account organization never physically deletes music. Demote the
  // local record to listening cache; ordinary cache cleanup decides eligibility.
  for(const old of rows)if(old.accountId===accountId&&!ids.has(old.id)){if(old.favorite)tx.objectStore('tracks').put({...old,favorite:false,revision:old.revision+1},old.id);tx.objectStore('settings').put(makeLibraryMembership(old.id,false),libraryMembershipKey(old.id));}
  for(const p of merged.playlists){const old=listById.get(p.id);if(old&&old.accountId!==accountId)throw Error('identity-collision');if(!old||old.name!==p.name||JSON.stringify(old.entries)!==JSON.stringify(p.entries))tx.objectStore('playlists').put({...p,accountId,revision:(old?.revision??0)+1},p.id);}
  for(const old of lists)if(old.accountId===accountId&&!listIds.has(old.id))tx.objectStore('playlists').delete(old.id);
  tx.objectStore('settings').put(cloud,baseKey(accountId));
 });
}
/** The user requested this exact restored row. Parsed tags/duration have already
 * passed import validation. Reuse those bytes without a second physical copy. */
export async function attachRestoredAccountTrack(accountId:string,restoredId:string,downloadedId:string,current:()=>boolean):Promise<string>{
 if(restoredId===downloadedId)return downloadedId;
 return write(current,async tx=>{const store=tx.objectStore('tracks');const [restored,downloaded]=await Promise.all([request<Track|undefined>(store.get(restoredId)),request<Track|undefined>(store.get(downloadedId))]);
  if(!restored||restored.accountId!==accountId||restored.assetId!==null||!downloaded?.assetId||downloaded.accountId!==accountId) return downloadedId;
  store.put({...restored,assetId:downloaded.assetId,audioFingerprint:downloaded.audioFingerprint,revision:restored.revision+1},restoredId);
  const lists=await request<Playlist[]>(tx.objectStore('playlists').getAll());const member=await request(tx.objectStore('settings').get(libraryMembershipKey(downloadedId)));
  if(!downloaded.favorite&&copyLibraryMembership(member,downloadedId)?.added===false&&!lists.some(p=>p.entries.some(e=>e.trackId===downloadedId))){store.delete(downloadedId);tx.objectStore('settings').delete(libraryMembershipKey(downloadedId));}
  return restoredId;
 });
}
