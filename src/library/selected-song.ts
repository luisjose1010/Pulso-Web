import {MB_UUID} from './catalog-id';
import {activeLibraryAccount} from '../accounts/library-local';
import type {PlayerArtworkQuery} from './player-artwork-provider';
import {AUDIO_FILE_MAX_BYTES} from '../storage/audio-limits';
import type {MusicCatalogChoice} from './music-search-catalog';
import type {BotDownloadedAudio} from '../telegram/bot-search-protocol';
import {dataRecord,isUuid} from '../telegram/sources-protocol';
import {admittedTransaction,openExistingDatabase,request,closeDatabase,readRecord} from '../storage/database';
import {transactionDone} from '../storage/transaction-done';
import {validAsset,validAudioFingerprint,type Track,type LocalAsset} from './library';
import {expectedAudioTagMismatch} from '../imports/expected-audio-metadata';
import {recordingTitlesEquivalent} from './recording-title';
import {musicIdentityText} from '../telegram/bot-search-protocol';

export interface SongCopyInspection {current():boolean;inspect(choice:SongChoice,signal:AbortSignal):Promise<{state:'available'|'missing'|'unknown';trackId:string|null;inLibrary:boolean|null}>}
export interface SongManagement {current():boolean;playReady:boolean;add(current?:()=>boolean):Promise<boolean>;addToPlaylist(id:string,current?:()=>boolean):Promise<boolean>;play():Promise<'playing'|'gesture-required'|'failed'>}
export type SongChoice=Pick<MusicCatalogChoice,'id'|'source'|'title'|'displayTitle'|'artist'|'album'|'duration'> & {searchArtist?:string};
export interface SongPlaybackAttempt {
 current():boolean;
 addToLibrary(trackId:string,current:()=>boolean,signal:AbortSignal):Promise<boolean>;
 lookup(choice:SongChoice,signal:AbortSignal):Promise<string|null>;
 save(audio:BotDownloadedAudio,choice:SongChoice,signal:AbortSignal,onProgress:(bytes:number)=>void):Promise<{state:'saved'|'failed'|'uncertain';trackId:string|null}>;
 play(trackId:string,current:()=>boolean,signal:AbortSignal):Promise<'playing'|'gesture-required'|'failed'>;
}
export {musicIdentityText,matchingSongRows} from '../telegram/bot-search-protocol';
export function songChoiceKey(choice:SongChoice):string|null {
 if(choice.source==='local'&&choice.id.startsWith('local:')&&isUuid(choice.id.slice(6)))return choice.id;
 if(!choice.artist||!choice.title||choice.title.length>300||choice.artist.length>300||choice.album&&choice.album.length>300)return null;
 const itunes=choice.source==='itunes'&&/^itunes:(?:[1-9][0-9]*:){3}[1-9][0-9]*$/.test(choice.id)&&choice.id.slice(7).split(':').every(n=>Number.isSafeInteger(Number(n)));
 const mbParts=choice.id.split(':');const musicbrainz=choice.source==='musicbrainz'&&mbParts.length===5&&mbParts[0]==='musicbrainz'&&MB_UUID.test(mbParts[1])&&MB_UUID.test(mbParts[4])&&mbParts.slice(2,4).every(v=>/^[1-9][0-9]{0,2}$/.test(v)&&Number(v)<=200);
 if(!(choice.source==='lrclib'&&/^lrclib:[1-9][0-9]{0,14}$/.test(choice.id)||itunes||musicbrainz)||choice.duration!==null&&(!Number.isFinite(choice.duration)||choice.duration<0||choice.duration>86400))return null;
 // Exact public catalogue id AND version-bearing metadata: never title alone.
 return JSON.stringify([choice.id,choice.title.normalize('NFC'),choice.artist.normalize('NFC'),choice.album?.normalize('NFC')??null,choice.duration]);
}
/** Coalesce only pending cross-catalog selections with the same full credit,
 * version-bearing title and near-identical duration. This is not persistence identity. */
export function samePendingSong(a:SongChoice,b:SongChoice):boolean {
 if(!a.artist||!b.artist||a.duration===null||b.duration===null||!Number.isFinite(a.duration)||!Number.isFinite(b.duration)||a.duration<=0||b.duration<=0||Math.abs(a.duration-b.duration)>5)return false;
 const words=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/u).filter(Boolean).join(' ');
 const title=(value:string)=>words(value.replace(/\s+\((?:visualizer|official video|official audio)\)\s*$/iu,''));
 const edition=(value:string|null)=>{const all=words(value??'').split(' ');return all.filter(x=>['live','studio','acoustic','remix','demo','instrumental','karaoke'].includes(x)).sort().join(' ');};
 // A different collection name alone is not a recording conflict; version
 // qualifiers in the title and complete performer credit remain significant.
 return !!title(a.title)&&title(a.title)===title(b.title)&&words(a.artist)===words(b.artist)&&(!edition(a.album)&&!edition(b.album)||edition(a.album)===edition(b.album));
}
const aliasKey=(key:string)=>['music-catalog-alias',1,key];
interface Alias {version:1;key:string;trackId:string;sha256:string;bytes:number;displayArtist?:string}
function alias(value:unknown,key:string):Alias|null {
 const r=dataRecord(value);if(!r||!['version','key','trackId','sha256','bytes'].every(k=>Object.hasOwn(r,k))||Object.keys(r).some(k=>!['version','key','trackId','sha256','bytes','displayArtist'].includes(k)))return null;
 return r.version===1&&r.key===key&&isUuid(r.trackId)&&typeof r.sha256==='string'&&/^[a-f0-9]{64}$/.test(r.sha256)&&Number.isSafeInteger(r.bytes)&&Number(r.bytes)>0&&Number(r.bytes)<=AUDIO_FILE_MAX_BYTES&&(!Object.hasOwn(r,'displayArtist')||typeof r.displayArtist==='string'&&!!r.displayArtist.trim()&&r.displayArtist.length<=300)?r as unknown as Alias:null;
}
/** Read exact catalogue keys bound to the currently playing fingerprint. This
 * is a bounded, read-only indicator aid; it does not verify or hash audio. */
export async function readSongAliasKeys(track:Track,current:()=>boolean):Promise<ReadonlySet<string>> {
 if(!current()||!validAudioFingerprint(track.audioFingerprint))return new Set();const db=await openExistingDatabase();
 try{if(!current())return new Set();const tx=admittedTransaction(db,['settings'],'readonly'),done=transactionDone(tx),store=tx.objectStore('settings'),range=IDBKeyRange.bound(['music-catalog-alias',1],['music-catalog-alias',1,[]]);
  const [keys,values]=await Promise.all([request<IDBValidKey[]>(store.getAllKeys(range,2001)),request<unknown[]>(store.getAll(range,2001))]);await done;if(!current()||keys.length>2000||keys.length!==values.length)return new Set();const out=new Set<string>();
  for(let i=0;i<keys.length;i++){const k=keys[i];if(!Array.isArray(k)||k.length!==3||typeof k[2]!=='string')continue;const a=alias(values[i],k[2]);if(a&&a.trackId===track.id&&a.sha256===track.audioFingerprint.sha256&&a.bytes===track.audioFingerprint.bytes)out.add(a.key);}return out;
 }finally{closeDatabase(db);}
}
/** Presentation only: accept an unambiguous catalogue artist for these exact bytes. */
export async function readSongDisplayArtist(track:Track,current:()=>boolean):Promise<string|null> {
 if(!current()||!validAudioFingerprint(track.audioFingerprint))return null;
 const db=await openExistingDatabase();
 try{
  if(!current())return null;
  const tx=admittedTransaction(db,['settings'],'readonly'),done=transactionDone(tx),store=tx.objectStore('settings');
  const range=IDBKeyRange.bound(['music-catalog-alias',1],['music-catalog-alias',1,[]]);
  const [keys,values]=await Promise.all([request<IDBValidKey[]>(store.getAllKeys(range,2001)),request<unknown[]>(store.getAll(range,2001))]);await done;
  if(!current()||keys.length>2000||keys.length!==values.length)return null;
  const names=new Set<string>();
  for(let i=0;i<keys.length;i++){
   const k=keys[i];if(!Array.isArray(k)||k.length!==3||typeof k[2]!=='string')continue;
   const a=alias(values[i],k[2]);if(!a||a.trackId!==track.id||a.sha256!==track.audioFingerprint.sha256||a.bytes!==track.audioFingerprint.bytes)continue;
   try{
    const parts:unknown=JSON.parse(a.key);if(!Array.isArray(parts)||parts.length!==5||typeof parts[0]!=='string'||typeof parts[1]!=='string'||typeof parts[2]!=='string'||!(parts[3]===null||typeof parts[3]==='string')||!(parts[4]===null||typeof parts[4]==='number'))continue;
    const source=parts[0].startsWith('lrclib:')?'lrclib':parts[0].startsWith('itunes:')?'itunes':parts[0].startsWith('musicbrainz:')?'musicbrainz':null;if(!source)continue;
    const choice:SongChoice={source,id:parts[0],title:parts[1],artist:parts[2],album:parts[3],duration:parts[4]};
    if(songChoiceKey(choice)!==a.key)continue;
    const name=a.displayArtist??choice.artist;if(name?.trim())names.add(name.trim().normalize('NFC'));
   }catch{/* Invalid metadata cannot supply a display name. */}
  }
  return names.size===1?[...names][0]:null;
 }finally{closeDatabase(db);}
}
/** Catalogue identity is presentation-only, bound to the exact local audio bytes.
 * Manual metadata and ambiguous editions must not be silently overridden. */
export async function readSongArtworkIdentity(track:Track,current:()=>boolean):Promise<PlayerArtworkQuery|null> {
 if(!current()||!validAudioFingerprint(track.audioFingerprint)||Object.keys(track.manualOverrides??{}).length)return null;
 const db=await openExistingDatabase();
 try{
  if(!current())return null;
  const tx=admittedTransaction(db,['settings'],'readonly'),done=transactionDone(tx),store=tx.objectStore('settings');
  const range=IDBKeyRange.bound(['music-catalog-alias',1],['music-catalog-alias',1,[]]);
  const [keys,values]=await Promise.all([request<IDBValidKey[]>(store.getAllKeys(range,2001)),request<unknown[]>(store.getAll(range,2001))]);await done;
  if(!current()||keys.length>2000||keys.length!==values.length)return null;
  const matches=new Map<string,PlayerArtworkQuery>();
  for(let i=0;i<keys.length;i++){
   const key=keys[i];if(!Array.isArray(key)||key.length!==3||typeof key[2]!=='string')continue;
   const a=alias(values[i],key[2]);if(!a||a.trackId!==track.id||a.sha256!==track.audioFingerprint.sha256||a.bytes!==track.audioFingerprint.bytes)continue;
   try{
    const parts:unknown=JSON.parse(a.key);if(!Array.isArray(parts)||parts.length!==5||typeof parts[0]!=='string'||typeof parts[1]!=='string'||typeof parts[2]!=='string'||!(parts[3]===null||typeof parts[3]==='string')||typeof parts[4]!=='number'||!Number.isFinite(parts[4])||parts[4]<=0||Math.abs(parts[4]-track.duration)>5)continue;
    const source=parts[0].startsWith('musicbrainz:')?'musicbrainz':'itunes';
    const choice:SongChoice={source,id:parts[0],title:parts[1],artist:parts[2],album:parts[3],duration:parts[4]};
    if(songChoiceKey(choice)!==a.key)continue;
    const [editionId,,,trackId]=parts[0].slice(7).split(':').map(Number);
    const q:PlayerArtworkQuery={title:choice.title,artist:choice.artist!,album:choice.album,durationSeconds:choice.duration!,...(source==='musicbrainz'?{musicbrainzReleaseId:parts[0].split(':')[1]}:{editionId,trackId})};
    matches.set(JSON.stringify([source,source==='musicbrainz'?q.musicbrainzReleaseId:editionId,trackId,q.title,q.artist,q.album]),q);
   }catch{/* Malformed aliases do not supply catalogue identity. */}
  }
  return matches.size===1?[...matches.values()][0]:null;
 }finally{closeDatabase(db);}
}
export async function readSongAlias(choice:SongChoice,current:()=>boolean,allowCompatible=true):Promise<string|null> {
 const accountId=await activeLibraryAccount();
 const key=songChoiceKey(choice);if(!key||!current())return null;
 if(choice.source==='local'){const t=await readRecord<Track>('tracks',choice.id.slice(6));return current()&&t?.accountId===accountId?t?.id??null:null;}
 const db=await openExistingDatabase();
 try{
  if(!current())throw Error('cancelled');const tx=admittedTransaction(db,['settings','tracks'],'readonly'),done=transactionDone(tx);
  const raw=await request<unknown>(tx.objectStore('settings').get(aliasKey(key)));
  if(raw===undefined){await done;return allowCompatible?await compatibleLocalSong(db,choice,current):null;}const a=alias(raw,key);if(!a){await done;throw Error('Alias musical inválido; revisa el almacenamiento.');}
  const track=await request<Track|undefined>(tx.objectStore('tracks').get(a.trackId));await done;
  if(!current())throw Error('cancelled');
  if(!track||track.accountId!==accountId)return null;
  if(track.id!==a.trackId)throw Error('La identidad de la ficha local ha cambiado.');
  // A detached track retains its fingerprint. Never attach an alias to other bytes.
  if(track.audioFingerprint?.sha256!==a.sha256||track.audioFingerprint?.bytes!==a.bytes)throw Error('La referencia de esta canción ha cambiado.');
  return track.id;
 }finally{closeDatabase(db);}
}
async function compatibleLocalSong(db:IDBDatabase,choice:SongChoice,current:()=>boolean):Promise<string|null> {
 const accountId=await activeLibraryAccount();
 if(!choice.artist||choice.duration===null||!current())return null;
 const tx=admittedTransaction(db,['tracks','assets'],'readonly'),done=transactionDone(tx);
 const rows=await request<Track[]>(tx.objectStore('tracks').getAll(undefined,2001));
 if(rows.length>2000){await done;throw Error('Hay demasiadas fichas para comprobar una copia compatible.');}
 const candidates=rows.filter(t=>t&&t.accountId===accountId&&isUuid(t.id)&&typeof t.title==='string'&&typeof t.artist==='string'&&t.artist.trim()&&typeof t.duration==='number'&&Number.isFinite(t.duration)&&t.duration>0&&Math.abs(t.duration-choice.duration!)<=5&&recordingTitlesEquivalent(t.title,choice.title,{actualAlbum:t.album,expectedAlbum:choice.album,actualDurationSeconds:t.duration,expectedDurationSeconds:choice.duration})&&!expectedAudioTagMismatch({title:t.title,artist:t.artist,album:t.album??undefined},{title:choice.title,artist:choice.artist,...(musicIdentityText(t.title)!==musicIdentityText(choice.title)&&choice.album&&choice.duration!==null?{recordingTitle:t.title,album:choice.album,durationSeconds:choice.duration}:{})},t.duration)&&validAudioFingerprint(t.audioFingerprint));
 // Detached identities still participate in ambiguity. Filtering by physical
 // availability first could silently select another recording with equal tags.
 if(candidates.length>1){await done;throw Error('Hay varias copias locales compatibles. Revisa tu biblioteca antes de continuar.');}
 const candidate=candidates[0];let id:string|null=null;
 if(candidate?.assetId!=null){
  const asset=await request<LocalAsset|undefined>(tx.objectStore('assets').get(candidate.assetId));
  if(asset!==undefined){
   if(!validAsset(asset)||asset.id!==candidate.assetId||asset.sha256!==candidate.audioFingerprint!.sha256||asset.bytes!==candidate.audioFingerprint!.bytes){await done;throw Error('La referencia de esta copia ha cambiado. Revisa Almacenamiento.');}
   id=candidate.id;
  }
 }
 await done;if(!current())throw Error('cancelled');return id;
}
export async function rememberSongAlias(choice:SongChoice,trackId:string,sha256:string,bytes:number,current:()=>boolean):Promise<void> {
 const key=songChoiceKey(choice);if(!key||choice.source==='local')return;
 const db=await openExistingDatabase();let tx:IDBTransaction|undefined;
 try{
  if(!current())throw Error('cancelled');tx=admittedTransaction(db,['settings','tracks','assets'],'readwrite');const done=transactionDone(tx);
  try{
   const track=await request<Track|undefined>(tx.objectStore('tracks').get(trackId));
   const asset=track?.assetId?await request<LocalAsset|undefined>(tx.objectStore('assets').get(track.assetId)):undefined;
   if(!current()||!track||track.id!==trackId||!validAsset(asset)||asset.sha256!==sha256||asset.bytes!==bytes||track.audioFingerprint?.sha256!==sha256)throw Error('conflict');
   const displayArtist=(choice.source==='itunes'||choice.source==='musicbrainz')?choice.searchArtist:choice.source==='lrclib'?choice.artist:undefined;
   const {id,source,title,artist,album,duration,searchArtist}=choice;tx.objectStore('tracks').put({...track,catalogChoice:{id,source,title,artist,album,duration,...(searchArtist?{searchArtist}:{})},revision:track.revision+1},track.id);
   tx.objectStore('settings').put({version:1,key,trackId,sha256,bytes,...(displayArtist?.trim()&&displayArtist.length<=300?{displayArtist:displayArtist.trim()}: {})} satisfies Alias,aliasKey(key));
   if(!current())throw Error('cancelled');await done;
  }catch(error){try{tx.abort();}catch{/* commit winner */}await done.catch(()=>{});throw error;}
 }finally{closeDatabase(db);}
}
