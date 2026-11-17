/** TESTONLY pre-MAIN importer entry. Native IDB/OPFS, actual import algorithm.
 * Runs in its own realm before MAIN: no product guards or capabilities replaced. */
import {importFileDetailed} from '../../../src/imports/import-file';
import {editTrack,createPlaylist,changePlaylist} from '../../../src/library/library';
import {rememberSongAlias} from '../../../src/library/selected-song';
import {libraryMembershipKey,makeLibraryMembership} from '../../../src/library/library-membership';
import {readRecord} from '../../../src/storage/database';
import type {Track} from '../../../src/library/library';
export async function seed(){
 const tracks=[];
 for(const [i,name] of ['tone.wav','tone.mp3'].entries()){
  const bytes=await(await fetch('/__musicflow/'+name)).arrayBuffer();
  const r=await importFileDetailed(new File([bytes],name,{type:i?'audio/mpeg':'audio/wav'}),new AbortController().signal,()=>{},{backend:i?'opfs':'idb'});
  if(r.kind!=='confirmed')throw Error('MUSIC_FLOW importer not confirmed '+JSON.stringify(r.outcome));
  await editTrack(r.result.track.id,r.result.track.revision,{title:i?'MUSIC_FLOW Alternate':'MUSIC_FLOW Song (Live version)',artist:'MUSIC_FLOW Artist',album:i?null:'MUSIC_FLOW Album'});
  tracks.push(r.result.track.id);
 }
 let p=await createPlaylist('MUSIC_FLOW own audio');for(const id of tracks){await changePlaylist(p.id,p.revision,{type:'add',trackId:id});p={...p,revision:p.revision+1};}
 return {tracks,entry:'actual importFileDetailed IDB+OPFS, then metadata API; no device picker'};
}
export async function seedAmbiguous(){
 const ids:string[]=[];
 for(const [i,name] of ['tone.wav','tone.mp3'].entries()){
  const bytes=await(await fetch('/__musicflow/'+name)).arrayBuffer();
  const r=await importFileDetailed(new File([bytes],name,{type:i?'audio/mpeg':'audio/wav'}),new AbortController().signal,()=>{},{backend:i?'opfs':'idb'});
  if(r.kind!=='confirmed')throw Error('ambiguous seed import failed');
  ids.push(r.result.track.id);
  await editTrack(r.result.track.id,r.result.track.revision,{title:'MUSIC_FLOW Song (Live version)',artist:'MUSIC_FLOW Artist',album:'MUSIC_FLOW Album'});
 }
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open('pulso-web-local-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('tracks','readwrite'),store=tx.objectStore('tracks'),get=store.get(ids[1]);get.onsuccess=()=>{const row=get.result;store.put({...row,assetId:null,revision:row.revision+1},ids[1]);};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{db.close();}
 return ids;
}
export async function seedExactAlias(){
 const ids=await seedAmbiguous();const track=await readRecord<Track>('tracks',ids[0]);if(!track?.audioFingerprint)throw Error('missing seeded fingerprint');
 await rememberSongAlias({id:'itunes:42:1:1:81',source:'itunes',title:'MUSIC_FLOW Song (Live version)',artist:'MUSIC_FLOW Artist',album:'MUSIC_FLOW Album',duration:45},ids[0],track.audioFingerprint.sha256,track.audioFingerprint.bytes,()=>true);
}
export async function seedSingleExactAlias(){
 const bytes=await(await fetch('/__musicflow/tone.wav')).arrayBuffer();
 const r=await importFileDetailed(new File([bytes],'tone.wav',{type:'audio/wav'}),new AbortController().signal,()=>{},{backend:'idb'});
 if(r.kind!=='confirmed')throw Error('single exact-alias import failed');
 await editTrack(r.result.track.id,r.result.track.revision,{title:'MUSIC_FLOW Song (Live version)',artist:'MUSIC_FLOW Artist',album:'MUSIC_FLOW Album'});
 const track=await readRecord<Track>('tracks',r.result.track.id);if(!track?.audioFingerprint)throw Error('single alias fingerprint missing');
 await rememberSongAlias({id:'itunes:42:1:1:81',source:'itunes',title:'MUSIC_FLOW Song (Live version)',artist:'MUSIC_FLOW Artist',album:'MUSIC_FLOW Album',duration:45},track.id,track.audioFingerprint.sha256,track.audioFingerprint.bytes,()=>true);
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open('pulso-web-local-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put(makeLibraryMembership(track.id,false),libraryMembershipKey(track.id));tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{db.close();}
 return [track.id];
}
export async function seedTwoTrackAliasPlaylist(){
 const seeded=await seed();const track=await readRecord<Track>('tracks',seeded.tracks[0]);
 if(!track?.audioFingerprint||!seeded.tracks[1])throw Error('two-track playlist fixture incomplete');
 await rememberSongAlias({id:'itunes:42:1:1:81',source:'itunes',title:'MUSIC_FLOW Song (Live version)',artist:'MUSIC_FLOW Artist',album:'MUSIC_FLOW Album',duration:45},track.id,track.audioFingerprint.sha256,track.audioFingerprint.bytes,()=>true);
 return seeded;
}
export async function seedAliasWithOtherValidAsset(){
 const seeded=await seed();const first=await readRecord<Track>('tracks',seeded.tracks[0]);
 const bytes=await(await fetch('/__musicflow/second.mp3')).arrayBuffer();
 const imported=await importFileDetailed(new File([bytes],'second.mp3',{type:'audio/mpeg'}),new AbortController().signal,()=>{},{backend:'idb'});
 if(imported.kind!=='confirmed')throw Error('second valid asset fixture import failed');
 const second=await readRecord<Track>('tracks',imported.result.track.id);
 if(!first?.audioFingerprint||!second?.assetId||first.assetId===second.assetId)throw Error('expected two distinct valid assets');
 await rememberSongAlias({id:'itunes:42:1:1:81',source:'itunes',title:'MUSIC_FLOW Song (Live version)',artist:'MUSIC_FLOW Artist',album:'MUSIC_FLOW Album',duration:45},first.id,first.audioFingerprint.sha256,first.audioFingerprint.bytes,()=>true);
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open('pulso-web-local-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('tracks','readwrite'),store=tx.objectStore('tracks'),get=store.get(first.id);get.onsuccess=()=>{const row=get.result;store.put({...row,assetId:second.assetId,revision:row.revision+1},first.id);};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{db.close();}
 return [...seeded.tracks,second.id];
}
export async function seedCorruptManifest(){
 const seeded=await seed();const track=await readRecord<Track>('tracks',seeded.tracks[0]);if(!track?.assetId)throw Error('missing asset');
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open('pulso-web-local-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('assets','readwrite'),store=tx.objectStore('assets'),get=store.get(track.assetId!);get.onsuccess=()=>{store.put({...get.result,sha256:'0'.repeat(64)},track.assetId!);};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export async function seedPhysicalPurge(){
 const seeded=await seed();const track=await readRecord<Track>('tracks',seeded.tracks[0]);if(!track?.assetId)throw Error('missing asset');
 const asset=await readRecord<{storageKey:string;backend:string}>('assets',track.assetId);if(!asset||asset.backend!=='idb')throw Error('expected native IDB asset');
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open('pulso-web-local-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('chunks','readwrite');tx.objectStore('chunks').delete(IDBKeyRange.bound([asset.storageKey,0],[asset.storageKey,Number.MAX_SAFE_INTEGER]));tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
