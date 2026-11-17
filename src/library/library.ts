import type {LocalAlbumMetadataV1} from './album-metadata';
import {activeLibraryAccount} from '../accounts/library-local';
import {admittedTransaction,closeDatabase,assertDatabaseUse} from '../storage/database';
import {openAssetReader,verificationFailure,WRITER_LOCK} from '../storage/asset-reader';
import {fromKnownError,makeFailure,type FailureV1} from '../errors/app-failure';
import {committed, openDatabase, readRecord, request} from '../storage/database';
export interface AudioFingerprint {algorithm:'sha256';sha256:string;bytes:number}
export interface OrganizationRef {libraryId:string;id:string}
export type LinkedTrack=Track & {assetId:string};
export function validAudioFingerprint(value:unknown):value is AudioFingerprint {
 if(!value||typeof value!=='object')return false;const f=value as AudioFingerprint;
 return f.algorithm==='sha256'&&typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256)&&Number.isSafeInteger(f.bytes)&&f.bytes>=1&&f.bytes<=100*1024*1024;
}
export interface Track {catalogChoice?:import('./selected-song').SongChoice;accountId?:string;localAlbum?:LocalAlbumMetadataV1;id:string;assetId:string|null;audioFingerprint?:AudioFingerprint|null;organizationRef?:OrganizationRef;title:string;artist:string|null;album:string|null;duration:number;favorite:boolean;revision:number;createdAt:string;manualOverrides:Partial<{title:string;artist:string|null;album:string|null}>}
export interface Playlist {accountId?:string;organizationRef?:OrganizationRef;id:string;name:string;entries:{id:string;trackId:string}[];revision:number}
interface AssetFields {id:string;namespace:'local';storageKey:string;bytes:number;sha256:string;mime:string;chunks:number;state:'complete';revision:number;chunkSize:number;retention:'kept'}
export type LocalAsset=AssetFields & ({backend:'idb'}|{backend:'opfs'});
export function validAsset(a: unknown): a is LocalAsset {
 if(!a||typeof a!=='object')return false;const m=a as LocalAsset;
 return /^[a-f0-9-]{36}$/.test(m.id)&&m.namespace==='local'&&m.state==='complete'&&(m.backend==='idb'||m.backend==='opfs')&&m.retention==='kept'&&
 /^[a-f0-9-]{36}$/.test(m.storageKey)&&/^[a-f0-9]{64}$/.test(m.sha256)&&['audio/mpeg','audio/mp4','audio/wav'].includes(m.mime)&&
 Number.isSafeInteger(m.bytes)&&m.bytes>0&&m.bytes<=100*1024*1024&&m.chunkSize===65536&&m.chunks===Math.ceil(m.bytes/m.chunkSize)&&Number.isSafeInteger(m.revision)&&m.revision>0;
}
export async function all<T>(store:string):Promise<T[]> { const db=await openDatabase();try{const tx=admittedTransaction(db,store);const done=committed(tx);const records=await request<T[]>(tx.objectStore(store).getAll());await done;assertDatabaseUse('read');return records;}finally{closeDatabase(db);} }
export async function editTrack(id:string, revision:number, patch:Partial<Pick<Track,'title'|'artist'|'album'|'favorite'>>,current:()=>boolean=()=>true) {
 if(!current())throw new Error('La operación ya no está vigente.');
 return navigator.locks.request(WRITER_LOCK,async()=>{
 if(!current())throw new Error('La operación ya no está vigente.');
 const db=await openDatabase();try{
 const tx=admittedTransaction(db,'tracks','readwrite');const done=committed(tx);const store=tx.objectStore('tracks');const track=await request<Track|undefined>(store.get(id));
 if(!current()||!track||track.revision!==revision){tx.abort();await done;return;}
 const title=patch.title?.trim();if(patch.title!==undefined&&(!title||title.length>300)){tx.abort();await done;return;}
 const next={...track,...patch,title:title??track.title,revision:revision+1,manualOverrides:{...track.manualOverrides,...('title'in patch?{title}:{}),...('artist'in patch?{artist:patch.artist}:{}),...('album'in patch?{album:patch.album}:{})}};
 store.put(next,id);await done;
 }finally{closeDatabase(db);}
 });
}
export async function createPlaylist(name:string,current:()=>boolean=()=>true):Promise<Playlist> {
 if(!current())throw new Error('La operación ya no está vigente.');
 name=name.trim();if(!name||name.length>100)throw new Error('Escribe un nombre de 1 a 100 caracteres.');
 const accountId=await activeLibraryAccount();if(!current())throw new Error('La operación ya no está vigente.');
 const playlist:Playlist={id:crypto.randomUUID(),name,entries:[],revision:1,...(accountId?{accountId}:{})};
 return navigator.locks.request(WRITER_LOCK,async()=>{if(!current())throw new Error('La operación ya no está vigente.');const db=await openDatabase();try{if(!current())throw new Error('La operación ya no está vigente.');const tx=admittedTransaction(db,'playlists','readwrite');const done=committed(tx);tx.objectStore('playlists').add(playlist,playlist.id);await done;return playlist;}finally{closeDatabase(db);}});
}
export async function changePlaylist(id:string, revision:number, action:{type:'rename';name:string}|{type:'add';trackId:string}|{type:'remove';entryId:string}|{type:'move';entryId:string;delta:-1|1}|{type:'delete'},current:()=>boolean=()=>true) {
 if(!current())throw new Error('La operación ya no está vigente.');
 return navigator.locks.request(WRITER_LOCK,async()=>{
 if(!current())throw new Error('La operación ya no está vigente.');
 const db=await openDatabase();try{
 const tx=admittedTransaction(db,['playlists','tracks'],'readwrite');const done=committed(tx);const store=tx.objectStore('playlists');const list=await request<Playlist|undefined>(store.get(id));
 if(!current()){tx.abort();await done;throw new Error('La operación ya no está vigente.');}
 if(!list||list.revision!==revision){tx.abort();await done;return;}
 if(action.type==='delete')store.delete(id);
 else{
 if(action.type==='rename'){const name=action.name.trim();if(!name||name.length>100){tx.abort();await done;return;}list.name=name;}
 if(action.type==='add'){
 const track=await request<Track|undefined>(tx.objectStore('tracks').get(action.trackId));if(!current()||!track){tx.abort();await done;return;}
 if(!list.entries.some(e=>e.trackId===action.trackId))list.entries.push({id:crypto.randomUUID(),trackId:action.trackId});
 }
 if(action.type==='remove')list.entries=list.entries.filter(e=>e.id!==action.entryId);
 if(action.type==='move'){const i=list.entries.findIndex(e=>e.id===action.entryId);const j=i+action.delta;if(i>=0&&j>=0&&j<list.entries.length)[list.entries[i],list.entries[j]]=[list.entries[j],list.entries[i]];}
 list.revision++;store.put(list,id);
 }
 await done;
 }finally{closeDatabase(db);}
 });
}
export type VerifiedAssetResult={state:'valid';asset:LocalAsset;failure:null}|{state:'missing'|'corrupt'|'unknown';asset:null;failure:FailureV1};
// Validate a data-only snapshot: neither validation nor backend selection may run
// accessors/coercion supplied by an invalid manifest.
function manifestAsset(value:unknown):LocalAsset|null {
 if(!value||typeof value!=='object')return null;
 const copy:Record<string,string|number>={};
 try{
  for(const key of ['id','namespace','storageKey','bytes','sha256','mime','chunks','state','revision','chunkSize','retention','backend']){
   const field=Object.getOwnPropertyDescriptor(value,key);
   if(!field||!Object.hasOwn(field,'value')||!['string','number'].includes(typeof field.value))return null;
   copy[key]=field.value;
  }
  return validAsset(copy)?copy:null;
 }catch{return null;}
}
export async function verifiedAssetDetailed(id:string,integrity=false):Promise<VerifiedAssetResult> {
 let record:unknown;
 try{record=await readRecord<unknown>('assets',id);}
 catch(error){return {state:'unknown',asset:null,failure:fromKnownError(error,{phase:'read',backend:'idb'})};}
 if(record===undefined)return {state:'missing',asset:null,failure:makeFailure('read','integrity','asset-missing','idb')};
 const asset=manifestAsset(record);
 if(!asset||asset.id!==id)return {state:'corrupt',asset:null,failure:makeFailure('read','integrity','local-corrupt','idb')};
 try{
  const reader=await openAssetReader(asset);
  try{
   assertDatabaseUse('read');const result=await reader.verifyDetailed(integrity);assertDatabaseUse('read');
   return result.state==='valid'?{state:'valid',asset,failure:null}:{...result,asset:null};
  }finally{reader.release();}
 }catch(error){
  const result=verificationFailure(error,asset.backend);
  // verificationFailure always emits a failure for a caught error.
  return result.state==='valid'?{state:'unknown',asset:null,failure:makeFailure('verify','internal','unknown',asset.backend)}:{...result,asset:null};
 }
}
export async function verifiedAsset(id:string,integrity=false):Promise<LocalAsset|null> {
 const result=await verifiedAssetDetailed(id,integrity);return result.state==='valid'?result.asset:null;
}
