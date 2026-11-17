import {expectedAudioTagMismatch,expectedAudioDurationMismatch,type ExpectedAudioMetadata} from './expected-audio-metadata';
import {activeLibraryAccount} from '../accounts/library-local';
import {extractLocalAlbumMetadata,type Mp4AlbumTag} from './album-metadata';
import {assertDatabaseUse} from '../storage/database';
import {admittedTransaction,closeDatabase} from '../storage/database';
import {AppFailure,atBoundary,fail,fromKnownError,nativeDOMName,issuedFailure} from '../errors/app-failure';
import {Attempt,type ImportAttemptResult,type DetailedImportResult} from './import-outcome';
import {storeEmbeddedLyrics,LyricsError,type LyricsFailure,type EmbeddedLyricsStoreResult} from '../library/lyrics';
import {inspectEmbeddedLyrics,type EmbeddedLyricsFailure} from './lyrics';
import {storeEmbeddedArtwork} from '../library/artwork';
import {AudioMetadataLimitError,ArtworkError,audioMetadataView,MAX_AUDIO_TABLE_ENTRIES,MAX_ID3_BYTES,inspectEmbeddedArtwork,type ArtworkFailure} from './artwork';
import {transactionDone} from '../storage/transaction-done';
import {parseBlob} from 'music-metadata';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {openDatabase,readRecord,request} from '../storage/database';
import {all,validAsset,type LinkedTrack,type LocalAsset} from '../library/library';
import {ASSET_DIRECTORY,openAssetReader,WRITER_LOCK} from '../storage/asset-reader';
import {assertImportsResolved,validImportOperation,deduplicateOperation,cleanupOperation,createOperation,importOperation,publishOperation,updateOperation,type ImportOperation,type ImportResult} from '../storage/import-operations';
export {importOperations,importOperation,recoverImportOperation,importIssues,retainImportIssue} from '../storage/import-operations';
export type ImportLyricsWarning=EmbeddedLyricsFailure|LyricsFailure;
export interface ImportOptions {libraryMode?:'cache';backend?:'idb'|'opfs'|'auto';operationId?:string;expected?:ExpectedAudioMetadata}
const CHUNK=65536;
async function writeDirectory(){return atBoundary('open','opfs',async()=>{assertDatabaseUse('write');const root=await navigator.storage.getDirectory();assertDatabaseUse('write');return root.getDirectoryHandle(ASSET_DIRECTORY,{create:true});});}
/** Owns WRITER_LOCK internally, including recovery gating and final outcome resolution. */
async function importFileCore(file:File,signal:AbortSignal,progress:(bytes:number)=>void=()=>{},options:ImportOptions={},attempt:Attempt):Promise<ImportResult & {artworkWarning?:ArtworkFailure;lyricsWarning?:ImportLyricsWarning;lyricsInspection?:EmbeddedLyricsStoreResult}> {
 if(options.libraryMode!==undefined&&options.libraryMode!=='cache')fail('validate','internal','input-invalid','none');
 const operationId=options.operationId??crypto.randomUUID();
 const {result,inspect}=await navigator.locks.request(WRITER_LOCK,async()=>{
  const prior=options.operationId?await importOperation(options.operationId):undefined;
  return {result:await performImport(file,signal,progress,{...options,operationId},attempt),inspect:!prior};
 });
 if(!inspect||signal.aborted)return result;
 try{assertDatabaseUse('publish');}catch{return result;}
 let outcome:ImportResult & {artworkWarning?:ArtworkFailure;lyricsWarning?:ImportLyricsWarning;lyricsInspection?:EmbeddedLyricsStoreResult}=result;
 // Audio outcome is already confirmed. Optional metadata failures must never enter audio cleanup.
 try{
  assertDatabaseUse('publish');const published=await readRecord<LocalAsset>('assets',result.track.assetId);
  if(!published)throw new ArtworkError('conflict');
  const artwork=await storeEmbeddedArtwork(result.track.id,published.sha256,()=>inspectEmbeddedArtwork(file,published.mime));
  if(artwork.state!=='ready'&&artwork.state!=='absent')outcome={...outcome,artworkWarning:artwork.failureCode};
 }catch(error){outcome={...outcome,artworkWarning:optionalCode(error,ArtworkError,artworkCodes,'storage-failed')};}
 try{
  assertDatabaseUse('publish');const published=await readRecord<LocalAsset>('assets',result.track.assetId);
  // The confirmed attempt owns the digest of this File. Legacy dedup results may
  // legitimately lack a Track fingerprint; do not migrate them or rehash the File.
  const attempt=await importOperation(operationId);
  const current=await readRecord<LinkedTrack>('tracks',result.track.id);
  if(!validAsset(published)||!attempt?.asset||attempt.state!=='sealed'||
   attempt.result?.track.id!==result.track.id||attempt.result.track.revision!==result.track.revision||
   attempt.result.duplicate!==result.duplicate||attempt.asset.id!==published.id||
   attempt.asset.sha256!==published.sha256||attempt.asset.bytes!==published.bytes||attempt.expectedBytes!==file.size||
   published.revision!==(published.storageKey===attempt.storageKey&&published.backend===attempt.backend?attempt.asset.revision:attempt.expectedAssetRevision)||
   current?.id!==result.track.id||current.assetId!==published.id||current.revision!==result.track.revision)throw new LyricsError('conflict');
  const lyrics=await storeEmbeddedLyrics(result.track.id,published.sha256,()=>inspectEmbeddedLyrics(file,published.mime),{trackRevision:current.revision,assetRevision:published.revision});
  outcome={...outcome,lyricsInspection:lyrics};
  if(lyrics.state==='ready'&&lyrics.warnings.length)outcome={...outcome,lyricsWarning:lyrics.warnings[0]};
  else if(lyrics.state!=='ready'&&lyrics.state!=='absent'&&lyrics.state!=='preserved')outcome={...outcome,lyricsWarning:lyrics.failureCode};
 }catch(error){outcome={...outcome,lyricsWarning:optionalCode(error,LyricsError,lyricsCodes,'storage')};}
 return outcome;
}
async function performImport(file:File,signal:AbortSignal,progress:(bytes:number)=>void,options:ImportOptions,attempt:Attempt):Promise<ImportResult & {artworkWarning?:ArtworkFailure}>{
 const accountId=await activeLibraryAccount();checkCancelled(signal);
 if(options.libraryMode!==undefined&&options.libraryMode!=='cache')fail('validate','internal','input-invalid','none');
 const operationId=options.operationId??crypto.randomUUID();
 if(!/^[a-f0-9-]{36}$/.test(operationId))fail('validate','internal','input-invalid','none');
 const prior=await importOperation(operationId);
 if(prior){if((prior.state==='sealed'||prior.state==='discarded')&&prior.result)return prior.result;fail('reconcile','write-uncertain','imports-unresolved','idb');}
 await assertImportsResolved();
 checkCancelled(signal); if(!file.size||file.size>100*1024*1024)fail('validate','internal','limit-exceeded','none');
 const header=new Uint8Array(await atBoundary('read','none',()=>file.slice(0,16).arrayBuffer()));const ascii=(a:number,b:number)=>new TextDecoder().decode(header.slice(a,b));
 const mime=ascii(0,3)==='ID3'||(header[0]===255&&(header[1]&0xe0)===0xe0)?'audio/mpeg':ascii(4,8)==='ftyp'?'audio/mp4':ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE'?'audio/wav':null;
 if(!mime)fail('validate','unsupported-format','format-unsupported','none');
 const parserOptions={skipCovers:true,duration:true,maxMemoryAllocation:MAX_ID3_BYTES,maxMetadataEntries:mime==='audio/mp4'?MAX_AUDIO_TABLE_ENTRIES:128,maxChapterCount:1};
 let metadataWarning:ArtworkFailure|undefined;let retried=false;const albumTags:Mp4AlbumTag[]=[];
 const omitted=(code:ArtworkFailure)=>{metadataWarning=code;};
 const outcome=(result:ImportResult)=>metadataWarning?{...result,artworkWarning:metadataWarning}:result;
 let metadata;try{metadata=await parseBlob(await atBoundary('read','none',()=>metadataView(file,mime,false,omitted,tag=>albumTags.push(tag))),parserOptions);}
 catch(error){
  if(isMetadataLimit(error))fail('parse','internal','limit-exceeded','none');if(issuedFailure(error)||nativeDOMName(error))throw AppFailure.create(fromKnownError(error,{phase:'parse',backend:'none'}));
  // Retry a parser-only view without optional tags, retaining actual audio bytes/offsets.
  // Recalculate duration/codec from the audio, never manufacture either from tags.
  retried=true;
  try{metadata=await parseBlob(await atBoundary('read','none',()=>metadataView(file,mime,true,omitted)),parserOptions);}
  catch(error){if(isMetadataLimit(error))fail('parse','internal','limit-exceeded','none');if(issuedFailure(error)||nativeDOMName(error))throw AppFailure.create(fromKnownError(error,{phase:'parse',backend:'none'}));throw AppFailure.create(fromKnownError(error,{phase:'parse',backend:'none'}));}
 }
 if(options.expected&&expectedAudioDurationMismatch(options.expected,metadata.format.duration))fail('parse','integrity','metadata-duration-mismatch','none');
 const tagMismatch=options.expected?expectedAudioTagMismatch(metadata.common,options.expected,metadata.format.duration):null;
 if(tagMismatch)fail('parse','integrity',tagMismatch==='title'?'metadata-title-mismatch':'metadata-artist-mismatch','none');
 checkCancelled(signal); const duration=metadata.format.duration;
 if(!duration||!Number.isFinite(duration)||duration<=0)fail('parse','integrity','audio-duration-invalid','none');
 if(!metadata.format.codec)fail('parse','integrity','audio-codec-missing','none');
 // Capability selection happens before creating staging. Runtime OPFS failures never switch backend.
 const available=typeof navigator.storage?.getDirectory==='function'&&typeof FileSystemFileHandle!=='undefined'&&typeof FileSystemFileHandle.prototype.createWritable==='function';
 const backend=options.backend==='idb'?'idb':available?'opfs':'idb';attempt.backend=backend;attempt.closeState=backend==='opfs'?'not-attempted':'not-applicable';
 if(options.backend==='opfs'&&!available)fail('open','storage-unavailable','storage-unavailable','opfs');
 let job:ImportOperation={version:1,operationId,owner:crypto.randomUUID(),revision:1,state:'writing',backend,storageKey:crypto.randomUUID(),bytes:0,expectedBytes:file.size,...(accountId?{accountId}:{}),...(options.libraryMode==='cache'?{libraryMode:'cache' as const}:{})};
 // Resolve a key collision before recording ownership, so cleanup can never claim an old file.
 assertDatabaseUse('write');const directory=backend==='opfs'?await writeDirectory():undefined;assertDatabaseUse('write');
 if(directory)try{await directory.getFileHandle(job.storageKey);fail('open','internal','conflict','opfs');}catch(error){if(nativeDOMName(error)!=='NotFoundError')throw AppFailure.create(fromKnownError(error,{phase:'open',backend:'opfs'}));}
 
 let writer:FileSystemWritableFileStream|undefined;let closeAttempted=false;let closed=false;
 try{
 attempt.started=true;await createOperation(job);
 if(directory)writer=await atBoundary('open','opfs',async()=>{assertDatabaseUse('write');const handle=await directory.getFileHandle(job.storageKey,{create:true});assertDatabaseUse('write');return handle.createWritable();});
 const hash=sha256.create();let count=0;
 for(let offset=0;offset<file.size;offset+=CHUNK){
 checkCancelled(signal); const bytes=new Uint8Array(await atBoundary('read','none',()=>file.slice(offset,offset+CHUNK).arrayBuffer()));hash.update(bytes);
 if(writer){await atBoundary('write','opfs',()=>{assertDatabaseUse('write');return writer!.write(bytes);});job=await updateOperation(job,{bytes:offset+bytes.length});}
 else{
 await atBoundary('write','idb',async()=>{const db=await openDatabase();try{const tx=admittedTransaction(db,['chunks','jobs'],'readwrite');const done=transactionDone(tx);
 try{const current=await request<ImportOperation|undefined>(tx.objectStore('jobs').get(operationId));
 if(!validImportOperation(current,operationId)||JSON.stringify(current)!==JSON.stringify(job)||current.owner!==job.owner||current.revision!==job.revision||current.state!=='writing'){fail('write','internal','conflict','idb');}
 tx.objectStore('chunks').put(bytes,[job.storageKey,count]);const next={...job,bytes:offset+bytes.length,revision:job.revision+1};tx.objectStore('jobs').put(next,operationId);await done;job=next;
 }catch(error){try{tx.abort();}catch{/* settled */}await done.catch(()=>{});throw error;}
 }finally{closeDatabase(db);}});
 }
 count++;await atBoundary('transport','none',()=>progress(offset+bytes.length));
 }
 const digest=bytesToHex(hash.digest());
 if(options.expected&&digest!==options.expected.sha256)fail('verify','integrity','digest-mismatch',backend);
 const candidates=await atBoundary('read','idb',()=>all<LocalAsset>('assets'));const existing=candidates.find(a=>validAsset(a)&&a.sha256===digest&&a.bytes===file.size);
 const text=(s:string|undefined)=>s?.trim().slice(0,300)||null;
 const asset:LocalAsset={id:existing?.id??crypto.randomUUID(),namespace:'local',storageKey:job.storageKey,bytes:file.size,sha256:digest,mime,chunks:count,state:'complete',revision:(existing?.revision??0)+1,backend,chunkSize:CHUNK,retention:'kept'};
 const localAlbum=extractLocalAlbumMetadata(metadata.native,mime,albumTags,retried?'not-inspected':metadataWarning?(metadataWarning==='tag-size'?'omitted':metadataWarning==='tag-unsupported'?'not-inspected':'invalid'):null);
 const track:LinkedTrack={...(accountId?{accountId}:{}),localAlbum,id:crypto.randomUUID(),assetId:asset.id,audioFingerprint:{algorithm:'sha256',sha256:digest,bytes:file.size},title:text(metadata.common.title)||file.name.replace(/\.[^.]+$/,'').slice(0,300)||'Sin título',artist:text(metadata.common.artist),album:text(metadata.common.album),duration,favorite:false,revision:1,createdAt:new Date().toISOString(),manualOverrides:{}};
 job=await updateOperation(job,{state:'verifying',asset,track,expectedAssetRevision:existing?.revision??0});
 if(writer){assertDatabaseUse('write');closeAttempted=true;attempt.closeState='unknown';await atBoundary('close','opfs',()=>writer!.close());closed=true;attempt.closeState='acknowledged';}
 const reader=await openAssetReader(asset,false);try{const verified=await reader.verifyDetailed();if(verified.state!=='valid')throw AppFailure.create(verified.failure);}finally{reader.release();}
 job=await updateOperation(job,{state:'ready'});checkCancelled(signal); 
 const duplicate=await deduplicateOperation(job,signal);if(duplicate?.result)return outcome(duplicate.result);
 checkCancelled(signal); job=await updateOperation(job,{state:'publishing'});
 return outcome(await publishOperation(job,signal));
 }catch(error){
 attempt.failure(fromKnownError(error,{phase:null,backend:attempt.backend,cancelRequested:signal.aborted}));
 if(attempt.primary?.phase==='cleanup')attempt.secondary('cleanup',attempt.primary);
 // Independent secondary failures: abort must not prevent a reconciliation attempt.
 let abortFailed=false;
 if(writer&&!closeAttempted)try{await atBoundary('cleanup','opfs',()=>{assertDatabaseUse('cleanup');return writer!.abort();});}catch(cleanup){abortFailed=true;attempt.secondary('cleanup',fromKnownError(cleanup,{phase:'cleanup',backend:'opfs'}));}
 let current:ImportOperation|undefined;
 try{current=await atBoundary('reconcile','idb',()=>importOperation(operationId));}
 catch(reconcile){attempt.secondary('reconcile',fromKnownError(reconcile,{phase:'reconcile',backend:'idb'}));throw AppFailure.create(attempt.primary!);}
 if(current?.state==='sealed'&&current.result)return current.result;
 if(current?.state==='discarded'&&current.result)return current.result;
 if(current?.result&&current.state==='cleanup')attempt.pendingPublication=true;
 let uncertain=abortFailed||closeAttempted&&!closed||current?.state==='publishing'||current?.state==='verifying'||attempt.primary?.phase==='transport'||current?.state==='cleanup'&&!!current.result;
 if(current&&!uncertain){
 try{if(current.state!=='cleanup')current=await updateOperation(current,{state:'cleanup',cause:attempt.primary?.code==='cancelled'?'cancelled':attempt.primary?.code==='quota-exceeded'?'quota':'copy-failed'});await cleanupOperation(current);}
 catch(cleanup){attempt.secondary('cleanup',fromKnownError(cleanup,{phase:'cleanup',backend:current.backend}));uncertain=true;}
 }
 if(current&&uncertain&&current.state!=='cleanup')try{await updateOperation(current,{state:'uncertain',cause:closeAttempted&&!closed?'close-uncertain':'verification-or-commit-uncertain'});}catch{/* Durable nonterminal state still gates imports. */}
 if(uncertain||!current)attempt.started=true;
 else {attempt.started=false;attempt.cleaned=true;}
 throw AppFailure.create(attempt.primary!);
 }
}
function checkCancelled(signal:AbortSignal){assertDatabaseUse('write');if(signal.aborted)fail('validate','cancelled','cancelled','none');}
/** Public detailed API: one copy algorithm, one writer lock, optional metadata after durable audio. */
export async function importFileDetailed(file:File,signal:AbortSignal,progress:(bytes:number)=>void=()=>{},options:ImportOptions={}):Promise<ImportAttemptResult>{
 const attempt=new Attempt();
 try{
 const result=await importFileCore(file,signal,progress,options,attempt);
 return {kind:'confirmed',result,outcome:attempt.confirmed()};
 }catch(error){
 attempt.failure(fromKnownError(error,{phase:null,backend:attempt.backend,cancelRequested:signal.aborted}));
 return {kind:'failed',outcome:attempt.outcome(attempt.started?'unknown':attempt.cleaned?'not-published':'not-started')};
 }
}
/** Legacy surface uses the same core; only fixed safe messages cross a failed attempt. */
export async function importFile(file:File,signal:AbortSignal,progress:(bytes:number)=>void=()=>{},options:ImportOptions={}):Promise<DetailedImportResult>{
 const result=await importFileDetailed(file,signal,progress,options);
 if(result.kind==='confirmed')return result.result;
 const f=result.outcome.primary!;
 if(result.outcome.recoveryRequired)throw new Error('Resultado incierto. Se conservan los bytes; revisa y recupera la operación antes de importar.');
 if(f.code==='quota-exceeded')throw new DOMException('No hay espacio suficiente. Se conserva tu biblioteca.','QuotaExceededError');
 if(f.code==='cancelled')throw new DOMException('Importación cancelada; se conservan los archivos ya publicados.','AbortError');
 throw AppFailure.create(f);
}

async function metadataView(...args:Parameters<typeof audioMetadataView>){
 try{return await audioMetadataView(...args);}catch(error){if(isMetadataLimit(error))fail('parse','internal','limit-exceeded','none');throw error;}
}

function isMetadataLimit(error:unknown):boolean {try{return error instanceof AudioMetadataLimitError;}catch{return false;}}
const artworkCodes=['image-size','image-format','image-structure','image-dimensions','decode-unavailable','decode-failed','tag-size','tag-invalid','tag-unsupported','format-not-inspected','storage-failed','conflict'] as const;
const lyricsCodes=['size','lines','line-size','unicode','format','timestamp','offset','cues','track','conflict','corrupt','storage','quota','locks'] as const;
function optionalCode<T extends string>(error:unknown,kind:typeof ArtworkError|typeof LyricsError,codes:readonly T[],fallback:T):T {
 try{
 if(error instanceof kind){const descriptor=Object.getOwnPropertyDescriptor(error,'code');if(descriptor&&'value'in descriptor&&typeof descriptor.value==='string'&&codes.includes(descriptor.value as T))return descriptor.value as T;}
 }catch{/* Optional metadata cannot invalidate already confirmed audio. */}
 return fallback;
}
