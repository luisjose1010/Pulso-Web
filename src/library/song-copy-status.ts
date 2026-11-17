import {AUDIO_FILE_MAX_BYTES} from '../storage/audio-limits';
import {readSongAlias,songChoiceKey,type SongChoice} from './selected-song';
import {readLibraryTrackIds} from './library-membership';
import {expectedAudioTagMismatch} from '../imports/expected-audio-metadata';
import {recordingTitlesEquivalent} from './recording-title';
import {musicIdentityText} from '../telegram/bot-search-protocol';
import {isUuid} from '../telegram/sources-protocol';
import {validAudioFingerprint,verifiedAssetDetailed,type Track} from './library';
import {admittedTransaction,closeDatabase,openExistingDatabase,readRecord,request} from '../storage/database';
import {transactionDone} from '../storage/transaction-done';

export interface SongCopyStatus {state:'available'|'missing'|'unknown';trackId:string|null;inLibrary:boolean|null}
export interface SongCopyInspection {
 current():boolean;
 /** Read-only, no playback intent, import, membership write or Telegram request. */
 inspect(choice:SongChoice,signal:AbortSignal):Promise<SongCopyStatus>;
}
const unknown=():SongCopyStatus=>({state:'unknown',trackId:null,inLibrary:null});
const live=(current:()=>boolean)=>{try{return current()===true;}catch{return false;}};
/** Metadata compatibility only. Keep detached tracks so membership is not lost
 * from the view after removing audio. Ambiguous recordings are never selected. */
export function compatibleSongMetadata(track:Track,choice:SongChoice):boolean {
 const artist=choice.artist;
 return !!artist&&choice.duration!==null&&!!track&&isUuid(track.id)&&typeof track.title==='string'&&typeof track.artist==='string'&&!!track.artist.trim()&&validAudioFingerprint(track.audioFingerprint)&&
  typeof track.duration==='number'&&Number.isFinite(track.duration)&&track.duration>0&&Math.abs(track.duration-choice.duration)<=5&&
  recordingTitlesEquivalent(track.title,choice.title,{actualAlbum:track.album,expectedAlbum:choice.album,actualDurationSeconds:track.duration,expectedDurationSeconds:choice.duration})&&!expectedAudioTagMismatch({title:track.title,artist:track.artist,album:track.album??undefined},{title:choice.title,artist,...(musicIdentityText(track.title)!==musicIdentityText(choice.title)&&choice.album&&choice.duration!==null?{recordingTitle:track.title,album:choice.album,durationSeconds:choice.duration}:{})},track.duration);
}
async function knownTrack(choice:SongChoice,current:()=>boolean):Promise<string|null>{
 // A direct catalogue binding can identify its exact fingerprint. Otherwise
 // inspect the full compatible set, including detached tracks, before choosing.
 const exact=await readSongAlias(choice,current,false);if(!live(current))throw Error('cancelled');if(exact)return exact;
 const db=await openExistingDatabase();
 try{
  if(!live(current))throw Error('cancelled');
  const tx=admittedTransaction(db,'tracks','readonly'),done=transactionDone(tx);
  const rows=await request<Track[]>(tx.objectStore('tracks').getAll(undefined,2001));await done;
  if(!live(current)||rows.length>2000)throw Error('unavailable');
  const matches=rows.filter(t=>compatibleSongMetadata(t,choice));
  if(matches.length>1)throw Error('ambiguous');return matches[0]?.id??null;
 }finally{closeDatabase(db);}
}
/** Caller holds its own Activity until this promise really settles, including
 * file verification. A view abort revokes publication, never invents IO settlement. */
export async function readSongCopyStatus(choice:SongChoice,current:()=>boolean):Promise<SongCopyStatus>{
 try{
  if(!songChoiceKey(choice)||!live(current))return unknown();
  const id=await knownTrack(choice,current);if(!live(current))return unknown();
  if(!id)return {state:'missing',trackId:null,inLibrary:false};
  const track=await readRecord<Track>('tracks',id);if(!live(current)||!track||track.id!==id)return unknown();
  const members=await readLibraryTrackIds([id],current);if(!live(current))return unknown();
  const inLibrary=members.has(id);
  if(track.assetId===null)return {state:'missing',trackId:id,inLibrary};
  // Verification has the same small-file bound as the remote acquisition lane.
  if(!validAudioFingerprint(track.audioFingerprint)||track.audioFingerprint.bytes>AUDIO_FILE_MAX_BYTES)return {state:'unknown',trackId:id,inLibrary};
  const checked=await verifiedAssetDetailed(track.assetId,true);if(!live(current))return unknown();
  const after=await readRecord<Track>('tracks',id);if(!live(current)||!after||after.revision!==track.revision||after.assetId!==track.assetId)return unknown();
  const freshMembers=await readLibraryTrackIds([id],current);if(!live(current))return unknown();
  const member=freshMembers.has(id);
  if(checked.state==='missing')return {state:'missing',trackId:id,inLibrary:member};
  if(checked.state!=='valid'||checked.asset.sha256!==track.audioFingerprint.sha256||checked.asset.bytes!==track.audioFingerprint.bytes)return {state:'unknown',trackId:id,inLibrary:member};
  return {state:'available',trackId:id,inLibrary:member};
 }catch{return unknown();}
}
