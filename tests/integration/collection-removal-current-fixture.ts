import {registerDatabaseRealmHost} from '../../src/storage/database-realms';
import {openDatabase,closeDatabase,readRecord,request,admittedTransaction} from '../../src/storage/database';
import {transactionDone} from '../../src/storage/transaction-done';
import {importFileDetailed} from '../../src/imports/import-file';
import {createPlaylist,changePlaylist,editTrack,type Track,type LocalAsset} from '../../src/library/library';
import {readSongCopyStatus} from '../../src/library/song-copy-status';
import {readSongAlias,type SongChoice} from '../../src/library/selected-song';
import {Activity} from '../../src/playback/ownership';
import {createCollectionRemovalController} from '../../src/ui/collection-removal-state';
registerDatabaseRealmHost({capture:(_kind,current)=>current()?{current,onLifecycle:()=>{},end:()=>{}}:null});
const live=()=>true;
function wav(salt:number){const b=new Uint8Array(160044),v=new DataView(b.buffer);const text=(s:string,p:number)=>[...s].forEach((c,i)=>b[p+i]=c.charCodeAt(0));text('RIFF',0);v.setUint32(4,b.length-8,true);text('WAVEfmt ',8);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text('data',36);v.setUint32(40,b.length-44,true);b[100]=salt;return b;}
type Fixture={scenario:string;list:string;other:string|null;rows:{track:string;asset:LocalAsset;choice:SongChoice}[]};
Object.assign(window,{
 async setupCurrentCollection(scenario:string,backend:'idb'|'opfs'){
  const db=await openDatabase();closeDatabase(db);const list=await createPlaylist('Lista propia'),other=scenario==='playlists'?await createPlaylist('Otra lista'):null;const rows:Fixture['rows']=[];
  for(let i=0;i<2;i++){
   const title=i===0?'Compartida propia':'Exclusiva propia';
   const added=scenario==='album-first'||scenario==='playlist-first'&&i===0;
   const result=await importFileDetailed(new File([wav(i+1)],title+'.wav',{type:'audio/wav'}),new AbortController().signal,()=>{},{backend,...(added?{}:{libraryMode:'cache' as const})});
   if(result.kind!=='confirmed')throw Error('fixture import '+JSON.stringify(result));
   const t=result.result.track;await editTrack(t.id,t.revision,{album:'Álbum propio',artist:'Artista propio'});
   if(i===0||scenario!=='album-first')await changePlaylist(list.id,i===0?1:2,{type:'add',trackId:t.id});
   if(i===0&&other)await changePlaylist(other.id,1,{type:'add',trackId:t.id});
   const asset=await readRecord<LocalAsset>('assets',t.assetId!);if(!asset)throw Error('asset');
   rows.push({track:t.id,asset,choice:{id:`lrclib:${i+1}`,source:'lrclib',title,artist:'Artista propio',album:'Álbum propio',duration:10}});
  }
  const fixture:Fixture={scenario,list:list.id,other:other?.id??null,rows};sessionStorage.setItem('current-collection-fixture',JSON.stringify(fixture));return fixture;
 },
 async inspectCurrentCollection(fixture:Fixture){
  const db=await openDatabase();const tx=admittedTransaction(db,['playlists','jobs','chunks'],'readonly'),done=transactionDone(tx);
  const [lists,jobs,chunks]=await Promise.all(['playlists','jobs','chunks'].map(n=>request(tx.objectStore(n).getAll())));await done;closeDatabase(db);
  const rows=[];
  for(const row of fixture.rows){
   const track=await readRecord<Track>('tracks',row.track),asset=await readRecord<LocalAsset>('assets',row.asset.id);
   let physical=false,sha256:string|null=null;
   if(row.asset.backend==='opfs'){try{const d=await(await navigator.storage.getDirectory()).getDirectoryHandle('pulso-assets-v1');const f=await(await d.getFileHandle(row.asset.storageKey)).getFile();physical=true;sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await f.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');}catch(e){if(!(e instanceof DOMException)||e.name!=='NotFoundError')throw e;}}
   else {const db=await openDatabase(),tx=admittedTransaction(db,'chunks','readonly'),done=transactionDone(tx);const chunks=await request<Uint8Array[]>(tx.objectStore('chunks').getAll(IDBKeyRange.bound([row.asset.storageKey,0],[row.asset.storageKey,Number.MAX_SAFE_INTEGER])));await done;closeDatabase(db);physical=chunks.length>0;if(physical){const bytes=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}}
   rows.push({track:track?.id,linked:track?.assetId===row.asset.id,asset:!!asset,physical,sha256,status:await readSongCopyStatus(row.choice,live),reuseTrack:await readSongAlias(row.choice,live)});
  }
  return {rows,playlists:lists.length,jobs:jobs.length,chunks:chunks.length};
 },
 async checkBlockedCollectionAdmission(){
  const activity=new Activity();activity.open();const operation=activity.begin()!;let gates=0,reads=0;const controller=createCollectionRemovalController({activity,canStart:()=>activity.idle,captureRaw:()=>{reads++;return live;},gate:()=>{gates++;},reserve:()=>{throw Error('must not reserve');},refresh:async()=>{},adopt:()=>{},checkpoint:()=>{},changed:()=>{}});
  const started=controller.start({kind:'playlist',id:crypto.randomUUID(),revision:1},'Bloqueada propia'),view=controller.getView(),closed=controller.callbacks(view).close();await controller.dispose();const active=activity.count;operation.end();return {started,visible:view.visible,state:view.state,message:view.message,closed,gates,reads,active};
 }
});
