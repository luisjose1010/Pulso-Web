import {copyAccountCatalog} from '../accounts/library-document.mjs';
import {fail} from '../errors/app-failure';
import {request} from '../storage/database';
import {validImportOperation,terminal} from '../storage/import-operations';
import {closedObject,copySourceAsset,sameSourceAsset,dataObject} from '../playback/local-source-protocol';
import {normalizeSnapshot} from '../playback/queue-restore';
import {copyLocalAlbumMetadata} from './album-metadata';
import {validAudioFingerprint,type Track,type LocalAsset} from './library';
import {REMOVAL_LIMITS as L,REMOVAL_PREFIX,removalUUID as uuid,positive,copyRemovalJournal,markerKey,type RemovalJournalV1,type RemovalSummary} from './local-copy-removal-contract';
export const removalStores=['assets','tracks','playlists','jobs','settings'];
export const identityKey=REMOVAL_PREFIX+'identity';
export function corrupt():never {return fail('validate','integrity','relations-invalid','idb');}
export function changed():never {return fail('validate','integrity','asset-changed','idb');}
function limit():never {return fail('validate','internal','limit-exceeded','idb');}
/** Conservative retained descriptor budget. Reject native clone exotics, cycles,
 * sparse arrays, accessors and nonfinite values; never stringify before charging.
 * One native IDB clone can transiently exceed this budget: no heap guarantee. */
export function describeRemovalData(value:unknown,budget:{left:number}={left:L.metadataBytes},depth=0,seen=new Set<object>()):string {
 const charge=(n:number)=>{budget.left-=n;if(budget.left<0)limit();};charge(32);
 if(value===null)return 'null';
 if(value===undefined)return 'undefined';
 if(typeof value==='boolean')return value?'true':'false';
 if(typeof value==='string'){charge(value.length*2);return JSON.stringify(value);}
 if(typeof value==='number'&&Number.isFinite(value))return Object.is(value,-0)?'-0':String(value);
 if(!value||typeof value!=='object'||depth>24||seen.has(value))corrupt();
 if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))corrupt();
 seen.add(value);charge(64);const parts:string[]=[];let count=0;
 if(Array.isArray(value)){charge(value.length*8);if(value.length>20000)limit();for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!('value'in d))corrupt();parts.push(describeRemovalData(d.value,budget,depth+1,seen));}if(Reflect.ownKeys(value).length!==value.length+1)corrupt();}
 else{for(const key in value){if(!Object.hasOwn(value,key))continue;charge(key.length*2+32);if(++count>20000)limit();const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value'in d))corrupt();parts.push(JSON.stringify(key)+':'+describeRemovalData(d.value,budget,depth+1,seen));}if(Reflect.ownKeys(value).length!==count)corrupt();parts.sort();}
 seen.delete(value);return (Array.isArray(value)?'[':'{')+parts.join(',')+(Array.isArray(value)?']':'}');
}
export interface RemovalEntry {key:IDBValidKey;value:unknown;descriptor:string}
export interface RemovalSnapshot {entries:Record<string,RemovalEntry[]>;canonical:string;prefix:RemovalEntry[]}
function relevantSetting(key:IDBValidKey){return key==='library-playback'||Array.isArray(key)&&key[0]==='asset-ownership';}
export async function scanRemovalSnapshot(tx:IDBTransaction,check:()=>void):Promise<RemovalSnapshot> {
 const entries:Record<string,RemovalEntry[]>={};const prefix:RemovalEntry[]=[];const budget:{left:number}={left:L.metadataBytes};let lists=0,prefixBytes=0;
 await Promise.all(removalStores.map(name=>new Promise<void>((resolve,reject)=>{
 const rows:RemovalEntry[]=[];entries[name]=rows;let count=0;const req=tx.objectStore(name).openCursor();
 req.onerror=()=>reject(req.error);req.onsuccess=()=>{try{check();const c=req.result;if(!c){resolve();return;}
 const max=name==='assets'?L.assets:name==='tracks'?L.tracks:name==='jobs'?L.jobs:20000;if(++count>max)limit();
 const isPrefix=name==='settings'&&typeof c.key==='string'&&c.key.startsWith(REMOVAL_PREFIX);
 if(name!=='settings'||isPrefix||relevantSetting(c.key)){
 const before=budget.left;const descriptor=describeRemovalData([c.key,c.value],budget);const e={key:c.key,value:c.value,descriptor};
 if(isPrefix){prefix.push(e);prefixBytes+=before-budget.left;if(prefixBytes>L.prefixBytes)limit();}else rows.push(e);
 if(name==='playlists'){const m=dataObject(c.value);if(!m||!Array.isArray(m.entries))corrupt();lists+=m.entries.length;if(lists>L.playlistEntries)limit();}
 }c.continue();
 }catch(e){reject(e);try{tx.abort();}catch{/* terminal */}}};
 })));
 check();return {entries,prefix,canonical:removalStores.map(n=>n+':'+entries[n].map(e=>e.descriptor).join('|')).join('\n')};
}
export function validateTrack(value:unknown,key:IDBValidKey):Track {
 const m=dataObject(value);if(!m)corrupt();
 const required=['id','assetId','title','artist','album','duration','favorite','revision','createdAt','manualOverrides'];
 if(required.some(k=>!Object.hasOwn(m,k))||Object.keys(m).some(k=>!required.includes(k)&&!['audioFingerprint','organizationRef','localAlbum','accountId','catalogChoice'].includes(k)))corrupt();
 const t=m as unknown as Track;if(t.accountId!==undefined&&!uuid(t.accountId))corrupt();if(t.catalogChoice!==undefined){try{if(!copyAccountCatalog(t.catalogChoice))corrupt();}catch{corrupt();}}
 if(!uuid(t.id)||t.id!==key||!(t.assetId===null||uuid(t.assetId))||!positive(t.revision)||t.revision>=Number.MAX_SAFE_INTEGER||typeof t.title!=='string'||!t.title.trim()||t.title.length>300||[t.artist,t.album].some(v=>v!==null&&(typeof v!=='string'||v.length>300))||!Number.isFinite(t.duration)||t.duration<=0||typeof t.favorite!=='boolean'||typeof t.createdAt!=='string'||!Number.isFinite(Date.parse(t.createdAt)))corrupt();
 const overrides=dataObject(t.manualOverrides);if(!overrides||Object.entries(overrides).some(([k,v])=>!['title','artist','album'].includes(k)||!(typeof v==='string'&&v.length<=300||k!=='title'&&v===null)))corrupt();
 if(t.audioFingerprint!=null&&(!closedObject(t.audioFingerprint,['algorithm','sha256','bytes'])||!validAudioFingerprint(t.audioFingerprint)))corrupt();
 if(t.organizationRef!==undefined){const r=closedObject(t.organizationRef,['libraryId','id']);if(!r||!uuid(r.id)||!uuid(r.libraryId))corrupt();}
 if(Object.hasOwn(t,'localAlbum')&&!copyLocalAlbumMetadata(t.localAlbum))corrupt();return t;
}
export interface ValidatedRemoval {aliases:Track[];summary:RemovalSummary}
export function validateRemovalSnapshot(s:RemovalSnapshot,a:LocalAsset,detached=false,journal?:RemovalJournalV1):ValidatedRemoval {
 const assets=s.entries.assets.map(e=>{const m=copySourceAsset(e.value);if(!m||m.id!==e.key||!uuid(m.id)||!uuid(m.storageKey))corrupt();return m;});
 const assetIds=new Set(assets.map(m=>m.id));
 const matches=assets.filter(m=>m.backend===a.backend&&m.storageKey===a.storageKey);
 if(detached?matches.length!==0||assets.some(m=>m.id===a.id):matches.length!==1||!sameSourceAsset(matches[0],a))changed();
 const tracks=s.entries.tracks.map(e=>validateTrack(e.value,e.key));const ids=new Set(tracks.map(t=>t.id));
 if(tracks.some(t=>t.assetId!==null&&!assetIds.has(t.assetId)))corrupt();
 const aliases=detached?tracks.filter(t=>journal!.tracks.some(x=>x.id===t.id)):tracks.filter(t=>t.assetId===a.id);
 if(aliases.length<1||aliases.length>L.aliases||detached&&aliases.length!==journal!.tracks.length)corrupt();
 for(const t of aliases){if(t.audioFingerprint!=null&&(t.audioFingerprint.sha256!==a.sha256||t.audioFingerprint.bytes!==a.bytes))corrupt();if(detached&&(!t.audioFingerprint||t.assetId!==null||t.revision!==journal!.tracks.find(x=>x.id===t.id)!.afterRevision))changed();}
 const aliasIds=new Set(aliases.map(t=>t.id));let playlists=0,playlistEntries=0;
 for(const e of s.entries.playlists){const m=dataObject(e.value);if(!m||m.id!==e.key||!uuid(m.id)||!positive(m.revision)||typeof m.name!=='string'||m.name.length<1||m.name.length>100||!Array.isArray(m.entries)||Object.keys(m).some(k=>!['id','name','entries','revision','organizationRef','accountId'].includes(k)))corrupt();
 if(m.accountId!==undefined&&!uuid(m.accountId))corrupt();
 if(m.organizationRef!==undefined){const r=closedObject(m.organizationRef,['id','libraryId']);if(!r||!uuid(r.id)||!uuid(r.libraryId))corrupt();}
 const entryIds=new Set<string>();let count=0;for(const raw of m.entries){const r=closedObject(raw,['id','trackId']);if(!r||!uuid(r.id)||!uuid(r.trackId)||!ids.has(r.trackId)||entryIds.has(r.id))corrupt();entryIds.add(r.id);if(aliasIds.has(r.trackId))count++;}if(count)playlists++;playlistEntries+=count;
 }if(playlistEntries>1000)limit();
 let queueOccurrences=0;
 for(const e of s.entries.settings){
 if(e.key==='library-playback'){const q=normalizeSnapshot(e.value);if(!q||q.warnings.length||describeRemovalData(e.value)!==describeRemovalData(q.snapshot)||q.snapshot.entries.some(x=>!ids.has(x.trackId)))corrupt();if(q.snapshot.entries.some(e=>!uuid(e.id)||!uuid(e.trackId))||q.snapshot.currentEntryId!==null&&!q.snapshot.entries.some(e=>e.id===q.snapshot.currentEntryId))corrupt();queueOccurrences=q.snapshot.entries.filter(x=>aliasIds.has(x.trackId)).length;}
 }
 const proof=s.entries.settings.find(e=>Array.isArray(e.key)&&e.key.length===3&&e.key[0]==='asset-ownership'&&e.key[1]===a.backend&&e.key[2]===a.storageKey);
 const p=closedObject(proof?.value,['operationId','owner','everPublished']);if(!p||!uuid(p.operationId)||!uuid(p.owner)||p.everPublished!==true)corrupt();
 let ownerJob=false;
 for(const e of s.entries.jobs){const fields=dataObject(e.value);if(!fields||Object.keys(fields).some(k=>!['version','operationId','owner','revision','state','backend','storageKey','bytes','expectedBytes','cause','libraryMode','asset','track','expectedAssetRevision','result','accountId'].includes(k))||!validImportOperation(e.value,e.key))corrupt();const j=e.value;if(!terminal(j))corrupt();if(j.backend===a.backend&&j.storageKey===a.storageKey){if(j.operationId!==p.operationId||j.owner!==p.owner||j.state!=='sealed'||!j.asset||!sameSourceAsset(j.asset,a))corrupt();ownerJob=true;}}
 if(!ownerJob)corrupt();
 return {aliases,summary:{bytes:a.bytes,tracks:aliases.length,favorites:aliases.filter(t=>t.favorite).length,playlists,playlistEntries,persistedQueueOccurrences:queueOccurrences}};
}
export interface RemovalPrefix {incarnation:string|null;journals:RemovalJournalV1[]}
/** Startup discovery reads ONLY this module's string prefix. The strict lexical
 * successor of the trailing ':' is ';'; arbitrary Unicode suffixes remain in
 * range. Unrelated stores/settings are never cloned, charged, or plan-gated. */
export async function scanRemovalPrefix(tx:IDBTransaction,check:()=>void):Promise<{prefix:RemovalEntry[]}> {
 const prefix:RemovalEntry[]=[];const budget={left:L.prefixBytes};
 const upper=REMOVAL_PREFIX.slice(0,-1)+';';
 await new Promise<void>((resolve,reject)=>{const req=tx.objectStore('settings').openCursor(IDBKeyRange.bound(REMOVAL_PREFIX,upper,false,true));req.onerror=()=>reject(req.error);req.onsuccess=()=>{try{check();const c=req.result;if(!c){resolve();return;}if(prefix.length>=L.journals*2+1)limit();if(typeof c.key!=='string'||!c.key.startsWith(REMOVAL_PREFIX))corrupt();const descriptor=describeRemovalData([c.key,c.value],budget);prefix.push({key:c.key,value:c.value,descriptor});c.continue();}catch(e){reject(e);try{tx.abort();}catch{/* terminal */}}};});check();return {prefix};
}

export function validateRemovalPrefix(s:Pick<RemovalSnapshot,'prefix'>):RemovalPrefix {
 let incarnation:string|null=null;const journals:RemovalJournalV1[]=[];const markers:RemovalEntry[]=[];
 for(const e of s.prefix){if(e.key===identityKey){const m=closedObject(e.value,['version','incarnation']);if(!m||m.version!==1||!uuid(m.incarnation))corrupt();incarnation=m.incarnation;}
 else if(typeof e.key==='string'&&e.key.startsWith(REMOVAL_PREFIX+'journal:')){const j=copyRemovalJournal(e.value,e.key);if(!j)corrupt();journals.push(j);if(journals.length>L.journals)limit();}
 else if(typeof e.key==='string'&&e.key.startsWith(REMOVAL_PREFIX+'generation:'))markers.push(e);else corrupt();}
 if(!incarnation&&s.prefix.length)corrupt();
 for(const j of journals){if(j.incarnation!==incarnation)corrupt();const m=markers.find(e=>e.key===markerKey(j.target));if(j.state==='not-committed'){if(m&& (m.value as {operationId?:string}).operationId===j.operationId)corrupt();}else{const p=closedObject(m?.value,['version','incarnation','operationId','revision']);if(!p||p.version!==1||p.incarnation!==j.incarnation||p.operationId!==j.operationId||p.revision!==j.revision)corrupt();}}
 for(const e of markers){if(!journals.some(j=>j.state!=='not-committed'&&markerKey(j.target)===e.key))corrupt();}
 return {incarnation,journals};
}
/** Exact [key,index], EOF and payload length, never range-delete. Include malformed
 * keys at the generation prefix (including string/negative/extra index forms). */
export async function checkRemovalChunks(tx:IDBTransaction,a:LocalAsset,check:()=>void,allowAbsent=false):Promise<'present'|'absent'> {
 if(await request(tx.objectStore('chunks').count(a.storageKey)))corrupt();check();let count=0;await new Promise<void>((resolve,reject)=>{const req=tx.objectStore('chunks').openCursor(IDBKeyRange.bound([a.storageKey],[a.storageKey+'\0'],false,true));req.onerror=()=>reject(req.error);req.onsuccess=()=>{try{check();const c=req.result;if(!c){resolve();return;}const k=c.key,v=c.value;if(count>=128||!Array.isArray(k)||k.length!==2||k[0]!==a.storageKey||k[1]!==count||!(v instanceof Uint8Array)||v.byteLength!==Math.min(65536,a.bytes-count*65536))corrupt();count++;c.continue();}catch(e){reject(e);try{tx.abort();}catch{/* terminal */}}};});
 if(count===0&&allowAbsent)return 'absent';if(count!==a.chunks)corrupt();return 'present';
}
export async function readJournalInTransaction(tx:IDBTransaction,operationId:string){return request(tx.objectStore('settings').get(REMOVAL_PREFIX+'journal:'+operationId));}
