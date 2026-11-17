import {LOCAL_ACCOUNT} from './accounts/account-controller';
import {createDownloadRemovalController} from './ui/download-removal-state';
import {DownloadRemovalDialog} from './ui/DownloadRemovalDialog';
import {SpotifyPlaylistExport} from './ui/SpotifyPlaylistExport';
import {groupStorageDownloads} from './library/storage-groups';
import {StorageSettings} from './ui/StorageSettings';
import './ui/settings-layout.css';
import {prepareAccountLibrary,readAccountLibrary,applyAccountLibrary,attachRestoredAccountTrack} from './accounts/library-local';
import {createLibrarySync,accountLibraryRequest,librarySyncMessage} from './accounts/library-sync';
import {requestLibraryDownload} from './library/library-download';
import {TrackActionsMenu,trackActionOpener} from './ui/TrackActionsMenu';
import {AccountAccess} from './ui/AccountAccess';
import {AccountRequired} from './ui/AccountRequired';
import {MobileInstallNotice} from './ui/MobileInstallNotice';
import {reuseInstalledWindow} from './pwa/launch-reuse';
import {accountController} from './accounts/neon-provider';
import {AlbumDownloadNotice} from './ui/AlbumDownloadNotice';
import {formatStorageMB,formatStorageProgress} from './library/storage-format';
import {AUDIO_FILE_MAX_BYTES,AUDIO_BLOB_TOTAL_MAX_BYTES} from './storage/audio-limits';
import {startAutomaticUpdates,type UpdateState} from './service-worker/automatic-update';
import {updateWorkPending} from './service-worker/update-blockers';
import {createCollectionRemovalController} from './ui/collection-removal-state';
import {listeningCacheAssets,summarizeListeningCache} from './library/listening-cache';
import {summarizeStorage} from './library/storage-summary';
import {CollectionRemovalController} from './ui/CollectionRemovalController';
import {waitForSongAdmission} from './library/song-admission';
import {readSongCopyStatus,type SongCopyInspection} from './library/song-copy-status';
import {readLibraryTrackIds,addTrackToLibrary} from './library/library-membership';
import type {BotDownloadedAudio} from './telegram/bot-search-protocol';
import {readSongAlias,readSongDisplayArtist,rememberSongAlias,type SongPlaybackAttempt,type SongChoice,type SongManagement} from './library/selected-song';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Ownership} from './playback/ownership';
import {Player} from './playback/player';
import {normalizeSnapshot,planQueueRestore,restoreAssetAvailable,type Snapshot} from './playback/queue-restore';
import {all,createPlaylist,changePlaylist,editTrack,verifiedAssetDetailed,validAsset,validAudioFingerprint,type LocalAsset,type Track,type Playlist} from './library/library';
import {importOperations,importIssues,retainImportIssue,terminal,type ImportOperation,type ImportIssue} from './storage/import-operations';
import {readRecord,writeRecord,openExistingDatabase,admittedTransaction,request,closeDatabase,subscribeDatabaseLifecycle,registerDatabaseOpenGuard,registerDatabaseUseGuard,retireDatabaseRealm,type DatabaseLifecycleState} from './storage/database';
import {transactionDone} from './storage/transaction-done';
import {registerDatabaseRealmHost,beginWorkerAttempt,revokeDatabaseWorkerAttempts,activeDatabaseWorkerAttempts,type RealmAttempt} from './storage/database-realms';
import {attachDatabaseTransportLifecycle,revalidateDatabaseTransport} from './playback/database-transport';
import {prepareLocalSources,startLocalSourcePreparation,transportNotice} from './playback/transport';
import {copySourceAsset,dataObject} from './playback/local-source-protocol';
import {createQueueInsertionController,type SelectedOccurrence,type InsertionStatus} from './playback/queue-insertion-controller';
import type {Placement} from './playback/queue-insertion';
import {createLocalCopyProtection} from './playback/local-copy-protection';
import {createSourceReviewAdmission} from './playback/source-review-admission';
import {LocalBatchPanel} from './ui/LocalBatchPanel';
import {LyricsPanel} from './ui/LyricsPanel';
import {OrganizationPanel} from './ui/OrganizationPanel';
import {LocalCopiesController,type CopyPanelOperation,type CopyPanelDiagnostic} from './ui/LocalCopiesController';
import {groupArtists,groupAlbums,selectGroup,orderAlbumRows} from './library/groups';
import {resolveLocalAlbumMetadata} from './library/album-metadata';
import {AlbumMetadataInfo} from './ui/AlbumMetadataInfo';
import {LocalCopyRemovalController} from './ui/LocalCopyRemovalController';
import {scanCopyRemovalStartup,type CopyRemovalStartup,type CopyRemovalHost} from './ui/local-copy-removal-state';
import {MetadataRescanController} from './ui/MetadataRescanController';
import {LibraryPagination,useLibraryPage} from './ui/LibraryPagination';
import {LIBRARY_PAGE_SIZE} from './library/pagination';
import {HomeView} from './ui/HomeView';
import {CollectionHeader} from './ui/CollectionHeader';
import {BackButton} from './ui/BackButton';
import {CollectionCover} from './ui/CollectionCover';
import {CatalogArtwork} from './ui/CatalogArtwork';
import {MiniPlayer,miniPlayerArtist} from './ui/MiniPlayer';
import {PlayerSurface} from './ui/PlayerSurface';
import {PlaybackProgress} from './ui/PlaybackProgress';
import {NowPlayingView} from './ui/NowPlayingView';
import {usePlayerLyrics,PlayerLyricsPreview,PlayerLyricsReader} from './ui/PlayerLyrics';
import {PlayerArtwork} from './ui/PlayerArtwork';
import {emptyShellView,matchesShellTrack,recentTracks,homePlaylists,trackAvailability,availabilityText,type ShellView} from './library/shell-selectors';
import './ui/shell.css';
import './style.css';
import './ui/design-tokens.css';
import './ui/responsive-shell.css';
import './ui/design-fidelity.css';
import './ui/app-polish.css';
import './ui/mini-player.css';
import {createDiagnosticSession,type Handle} from './diagnostics/session';
import {domFailure,failureText,result,type Operation,type Phase,type Result} from './diagnostics/contract';
import {createResponseGate,type ImportRequest,type RecoveryRequest,type WorkerResponse} from './imports/import-protocol';
import {workerFailureOutcome,makeOutcome,type OutcomeV1} from './imports/import-outcome';
import {toDiagnosticResults} from './diagnostics/import-mapping';
import {AppFailure,copyFailureV1,fromKnownError,makeFailure} from './errors/app-failure';
import {copyFeatureObservation,panelFailure,type BeginPanelDiagnostic,type PanelDiagnosticAttempt,type PanelOperation} from './diagnostics/panel-mapping';
import type {Capabilities} from './diagnostics/export';
import {DiagnosticsPanel} from './ui/DiagnosticsPanel';
import {TelegramPanel} from './ui/TelegramPanel';
import {PlaybackIndicator} from './ui/PlaybackIndicator';
import {telegramBlockReason} from './telegram/admission';
// Temporary auth uses MemoryStorage and never reconciles or changes library data.
// Keep nonreviving mutation/reservation captures; library recovery retains its own gates.
function captureTelegramLifetime(){return captureRemovalRaw();}
function captureTelegramCurrent(){const review=sourceReview.captureCurrent(),mutation=captureForeignMutationCurrent(),scope=scopeId,proof=control.proof,admission=databaseGeneration,current=control.activity.scope();return()=>scope===scopeId&&proof===control.proof&&admission===databaseGeneration&&current()&&review()&&mutation()&&control.owner&&databaseState==='ready'&&!busy&&!sourceReview.hasReservation();}
function captureLyricsCurrent(){const review=sourceReview.captureCurrent();const scope=scopeId,proof=control.proof,admission=databaseGeneration,current=control.activity.scope();return()=>scope===scopeId&&proof===control.proof&&admission===databaseGeneration&&control.owner&&!busy&&databaseState==='ready'&&current()&&review();}
function captureLyricsWriteCurrent(){const current=captureLyricsCurrent(),mutation=captureForeignMutationCurrent();return()=>current()&&mutation()&&!copyRemovalBlocked();}
const diagnostics=createDiagnosticSession();
function diagnosticCurrent(){const scope=scopeId,current=control.activity.scope();return ()=>scope===scopeId&&current()&&control.activity.admitted;}
function beginDiagnostic(operation:Operation){return diagnostics.begin(operation,diagnosticCurrent());}
// Capabilities and their handles stay in this document. Features/workers only
// receive closed observations, never a consent epoch, proof or correlation ID.
const panelDiagnosticHandles=new WeakMap<PanelDiagnosticAttempt,Handle|null>();
const panelOperations:readonly PanelOperation[]=['verify-batch','recover-batch','export-organization','preview-organization','apply-organization','inspect-organization','recover-organization'];
const beginPanelDiagnostic:BeginPanelDiagnostic=(operation,currentGuard)=>{
 let live=true;
 const scope=scopeId,proof=control.proof,activityScope=control.activity.scope();
 const current=()=>{try{return live&&scope===scopeId&&proof===control.proof&&control.owner&&activityScope()&&currentGuard();}catch{return false;}};
 if(!panelOperations.includes(operation)||!current())return null;
 try{
 const handle=diagnostics.begin(operation,current);
 const attempt:PanelDiagnosticAttempt=Object.freeze({
 complete(value){try{if(!current())return;const observation=copyFeatureObservation(value);if(!observation)return;diagnostics.complete(handle,observation.primary);if(observation.cleanup)diagnostics.complete(handle,observation.cleanup,'cleanup');}catch{/* Diagnostics never own feature effects. */}},
 refreshFailed(value){try{if(!current())return;const failure=copyFailureV1(value);if(failure)diagnostics.complete(handle,panelFailure({...failure,phase:'refresh'}),'refresh');}catch{/* Preserve the operation and its first cause. */}},
 finish(){if(!live)return;live=false;panelDiagnosticHandles.delete(attempt);try{diagnostics.finish(handle);}catch{/* Idempotent observation cleanup only. */}},
 });
 panelDiagnosticHandles.set(attempt,handle);return attempt;
 }catch{return null;}
};
const copyPanelOperations:readonly CopyPanelOperation[]=['inspect-local-copies','verify-local-copy','export-audio','request-persistence'];
function captureRescanCurrent(){const review=sourceReview.captureCurrent(),mutation=captureForeignMutationCurrent();const scope=scopeId,proof=control.proof,admission=databaseGeneration,current=control.activity.scope();return()=>scope===scopeId&&proof===control.proof&&admission===databaseGeneration&&current()&&control.owner&&databaseState==='ready'&&review()&&mutation();}
function setMetadataRescanBlocking(blocked:boolean,current:()=>boolean){try{if(!current())return;}catch{return;}metadataRescanBlocked=blocked;control.activity.block('metadata-rescan',blocked);emit();if(!blocked)queueMicrotask(resumeStartupQueue);}
function captureCopyCurrent(){const review=sourceReview.captureCurrent(),mutation=captureForeignMutationCurrent();const scope=scopeId,proof=control.proof,current=control.activity.scope();return()=>scope===scopeId&&proof===control.proof&&current()&&control.owner&&!busy&&databaseState==='ready'&&review()&&mutation();}
function beginCopyDiagnostic(operation:CopyPanelOperation,current:()=>boolean):CopyPanelDiagnostic|null {
 if(!copyPanelOperations.includes(operation))return null;
 const guard=captureCopyCurrent(),handle=diagnostics.begin(operation,()=>guard()&&current());
 return {complete(failure,phase,partial=false){try{const f=failure===null?null:copyFailureV1(failure);if(failure!==null&&!f)return;diagnostics.complete(handle,{phase:f?.phase??phase,outcome:partial?'partial':f?.family==='cancelled'?'cancelled':f?'failed':'succeeded',family:f?.family??null,code:f?.code??'none',backend:f?.backend??'none',transport:'none',count:0});}catch{/* No product authority. */}},finish(){diagnostics.finish(handle);}};
}
// Passive presence only: no DB/network probes or estimates exported.
const capability=(read:()=>unknown)=>{try{return read()?'available':'unavailable';}catch{return 'unknown';}};
let diagnosticCapabilities:Capabilities=Object.freeze({indexedDbApi:capability(()=>typeof indexedDB!=='undefined'),webLocksApi:capability(()=>navigator.locks),broadcastChannelApi:capability(()=>typeof BroadcastChannel!=='undefined'),opfsApi:capability(()=>typeof navigator.storage?.getDirectory==='function'),serviceWorkerApi:capability(()=>navigator.serviceWorker),storageEstimateApi:capability(()=>typeof navigator.storage?.estimate==='function'),storageOperation:'not-observed',observedBackend:'unknown',observedTransport:'unknown'});

let updateNavigationLocked=false;
let accountEpoch=0;
const accountAvailable=()=>accountController.getSnapshot().user!==null;
const audio=new Audio();audio.preload='metadata';const player=new Player(audio,()=>accountAvailable()&&control.owner&&!updateNavigationLocked,phase=>{
 const handle=beginDiagnostic('play');return code=>{const failure=result(phase,code==='autoplay-denied'?'autoplay-blocked':code==='media-decode'?'integrity':code==='media-unsupported'?'unsupported-format':'internal',code);diagnostics.complete(handle,failure);diagnostics.finish(handle);};
});
let scopeId=0;
let suspendedSnapshot:Snapshot|undefined;
// A transfer requested with Play is an explicit, cancellable intent, not autoplay on focus.
let transferPlayIntent:{generation:number;scheduled?:boolean}|null=null;
let startupQueueAttempt:object|null=null;
const control=new Ownership(()=>{owner=control.owner;if(control.state==='sin-control'&&status==='Abriendo biblioteca…')status='Otra pestaña tiene el control. Solicítalo o comprueba si está disponible. Para pilotos, muestras o versiones antiguas, cierra esa entrada.';emit();},async()=>{
 if(!accountAvailable()){control.activity.close();return;}
 startupQueueAttempt=null;deferredQueueRestore=null;
 ++scopeId;diagnostics.resetScope();copyRemovalPending=true;copyRemovalStartup=null;metadataRescanBlocked=true;control.activity.block('metadata-rescan',true);
 if(databaseState!=='ready'){if(databaseReloadRequired())control.activity.invalidate();return;}
 suspendedSnapshot=undefined;configuring=true;player.suspend();sourceProtection.invalidateScope();player.setQueue([]);configuring=false;installMediaSession();const opening=control.activity.begin();const scope=scopeId,proof=control.proof;const current=()=>scope===scopeId&&proof===control.proof&&control.owner&&!!opening?.current();const diagnostic=beginDiagnostic('open-library');
 try{await sourceProtection.releaseUnused();if(!current())return;await refresh();if(!current())return;await readRemovalStartup(current);if(!current())return;status=`Biblioteca local. Puedes iniciar sesión en Telegram y buscar opciones del bot desde Buscar. Al elegir una canción se comprueba tu copia local; si falta, se obtiene del bot para descargarla y escucharla. Límite por canción: ${formatStorageMB(AUDIO_FILE_MAX_BYTES)}.`;
 const raw=await readRecord<unknown>('settings','library-playback');
 if(!current())return;
 if(raw!==undefined){const normalized=normalizeSnapshot(raw);if(normalized){if(!copyRemovalPending&&normalized.snapshot.entries.length&&normalized.snapshot.entries.every(entry=>tracks.some(track=>track.id===entry.trackId))){deferredQueueRestore={saved:normalized.snapshot,warnings:normalized.warnings,current:captureRemovalRaw()};}else if(copyRemovalPending)status='Hay una retirada pendiente. La cola guardada se conserva sin prepararla ni reproducirla.';}else status='La cola guardada no es válida. Se conserva sin cambios; prepara una nueva selección para reproducir.';}
 }catch(error){if(current()){diagnostics.complete(diagnostic,localFailure(error,'open'));control.activity.block('opening',true);status='No se pudo abrir el almacenamiento. Cierra otras pestañas o reintenta recargando.';}}finally{diagnostics.finish(diagnostic);opening?.end();}if(current()){resumeStartupQueue();emit();}
},undefined,{prepare:prepareRelease,blocked:()=>databaseState!=='ready'||releaseBlocked()});
let databaseState:'ready'|DatabaseLifecycleState='ready';
let databaseGeneration=0;
const sourceProtection=createLocalCopyProtection({
 getPlayer:()=>({entries:player.entries,currentEntryId:player.current?.id??null,source:audio.getAttribute('src')?audio.src:null}),
 captureCurrent:()=>{const scope=scopeId,proof=control.proof,admission=databaseGeneration,activityScope=control.activity.scope();return()=>scope===scopeId&&proof===control.proof&&admission===databaseGeneration&&activityScope()&&control.owner&&databaseState==='ready';},
});
// Private root admission for explicit copy review and recovery.
const sourceReview=createSourceReviewAdmission({
 protection:sourceProtection,activity:control.activity,
 canReserve:()=>control.owner&&!busy&&databaseState==='ready'&&!importRecoveryPending()&&!metadataRescanBlocked&&!botImportActive,
 captureCurrent:()=>{const scope=scopeId,proof=control.proof,admission=databaseGeneration,activityScope=control.activity.scope();return()=>scope===scopeId&&proof===control.proof&&admission===databaseGeneration&&activityScope()&&control.owner&&databaseState==='ready';},
 changed:()=>emit(),
});
const databaseRetries=new Set<()=>boolean>();
const databaseReloadRequired=()=>databaseState==='versionchange'||databaseState==='version-incompatible';
const databaseRecoverable=()=>databaseState==='blocked'||databaseState==='connection-closed';
let metadataRescanBlocked=true;
let owner=false;let busy=false;let status='Abriendo biblioteca…';let tracks:Track[]=[];let playlists:Playlist[]=[];let addedTrackIds:ReadonlySet<string>=new Set();
const listeners=new Set<()=>void>();const emit=()=>{observeQueueAdmission();finishTransferPlay();listeners.forEach(fn=>fn());};
let writes=Promise.resolve();let lastSave=0;let configuring=false;
let queueSaveTokens=0,queueInsertionUncertain=false,insertionAdmissionEpoch=0,foreignMutationEpoch=0,lastInsertionAdmission='',lastForeignAdmission='',lastInsertionOccupied=false,observingInsertionAdmission=false,insertionCommitInProgress=false;
const queueSaveTransactions=new Set<{tx:IDBTransaction;current:()=>boolean}>();
const insertionPresentations=new Map<string,()=>boolean>();
const insertionGestures=new WeakMap<object,{intentId:string;placement:Placement;selection:readonly SelectedOccurrence[]}>();
let operations:ImportOperation[]=[];
let importProblems:ImportIssue[]=[];
// Routing identities stay private and never enter a diagnostic payload. A successful
// refresh alone cannot dismiss a worker response whose result was not validated.
const unverifiedImportResponses=new Set<string>();
const availability=new Map<string,{generation:string;state:'available'|'missing'|'invalid'}>();
let storageEstimate:{usage?:number;quota?:number}|null=null;
let storedAssets:LocalAsset[]=[];
let artworkRefreshToken=0;
let updateReady=false;
let updateState:UpdateState='checking',manualReloadPending=false;
let automaticUpdates:ReturnType<typeof startAutomaticUpdates>|null=null;
if('serviceWorker'in navigator)void navigator.serviceWorker.register('/sw.js',{type:'module',updateViaCache:'none'}).catch(()=>{/* Optional shell cache; version detection stays independent. */});

async function admitted<T extends unknown[]>(kind:Operation,work:(...args:T)=>Promise<void>,...args:T){
 if(databaseState!=='ready'&&kind!=='refresh-library')return;
 if(kind!=='prepare-queue'&&kind!=='refresh-library'&&queueForeignBlocked())return;
 if(kind==='prepare-queue'&&(copyRemovalBlocked()||!sourceReview.canPrepare()))return;
 if(kind!=='prepare-queue'&&kind!=='refresh-library'&&(copyRemovalPending||collectionBlocked()))return;
 if(kind!=='prepare-queue'&&kind!=='refresh-library'&&sourceReview.hasReservation())return;
 if(kind==='edit-organization'&&copyRemovalBlocked())return;
 const operation=control.activity.begin();if(!operation)return;const diagnostic=beginDiagnostic(kind);
 try{await work(...args);}catch(error){if(operation.current()){const failure=domFailure(error,'admit');diagnostics.complete(diagnostic,failure);status=failureText(failure);control.activity.block('operation-uncertain',true);emit();}}
 finally{diagnostics.finish(diagnostic);operation.end();}
}
const recover=(...args:Parameters<typeof recoverWork>)=>admitted('recover-import',recoverWork,...args);
const retainProblem=(...args:Parameters<typeof retainProblemWork>)=>admitted('recover-import',retainProblemWork,...args);
const act=(...args:Parameters<typeof actWork>)=>admitted('edit-organization',actWork,...args);
const queue=(...args:Parameters<typeof queueWork>)=>replaceQueue(...args);
const importRecoveryPending=()=>unverifiedImportResponses.size>0||operations.some(job=>!terminal(job))||importProblems.some(issue=>!issue.retained);
let botImportActive:object|null=null;
const importsBlocked=()=>!!botImportActive||databaseState!=='ready'||importRecoveryPending()||metadataRescanBlocked||sourceReview.hasReservation();
let collectionGate:string|null=null;
const collectionBlocked=()=>collectionGate===removalScopeKey();
const copyRemovalBlocked=()=>importsBlocked()||copyRemovalPending||collectionBlocked();
let copyRemovalPending=true;
let copyRemovalStartup:{key:string;snapshot:CopyRemovalStartup}|null=null;
let removalRecoveryEpoch=0;
const removalEligibleTracks=new Set<string>();
const removalScopeKey=()=>`${scopeId}:${control.proof}:${databaseGeneration}`;
function captureRemovalRaw(){const auth=accountEpoch,scope=scopeId,proof=control.proof,admission=databaseGeneration,activity=control.activity.scope();return()=>accountAvailable()&&auth===accountEpoch&&scope===scopeId&&proof===control.proof&&admission===databaseGeneration&&activity()&&control.owner&&databaseState==='ready';}
function setCopyRemovalBlocking(key:string,blocked:boolean,inactive:boolean){if(key!==removalScopeKey())return;copyRemovalPending=blocked;control.activity.block('copy-removal',blocked&&inactive);emit();}
async function readRemovalStartup(current:()=>boolean){
 const key=removalScopeKey(),abort=new AbortController(),snapshot=await scanCopyRemovalStartup({signal:abort.signal,current:()=>key===removalScopeKey()&&current()});
 if(!current()||key!==removalScopeKey())return;
 copyRemovalStartup={key,snapshot};setCopyRemovalBlocking(key,snapshot.unknown||snapshot.pending.length>0,true);
}
let deferredQueueRestore:{saved:Snapshot;warnings:string[];current:()=>boolean}|null=null;
function queueForeignBlocked(){return queueInsertions.pendingCount>0||queueInsertionUncertain;}
function insertionBaseReady(){return control.owner&&!busy&&databaseState==='ready'&&!copyRemovalBlocked()&&!sourceReview.hasReservation()&&control.activity.resolved&&!queueInsertionUncertain;}
function observeQueueAdmission(){
 if(observingInsertionAdmission)return;observingInsertionAdmission=true;
 try{
  const signature=JSON.stringify([scopeId,control.proof,databaseGeneration,control.owner,busy,databaseState,copyRemovalBlocked(),sourceReview.hasReservation(),control.activity.resolved,queueInsertionUncertain]);
  if(signature!==lastInsertionAdmission){lastInsertionAdmission=signature;++insertionAdmissionEpoch;if(deferredQueueRestore&&insertionBaseReady())queueMicrotask(resumeStartupQueue);}
  // Feature-owned confirmation/scan blocks do not revoke that feature's own
  // execution guard. FIFO occupancy has its own nonreviving mutation epoch.
  const mutation=JSON.stringify([scopeId,control.proof,databaseGeneration,control.owner,busy,databaseState,sourceReview.hasReservation(),collectionBlocked()]);
  if(mutation!==lastForeignAdmission){lastForeignAdmission=mutation;++foreignMutationEpoch;}
  const occupied=queueInsertions.pendingCount>0;
  if(occupied!==lastInsertionOccupied){lastInsertionOccupied=occupied;++foreignMutationEpoch;}
  for(const record of queueSaveTransactions)if(!record.current())try{record.tx.abort();}catch{/* confirmed commit may already have won */}
 }finally{observingInsertionAdmission=false;}
}
function captureInsertionCurrent(){observeQueueAdmission();const auth=accountEpoch,epoch=insertionAdmissionEpoch,review=sourceReview.captureCurrent(),scope=scopeId,proof=control.proof,admission=databaseGeneration,activity=control.activity.scope();return()=>{observeQueueAdmission();return accountAvailable()&&auth===accountEpoch&&epoch===insertionAdmissionEpoch&&scope===scopeId&&proof===control.proof&&admission===databaseGeneration&&activity()&&insertionBaseReady()&&review();};}
function captureForeignMutationCurrent(){observeQueueAdmission();const epoch=foreignMutationEpoch,raw=captureRemovalRaw(),review=sourceReview.captureCurrent();return()=>{observeQueueAdmission();return epoch===foreignMutationEpoch&&raw()&&review()&&!busy&&!collectionBlocked()&&!queueForeignBlocked();};}
function captureReplacementCurrent(){observeQueueAdmission();const epoch=foreignMutationEpoch,current=captureInsertionCurrent();return()=>{observeQueueAdmission();return epoch===foreignMutationEpoch&&current();};}
const queueInsertions=createQueueInsertionController({
 canAccept:()=>insertionBaseReady()&&sourceReview.canPrepare()&&deferredQueueRestore===null&&control.activity.count===queueInsertions.pendingCount+queueSaveTokens&&(queueInsertions.pendingCount>0||!sourceProtection.getReadonlySnapshot().unknown),
 beginActivity:()=>control.activity.begin(),captureExecution:captureInsertionCurrent,getOwnerProof:()=>control.proof,
 getPlayer:()=>({get queueRevision(){return player.queueRevision;},get queueEpoch(){return player.queueEpoch;},structure:()=>player.structure(),insertQueue:(request,beforeEmit)=>{
  insertionCommitInProgress=true;
  try{const inserted=player.insertQueue(request,beforeEmit);if(inserted.kind==='inserted'){configuring=false;suspendedSnapshot=undefined;}return inserted;}
  finally{insertionCommitInProgress=false;}
 }}),
 beginSources:(ids,current)=>sourceProtection.beginInsertion(ids,current),
 resolveSelection:async(selection,current,signal)=>{
  const check=()=>{if(signal.aborted)throw AppFailure.create(makeFailure('read','cancelled','cancelled','none'));if(!current())throw AppFailure.create(makeFailure('read','internal','owner-unavailable','none'));};
  check();const db=await openExistingDatabase();let tx:IDBTransaction|undefined;
  try{
   check();tx=admittedTransaction(db,['tracks','assets'],'readonly');const done=transactionDone(tx),native=tx;
   const abort=()=>{try{native.abort();}catch{/* settled */}};signal.addEventListener('abort',abort,{once:true});
   try{
    const rows=await Promise.all(selection.map(row=>request<unknown>(native.objectStore('tracks').get(row.trackId))));check();
    const tracksNow=rows.map((value,i)=>{const track=dataObject(value);if(!track||track.id!==selection[i].trackId||typeof track.title!=='string'||track.title.length>300||typeof track.assetId!=='string')throw AppFailure.create(makeFailure('read','integrity','asset-missing','idb'));return track;});
    const raw=await Promise.all(tracksNow.map(track=>request<unknown>(native.objectStore('assets').get(track.assetId as string))));check();
    const result=raw.map((value,i)=>{const asset=copySourceAsset(value);if(!asset||asset.id!==tracksNow[i].assetId)throw AppFailure.create(makeFailure('read','integrity',value===undefined?'asset-missing':'local-corrupt','idb'));return Object.freeze({entryId:selection[i].entryId,trackId:selection[i].trackId,title:tracksNow[i].title as string,asset});});
    await done;check();return Object.freeze(result);
   }catch(error){abort();await done.catch(()=>{});throw error;}finally{signal.removeEventListener('abort',abort);}
  }finally{closeDatabase(db);}
 },
 startSources:startLocalSourcePreparation,saveLatestQueue:current=>saveLatestQueue(current),
 onPendingChanged:count=>{
  if(count===0){queueInsertionUncertain=sourceProtection.getReadonlySnapshot().unknown&&control.owner&&databaseState==='ready';control.activity.block('queue-insertion',queueInsertionUncertain);}
  emit();
 },
 onStatus:insertionStatus,
});
function insertionStatus(value:InsertionStatus){
 if(value.phase==='uncertain'){queueInsertionUncertain=true;control.activity.block('queue-insertion',true);}
 const current=insertionPresentations.get(value.intentId);if(!current?.())return;
 const n=value.requested;
 switch(value.phase){
  case 'queued':status=`Adición aceptada: ${n} entradas en espera.`;break;
  case 'preparing':status=`Preparando ${n} entradas sin detener la reproducción…`;break;
  case 'settling':status='Esperando el cierre de la adición; la cola anterior se conserva.';break;
  case 'inserted':configuring=false;status=`${value.added} entradas añadidas ${value.placement==='next'?'a continuación':'al final'}.`+(value.terminal?.kind==='inserted'&&value.terminal.persistence==='not-saved'?' No se pudo guardar la cola; se conserva en esta sesión.':'');break;
  case 'cancelled':status='Adición detenida; las entradas ya confirmadas se conservan.';break;
  case 'failed':status=value.terminal?.kind==='failed'?failureText(localFailure(AppFailure.create(value.terminal.failure),'transport'))+' No se añadió ninguna entrada.':'No se pudo añadir la selección. La cola anterior se conserva.';break;
  case 'uncertain':status='No se pudo confirmar el cierre de los recursos. Se conserva la reproducción; espera el cierre antes de iniciar otra operación.';break;
 }
 emit();
}
async function replaceQueue(...args:Parameters<typeof queueWork>){
 const current=captureInsertionCurrent();if(!current())return;
 if(queueInsertions.pendingCount){queueInsertions.cancelAll('replaced');status='Deteniendo las adiciones antes de preparar otra cola…';emit();await queueInsertions.whenSettled();if(!current())return;}
 if(queueInsertionUncertain)return;await admitted('prepare-queue',queueWork,...args);
}
async function clearQueue(){
 const admitted=captureInsertionCurrent();if(!admitted())return;
 queueInsertions.cancelAll('replaced');await queueInsertions.whenSettled();if(!admitted())return;
 const current=captureRemovalRaw(),operation=control.activity.begin();if(!operation)return;
 busy=true;configuring=true;emit();
 try{
  player.suspend();player.setQueue([]);suspendedSnapshot=undefined;sourceProtection.invalidateScope();await sourceProtection.releaseUnused();
  if(!current()||!operation.current())return;
  const saved=await saveLatestQueue(()=>current()&&operation.current(),true);
  status=saved==='saved'?'Cola vacía. Las canciones y sus archivos se conservan.':'Cola vacía en esta sesión. No se pudo guardar el cambio.';
 }finally{if(current()&&operation.current()){busy=false;configuring=false;queueInsertionUncertain=sourceProtection.getReadonlySnapshot().unknown;control.activity.block('queue-insertion',queueInsertionUncertain);emit();}operation.end();}
}
function resumeStartupQueue(){
 const restore=deferredQueueRestore;if(!restore)return;if(!restore.current()){deferredQueueRestore=null;return;}
 if(!insertionBaseReady()||queueForeignBlocked()||!sourceReview.canPrepare())return;deferredQueueRestore=null;
 const attempt={};startupQueueAttempt=attempt;
 void queue([],restore.saved,restore.warnings).finally(()=>{if(startupQueueAttempt===attempt){startupQueueAttempt=null;emit();}});
}
function outcomeDiagnostic(handle:Handle|null,outcome:OutcomeV1,operation:'import'|'recovery'='import'){
 const projected=toDiagnosticResults(outcome,operation);
 if(projected.primary)diagnostics.complete(handle,projected.primary);
 if(projected.cleanup)diagnostics.complete(handle,projected.cleanup,'cleanup');
 return projected.primary??projected.cleanup;
}
function localFailure(error:unknown,phase:Phase):Result {
 const failure=fromKnownError(error,{phase,backend:'unknown'});
 return {...result(failure.phase??phase,failure.family,failure.code),backend:failure.backend};
}
function unverifiedResponse(id:string){unverifiedImportResponses.add(id);control.activity.block('import-transport',true);}
function verifiedResponse(id:string){unverifiedImportResponses.delete(id);control.activity.block('import-transport',unverifiedImportResponses.size>0);}
type DomainTerminal=Exclude<WorkerResponse,{type:'progress'}>;
interface DomainSettlement {response:DomainTerminal|null;outcome:OutcomeV1}
/** Keep the exact request receiver until a terminal receipt or observed transport
 * failure, even if lifecycle already invalidated business publication. */
async function invokeDomainWorker(kind:'recovery'|'import',exactWorker:Worker,request:RecoveryRequest|ImportRequest,current:()=>boolean,onProgress?:(bytes:number)=>void,signal?:AbortSignal):Promise<DomainSettlement>{
 let bridge:RealmAttempt|null=null,sendAttempted=false;
 let detachTransport:()=>void=()=>{};
 const cancel=()=>{if(request.type==='import')try{exactWorker.postMessage({version:2,type:'cancel',operationId:request.operationId});}catch{/* Original terminal receiver remains owned. */}};
 if(request.type==='cancel')throw Error('unsupported');
 const id=request.operationId;
 const settle=(value:DomainSettlement)=>{if(value.outcome.recoveryRequired)unverifiedResponse(id);else if(value.response&&value.outcome.status==='confirmed')verifiedResponse(id);return value;};
 try{
  bridge=await beginWorkerAttempt(kind,exactWorker,current);
  if(!bridge.current())throw AppFailure.create(makeFailure('admit','storage-unavailable','storage-unavailable','idb'));
  const gate=createResponseGate(request);
  return await new Promise<DomainSettlement>(resolve=>{
   let finished=false;
   const finish=(value:DomainSettlement)=>{if(finished)return;finished=true;resolve(settle(value));};
   const failed=(code:'worker-failed'|'worker-protocol')=>finish({response:null,outcome:workerFailureOutcome(code,sendAttempted)});
   exactWorker.onerror=event=>{event.preventDefault();failed('worker-failed');};
   exactWorker.onmessageerror=()=>failed('worker-protocol');
   exactWorker.onmessage=event=>{
    const checked=gate(event.data);if(checked.kind==='ignored')return;
    if(checked.kind==='protocol'){failed('worker-protocol');return;}
    const m=checked.response;
    if(m.type==='progress'){if(current()&&bridge?.current())onProgress?.(m.bytes);return;}
    finish({response:m,outcome:m.outcome});
   };
   // The final bridge also observes failures on its private control port. Such
   // failures may have no domain reply; record uncertainty before closing it.
   detachTransport=bridge!.onTransportFailure(failed);
   if(finished)return;
   if(!bridge!.current()){
    finish({response:null,outcome:makeOutcome({status:'failed',primary:makeFailure('admit','storage-unavailable','storage-unavailable','idb'),cleanup:null,reconcile:null,writeState:'not-started',closeState:'not-applicable',recoveryRequired:false})});return;
   }
   try{if(signal?.aborted){finish({response:null,outcome:workerFailureOutcome('worker-failed',false)});return;}sendAttempted=true;exactWorker.postMessage(request);signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();}catch{failed('worker-failed');}
  });
 }catch(error){
  const failure=fromKnownError(error,{phase:null,backend:'unknown'});
  return settle({response:null,outcome:makeOutcome({status:sendAttempted?'uncertain':'failed',primary:failure.code==='unknown'?makeFailure(null,'internal','worker-failed','unknown'):failure,cleanup:null,reconcile:null,writeState:sendAttempted?'unknown':'not-started',closeState:sendAttempted?'unknown':'not-applicable',recoveryRequired:sendAttempted})});
 }finally{
  exactWorker.onmessage=null;exactWorker.onerror=null;exactWorker.onmessageerror=null;
  signal?.removeEventListener('abort',cancel);detachTransport();
  if(bridge)bridge.closeAfterSettlement();else exactWorker.terminate();
 }
}
/** A user-chosen Telegram file is an explicit personal LOCAL copy, not an auth side effect. */
const songAdmissionIdle=()=>control.activity.resolved&&control.activity.count===queueSaveTokens;
function captureBotAudioImport(libraryMode?:'cache'){
 const admitted=captureForeignMutationCurrent(),raw=captureRemovalRaw(),review=sourceReview.captureCurrent();let used=false;
 const allowed=()=>admitted()&&raw()&&review()&&!busy&&!importRecoveryPending()&&!metadataRescanBlocked&&!copyRemovalPending&&!sourceReview.hasReservation()&&!queueForeignBlocked();
 if(!allowed()||botImportActive||!songAdmissionIdle())return null;
 return async(audio:BotDownloadedAudio,signal:AbortSignal,onProgress:(bytes:number)=>void):Promise<{state:'saved'|'failed'|'uncertain';trackId:string|null}>=>{
  if(used||!allowed()||botImportActive||!songAdmissionIdle()||signal.aborted)return {state:'failed',trackId:null};used=true;
  const operation=control.activity.begin();if(!operation)return {state:'failed',trackId:null};const own={};botImportActive=own;emit();
  const current=()=>admitted()&&raw()&&review()&&operation.current()&&botImportActive===own&&!sourceReview.hasReservation()&&!queueForeignBlocked();
  const operationId=crypto.randomUUID();let outcome:OutcomeV1|undefined,confirmed=false;const diagnostic=beginDiagnostic('import-audio');
  try{
   if(!current()||signal.aborted)return {state:'failed',trackId:null};
   const suffix=audio.mime==='audio/mpeg'?'.mp3':audio.mime==='audio/mp4'?'.m4a':'.wav';
   const file=new File([audio.blob],audio.target.title.replace(/[\/\\]/g,' ').slice(0,160)+suffix,{type:audio.mime});
   const request:ImportRequest={version:2,type:'import',operationId,file,expected:{sha256:audio.sha256,title:audio.target.title,artist:audio.target.artist,...(audio.target.album&&audio.target.durationSeconds!==null&&audio.target.durationSeconds>0?{recordingTitle:audio.recordingTitle??audio.target.title,album:audio.target.album,durationSeconds:audio.target.durationSeconds}:{})},...(libraryMode?{libraryMode}:{})};
   const worker=new Worker(new URL('./imports/import.worker.ts',import.meta.url),{type:'module'});
   const settled=await invokeDomainWorker('import',worker,request,current,bytes=>{if(current()&&!signal.aborted)onProgress(bytes);},signal);outcome=settled.outcome;
   confirmed=settled.response?.type==='complete'&&outcome.status==='confirmed'&&outcome.writeState==='published';outcomeDiagnostic(diagnostic,outcome);
   if(!current())return {state:confirmed||outcome.recoveryRequired?'uncertain':'failed',trackId:null};
   if(confirmed)verifiedResponse(operationId);else if(outcome.recoveryRequired)unverifiedResponse(operationId);
   // Even a cancellation that loses to commit must reconcile the confirmed receipt.
   try{await refresh(true,false,diagnostic,'refresh');}catch{control.activity.block('import-state',true);return {state:'uncertain',trackId:null};}
   status=confirmed?'Canción descargada, verificada y guardada en este navegador.':outcome.recoveryRequired?'La copia requiere revisión antes de volver a descargar.':'No se pudo guardar la canción.';emit();
   return {state:confirmed?'saved':outcome.recoveryRequired?'uncertain':'failed',trackId:confirmed&&settled.response?.type==='complete'?settled.response.result.track.id:null};
  }catch{return {state:confirmed||outcome?.recoveryRequired?'uncertain':'failed',trackId:null};}
  finally{diagnostics.finish(diagnostic);if(botImportActive===own)botImportActive=null;operation.end();emit();}
 };
}
function captureBotAudioSave(){
 const save=captureBotAudioImport();return save?async(...args:Parameters<typeof save>)=>(await save(...args)).state:null;
}
let selectedSongIntent=0;
let miniPlayerArtistHint:{entryId:string;artist:string}|null=null;
function cancelSelectedSongIntent(){++selectedSongIntent;emit();}
/** Which admission guard keeps a song/album download from starting (display only, never authority). */
function songCaptureBlockedReason():string|null{
 try{
  if(!accountAvailable())return 'No hay un perfil activo. Recarga la página.';
  if(!control.owner)return 'Otra pestaña de Pulso tiene el control. Ciérrala o solicita el control en Configuración.';
  if(databaseState!=='ready')return 'El almacenamiento no está listo. Recarga la página.';
  if(busy)return 'La biblioteca está ocupada con otra operación. Espera unos segundos y vuelve a intentarlo.';
  if(importsBlocked())return 'Hay una importación pendiente de revisión. Revísala en Configuración → Almacenamiento.';
  if(copyRemovalPending)return 'Hay una comprobación de copias locales pendiente. Recarga la página; si sigue, revísala en Configuración → Almacenamiento.';
  if(collectionBlocked())return 'Hay una retirada de canciones pendiente. Revísala en Configuración → Almacenamiento.';
  if(queueForeignBlocked())return 'La cola de reproducción está ocupada. Espera unos segundos.';
  if(!control.activity.resolved)return 'Pulso aún está comprobando la biblioteca. Espera unos segundos.';
  if(control.activity.count!==queueSaveTokens)return 'Hay otra descarga o guardado en curso. Espera a que termine.';
  if(!captureForeignMutationCurrent()())return 'La biblioteca está en pausa por una comprobación pendiente. Recarga la página.';
 }catch{/* display only */}
 return null;
}
function captureSongDownload():SongPlaybackAttempt|null {return captureSongPlayback('download');}
function captureSongPlayback(purpose:'playback'|'download'='playback'):SongPlaybackAttempt|null {
 const admitted=captureForeignMutationCurrent(),raw=captureRemovalRaw(),review=sourceReview.captureCurrent();
 if(!admitted()||busy||copyRemovalBlocked()||queueForeignBlocked()||!songAdmissionIdle())return null;
 const intent=purpose==='playback'?++selectedSongIntent:selectedSongIntent;let queueing=false,playUsed=false,rememberedId:string|null=null,primaryArtist:string|null=null;
 const current=()=>(purpose==='download'||intent===selectedSongIntent)&&raw()&&review()&&(queueing||admitted());
 return Object.freeze({current,
  async addToLibrary(trackId:string,caller:()=>boolean,signal:AbortSignal){
   const live=()=>{try{return current()&&caller()===true&&!signal.aborted&&!busy&&!copyRemovalBlocked()&&!queueForeignBlocked()&&!botImportActive&&control.activity.resolved;}catch{return false;}};
   const admitted=await waitForSongAdmission({current:live,ready:songAdmissionIdle,signal,subscribe:changed=>{listeners.add(changed);return()=>{listeners.delete(changed);};}});
   if(!admitted||!live())return false;
   const management=captureSongManagement(trackId);
   return management?.current()?management.add(live):false;
  },
  async lookup(choice:SongChoice,signal:AbortSignal){
   const live=()=>current()&&!signal.aborted;
   primaryArtist=((choice.source==='itunes'||choice.source==='musicbrainz')?choice.searchArtist:choice.source==='lrclib'?choice.artist:null)?.trim()||null;
   if(!live()||!songAdmissionIdle())throw Error('La biblioteca está ocupada.');const token=control.activity.begin();if(!token)throw Error('Sin control.');
   try{
    const id=await readSongAlias(choice,()=>live()&&token.current());if(!live())throw Error('cancelled');rememberedId=id;
    if(!id)return null;const track=await readRecord<Track>('tracks',id);if(!live())throw Error('cancelled');
    if(track&&track.id!==id)throw Error('La identidad de la ficha local ha cambiado.');
    if(!track||track.assetId===null)return null;
    const checked=await verifiedAssetDetailed(track.assetId,true);if(!live())throw Error('cancelled');
    if(checked.state==='missing')return null;
    if(checked.state!=='valid')throw Error('No se pudo verificar la copia local. Revisa Almacenamiento antes de repetir la descarga.');
    if(!validAudioFingerprint(track.audioFingerprint)||checked.asset.sha256!==track.audioFingerprint.sha256||checked.asset.bytes!==track.audioFingerprint.bytes)throw Error('La copia local no coincide con la identidad de audio guardada. Revisa Almacenamiento.');
    return track.id;
   }finally{token.end();}
  },
  async save(audio:BotDownloadedAudio,choice:SongChoice,signal:AbortSignal,onProgress:(n:number)=>void){
   if(!current()||signal.aborted)return {state:'failed' as const,trackId:null};
   const save=captureBotAudioImport('cache');if(!save)return {state:'failed' as const,trackId:null};
   const result=await save(audio,signal,onProgress);if(result.state!=='saved'||!result.trackId)return result;
   // A matching restored fingerprint keeps the old Track and all its organization.
   const restored=rememberedId?tracks.find(t=>t.id===rememberedId&&t.assetId!==null&&t.audioFingerprint?.sha256===audio.sha256&&t.audioFingerprint.bytes===audio.bytes):null;
   let trackId=restored?.id??result.trackId;
   if(rememberedId&&trackId!==rememberedId&&current()&&!signal.aborted){const accountId=accountController.getSnapshot().user?.id;if(accountId){trackId=await attachRestoredAccountTrack(accountId,rememberedId,trackId,()=>current()&&!signal.aborted);await refresh(false,false,null);}}
   if(!current()||signal.aborted)return {state:'saved' as const,trackId};
   const token=control.activity.begin();if(!token)return {state:'uncertain' as const,trackId};
   try{await rememberSongAlias(choice,trackId,audio.sha256,audio.bytes,()=>current()&&!signal.aborted&&token.current());return {state:'saved' as const,trackId};}
   catch{return {state:'uncertain' as const,trackId};}finally{token.end();}
  },
  async play(trackId:string,caller:()=>boolean,signal:AbortSignal){
   if(purpose==='download'||playUsed||signal.aborted||!current()||!caller()||busy||copyRemovalBlocked()||queueForeignBlocked())return 'failed' as const;playUsed=true;
   const guardedPlay=async()=>{
    const entry=player.current,epoch=player.queueEpoch;
    const stop=()=>{if(control.owner&&player.current===entry&&player.queueEpoch===epoch)player.pause();};
    signal.addEventListener('abort',stop,{once:true});
    try{if(signal.aborted||!caller()||!current())return 'failed' as const;
     miniPlayerArtistHint=entry&&primaryArtist?{entryId:entry.id,artist:primaryArtist}:null;emit();await player.play();
     if(signal.aborted||!caller()||!current()){stop();return 'failed' as const;}
     return player.state==='playing'?'playing' as const:player.lastFailure==='autoplay-denied'?'gesture-required' as const:'failed' as const;
    }finally{signal.removeEventListener('abort',stop);}
   };
   if(player.current?.trackId===trackId)return guardedPlay();
   queueing=true;
   const live=()=>current()&&caller();
   try{
    const before=player.queueEpoch;await queue([trackId],undefined,[],live);
    if(!live()||busy||copyRemovalBlocked()||player.queueEpoch===before||player.current?.trackId!==trackId)return 'failed' as const;
    return await guardedPlay();
   }finally{queueing=false;}
  },
 });
}
/** Passive album badges must not create/revoke a playback intent. */
function captureSongCopyInspection():SongCopyInspection|null {
 const raw=captureRemovalRaw(),review=sourceReview.captureCurrent();
 const current=()=>raw()&&review()&&!sourceReview.hasReservation();
 if(!current())return null;
 return Object.freeze({current,async inspect(choice:SongChoice,signal:AbortSignal){
  if(!current()||signal.aborted)return {state:'unknown' as const,trackId:null,inLibrary:null};
  const token=control.activity.begin();if(!token)return {state:'unknown' as const,trackId:null,inLibrary:null};
  try{return await readSongCopyStatus(choice,()=>current()&&token.current()&&!signal.aborted);}
  finally{token.end();}
 }});
}
function captureSongManagement(trackId:string):SongManagement|null {
 const admitted=captureForeignMutationCurrent(),raw=captureRemovalRaw(),review=sourceReview.captureCurrent();
 const capturedLists=new Map(playlists.map(list=>[list.id,list.revision]));let used=false;
 const current=()=>admitted()&&raw()&&review()&&!busy&&!copyRemovalBlocked()&&!queueForeignBlocked()&&songAdmissionIdle()&&tracks.some(t=>t.id===trackId);
 if(!current())return null;
 const run=async(work:(live:()=>boolean)=>Promise<unknown>,callerCurrent:()=>boolean=()=>true)=>{
  const callerLive=()=>{try{return callerCurrent()===true;}catch{return false;}};
  if(used||!current()||!callerLive())return false;used=true;const token=control.activity.begin();if(!token)return false;
  const live=()=>admitted()&&raw()&&review()&&token.current()&&callerLive()&&!busy&&!copyRemovalBlocked()&&!queueForeignBlocked();
  try{if(!live())return false;await work(live);await refresh(false,false,null);return live();}
  catch{return false;}finally{token.end();emit();}
 };
 return {current,playReady:player.current?.trackId===trackId,
  add:callerCurrent=>run(live=>addTrackToLibrary(trackId,live),callerCurrent),
  addToPlaylist:(id,callerCurrent)=>run(async live=>{const revision=capturedLists.get(id);if(revision===undefined)throw Error('playlist');await changePlaylist(id,revision,{type:'add',trackId},live);},callerCurrent),
  async play(){if(used||!current()||player.current?.trackId!==trackId)return 'failed';used=true;cancelSelectedSongIntent();const playing=player.play();await playing;return raw()&&player.current?.trackId===trackId?(player.state==='playing'?'playing':player.lastFailure==='autoplay-denied'?'gesture-required':'failed'):'failed';},
 };
}
let preparedLibraryAccount:string|null=null;
let syncRefresh=false,lastLibrarySyncSignature='';
const librarySync=createLibrarySync({read:readAccountLibrary,apply:applyAccountLibrary,remote:accountLibraryRequest,save:(id,revision,document,signal)=>accountLibraryRequest(id,signal,{revision,document}),ready:()=>accountAvailable()&&owner&&!busy&&databaseState==='ready'&&!copyRemovalBlocked()&&!queueForeignBlocked()&&songAdmissionIdle(),changed:()=>{syncRefresh=true;void refresh(false,false).finally(()=>{syncRefresh=false;});}});
librarySync.subscribe(()=>emit());
addEventListener('online',()=>void librarySync.sync());
addEventListener('focus',()=>void librarySync.sync());
setInterval(()=>{if(document.visibilityState==='visible')void librarySync.sync();},60000);
async function refresh(force=false,updateQueueTitles=true,parent?:Handle|null,failurePhase?:'refresh'){
 const accountId=accountController.getSnapshot().user?.id??null,auth=accountEpoch;const scope=scopeId,proof=control.proof,activityScope=control.activity.scope(),diagnostic=parent===undefined?beginDiagnostic('refresh-library'):parent;
 const current=()=>auth===accountEpoch&&accountId===(accountController.getSnapshot().user?.id??null)&&scope===scopeId&&proof===control.proof&&activityScope();
 try{
 if(accountId&&preparedLibraryAccount!==accountId){await prepareAccountLibrary(accountId,current);if(!current())return;preparedLibraryAccount=accountId;}
 const nextTracks=(await all<Track>('tracks')).filter(t=>!accountId||t.accountId===accountId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));const nextAddedTrackIds=await readLibraryTrackIds(nextTracks.map(t=>t.id),current);const nextPlaylists=(await all<Playlist>('playlists')).filter(p=>!accountId||p.accountId===accountId);const nextOperations=(await importOperations()).filter(job=>!accountId||job.accountId===accountId);const nextProblems=await importIssues();
 const assets=new Map((await all<LocalAsset>('assets')).map(asset=>[asset.id,asset]));
 const nextAvailability=new Map(availability);
 for(const track of nextTracks){const asset=track.assetId===null?undefined:assets.get(track.assetId);const generation=validAsset(asset)?`${asset.backend}:${asset.storageKey}:${asset.revision}`:asset===undefined?'missing':'invalid';
 if(force||availability.get(track.id)?.generation!==generation){
 if(track.assetId===null)nextAvailability.set(track.id,{generation,state:'missing'});
 else{const checked=await verifiedAssetDetailed(track.assetId);if(!current())return;if(checked.state==='unknown')throw AppFailure.create(checked.failure);
 nextAvailability.set(track.id,{generation,state:checked.state==='valid'?'available':checked.state==='missing'?'missing':'invalid'});}
 }}
 let estimate;try{estimate=await navigator.storage.estimate();}catch{estimate=null;}
 if(!current())return;
 diagnosticCapabilities=Object.freeze({...diagnosticCapabilities,storageOperation:'succeeded'});
 storedAssets=[...assets.values()].filter(validAsset);tracks=nextTracks;addedTrackIds=nextAddedTrackIds;playlists=nextPlaylists;operations=nextOperations;importProblems=nextProblems;storageEstimate=estimate;
 availability.clear();nextAvailability.forEach((value,key)=>availability.set(key,value));
 if(force)artworkRefreshToken++;
 control.activity.block('import-state',false);control.activity.block('opening',false);
 removalEligibleTracks.clear();for(const track of nextTracks){const asset=track.assetId?assets.get(track.assetId):null;if(validAsset(asset)&&asset.bytes<=AUDIO_FILE_MAX_BYTES&&nextAvailability.get(track.id)?.state==='available')removalEligibleTracks.add(track.id);}
 if(updateQueueTitles&&!copyRemovalPending&&!queueForeignBlocked())for(const entry of player.entries){const track=tracks.find(t=>t.id===entry.trackId);if(track)entry.title=track.title;}emit();
 const signature=JSON.stringify([accountId,nextTracks.map(t=>[t.id,t.revision,nextAddedTrackIds.has(t.id)]),nextPlaylists]);if(signature!==lastLibrarySyncSignature){lastLibrarySyncSignature=signature;if(!syncRefresh)librarySync.changed();}
 }catch(error){if(current()){diagnosticCapabilities=Object.freeze({...diagnosticCapabilities,storageOperation:'failed'});const failure=localFailure(error,'read');diagnostics.complete(diagnostic,failurePhase?{...failure,phase:failurePhase}:failure,parent===undefined?'primary':'refresh');}throw error;}finally{if(parent===undefined)diagnostics.finish(diagnostic);}
}
async function recoverWork(job:ImportOperation,action:'resume'|'discard'){
 if(!owner||busy||databaseState!=='ready'||copyRemovalPending)return;
 const operation=control.activity.begin();if(!operation)return;
 const scope=scopeId,proof=control.proof,diagnostic=beginDiagnostic('recover-import');
 const current=()=>scope===scopeId&&control.owner&&control.proof===proof&&operation.current();
 busy=true;status='Revisando la copia local…';emit();
 let recoveryWorker:Worker|null=null;
 try{
 recoveryWorker=new Worker(new URL('./imports/recovery.worker.ts',import.meta.url),{type:'module'});
 const request:RecoveryRequest={version:2,type:'recover',requestId:crypto.randomUUID(),operationId:job.operationId,revision:job.revision,action};
 const settled=await invokeDomainWorker('recovery',recoveryWorker,request,current);
 const response={state:settled.response?.type==='recovered'?settled.response.state:null,outcome:settled.outcome};
 if(!current()||!response)return;
 const failure=outcomeDiagnostic(diagnostic,response.outcome,'recovery');
 if(response.state){verifiedResponse(job.operationId);status=response.state==='sealed'?'Copia recuperada y verificada.':'Parcial descartado; tu biblioteca se conserva.';}
 else{if(response.outcome.recoveryRequired)unverifiedResponse(job.operationId);status=failure?failureText(failure):'No se pudo confirmar la copia. Se conservan sus datos.';}
 }
 catch{if(current()){outcomeDiagnostic(diagnostic,workerFailureOutcome('worker-failed',false),'recovery');status='No se pudo iniciar la recuperación. Se conservan los datos; revisa la operación antes de reintentar.';}}
 finally{
  if(recoveryWorker){recoveryWorker.onmessage=null;recoveryWorker.onerror=null;recoveryWorker.onmessageerror=null;recoveryWorker.terminate();}
  if(current())try{await refresh(true,true,diagnostic);}catch{if(current()){control.activity.block('import-state',true);status+=' No se pudo actualizar la vista; conserva tus originales y vuelve a comprobar el estado.';}}
  diagnostics.finish(diagnostic);operation.end();if(scope===scopeId){busy=false;emit();}
 }
}
async function retainProblemWork(issue:ImportIssue){
 if(!owner||busy||databaseState!=='ready'||copyRemovalPending)return;busy=true;emit();
 try{await retainImportIssue(issue);status='Registro revisado: se conservan todos sus archivos. No se ha confirmado ni eliminado esa copia.';}
 catch{status='No se pudo revisar el registro; se conserva.';}
 finally{try{await refresh();}catch{control.activity.block('import-state',true);status='No se pudo reabrir el almacenamiento. Recarga para revisar el estado.';}busy=false;emit();}
}
async function actWork(fn:(current:()=>boolean)=>Promise<unknown>,onRefreshed?:()=>void){
 if(!owner||busy||copyRemovalBlocked()||queueForeignBlocked())return;const scope=scopeId,diagnostic=beginDiagnostic('edit-organization');
 const raw=captureRemovalRaw(),review=sourceReview.captureCurrent();
 const current=()=>raw()&&review()&&!busy&&!copyRemovalBlocked()&&!queueForeignBlocked();
 try{
  try{await fn(current);}catch(error){if(scope===scopeId){const failure=domFailure(error,'write');diagnostics.complete(diagnostic,failure);status=failureText(failure);emit();}return;}
  if(scope!==scopeId||!current())return;
  try{await refresh(false,true,diagnostic);if(scope===scopeId&&current())onRefreshed?.();}
  catch{if(scope===scopeId){status='Cambios guardados. No se pudo actualizar la vista; vuelve a comprobar el estado antes de editar.';emit();}}
 }finally{diagnostics.finish(diagnostic);}
}
async function checkFiles(){
 if(databaseReloadRequired())return;
 const scope=scopeId,proof=control.proof,hadPending=unverifiedImportResponses.size>0,hadDatabaseBlock=databaseRecoverable();
 const activityScope=control.activity.scope();
 const current=()=>scope===scopeId&&proof===control.proof&&control.owner&&activityScope();
 if(hadDatabaseBlock)databaseRetries.add(current);
 try{await refresh(true,!copyRemovalPending);if(!current())return;await revalidateDatabaseTransport(proof,current);if(!current())return;if(databaseRecoverable()){databaseState='ready';control.activity.block('database',false);}if(databaseState==='ready'&&!copyRemovalStartup)await readRemovalStartup(current);for(const job of operations)if(terminal(job))verifiedResponse(job.operationId);
 if(unverifiedImportResponses.size){status='La respuesta sigue sin poder confirmarse. Conserva los originales y revisa las copias pendientes; si no hay un registro verificable, cierra esta entrada y vuelve a abrir.';emit();}}
 catch{if(current()){status='No se pudo comprobar el almacenamiento. Conserva tus originales y vuelve a revisar el estado.';emit();}return;}
 finally{if(hadDatabaseBlock)databaseRetries.delete(current);}

 if(current()&&hadPending&&!unverifiedImportResponses.size){status='Los registros locales ya confirman el resultado. Revisa la biblioteca antes de repetir una descarga.';emit();}
 else if(current()&&hadDatabaseBlock&&databaseState==='ready'&&!unverifiedImportResponses.size){status='Base local abierta y revisada. Comprueba las copias pendientes antes de continuar.';emit();}
}
async function queueWork(ids:string[],saved?:Snapshot,restoreWarnings:string[]=[],callerCurrent:()=>boolean=()=>true){
 if(!callerCurrent()||!owner||busy||copyRemovalBlocked()||queueForeignBlocked()||!sourceReview.canPrepare())return;deferredQueueRestore=null;const operation=control.activity.begin();if(!operation)return;
 const scope=scopeId,proof=control.proof,admission=databaseGeneration;
 const owns=()=>scope===scopeId&&proof===control.proof&&control.owner&&operation.current();
 const current=()=>owns()&&callerCurrent()&&databaseState==='ready'&&admission===databaseGeneration;
 const preparation=sourceProtection.beginPreparation(saved?saved.entries.map(entry=>entry.trackId):ids,current);
 const sourceAbort=new AbortController(),diagnostic=beginDiagnostic('prepare-queue');let sourcePublished=false;let phase:Phase='validate';let known:Result|undefined;busy=true;configuring=true;player.pause();status='Preparando cola…';emit();
 try{
 let restored=saved;let missing=0;
 if(saved){
 phase='read';const plan=await planQueueRestore(saved,async id=>{const track=tracks.find(t=>t.id===id);return !!track&&track.assetId!==null&&await restoreAssetAvailable(track.assetId);});
 if(!current())return;restored=plan.snapshot;missing=plan.missing;
 if(!restored.entries.length){known=result('verify','integrity','asset-missing');throw null;}
 }
 const planned=(restored?restored.entries.map(entry=>({track:tracks.find(t=>t.id===entry.trackId),entry})):ids.map(id=>({track:tracks.find(t=>t.id===id),entry:undefined}))).filter((p):p is {track:Track;entry:Snapshot['entries'][number]|undefined}=>!!p.track);
 const selected=planned.map(p=>p.track);if(!preparation.setPlanned(selected.map(track=>track.id)))return;if(!selected.length){known=result('validate','internal','empty-selection');throw null;}phase='read';
 if(!saved)for(const track of selected){
 if(track.assetId===null)throw AppFailure.create(makeFailure('read','integrity','asset-missing','none'));
 const checked=await verifiedAssetDetailed(track.assetId);if(!current())return;
 if(checked.state!=='valid')throw AppFailure.create(checked.failure);
 }
 if(!current())return;
 phase='transport';const bundle=await prepareLocalSources(selected.map(t=>{if(t.assetId===null)throw AppFailure.create(makeFailure('read','integrity','asset-missing','none'));return t.assetId;}),proof,current,{signal:sourceAbort.signal,current,deadlineAt:performance.now()+30000,reserveBlob:preparation.reserveBlob});
 const entries=selected.map((t,i)=>({id:planned[i].entry?.id??crypto.randomUUID(),trackId:t.id,title:t.title,src:bundle.sources[i].url}));
 preparation.stage(bundle,entries);
 if(!current()||!preparation.publish())return;
 sourcePublished=true;
 suspendedSnapshot=undefined;installMediaSession();
 if(restored?.currentEntryId===null)player.suspend();
 player.setQueue(entries);if(restored?.currentEntryId===null)player.state='paused';if(restored)player.restoreModes(restored.repeat,restored.shuffleOrder);
 const index=restored?entries.findIndex(e=>e.id===restored.currentEntryId):0;
 // A saved null selection unloads the old element before setQueue. Other
 // replacements select a new occurrence before releasing the old bundle.
 if(restored?.currentEntryId!==null)player.select(index>=0?index:0,false,index>=0?restored?.position??0:0);
 status='Cola lista y pausada. Pulsa Reproducir.'+(missing?` ${missing} entradas sin audio se omitieron. Podrás volver a descargarlas cuando esté disponible la conexión a Telegram.`:'')+(restoreWarnings.length?' '+restoreWarnings.join(' '):'')+(transportNotice?' '+transportNotice:'');
 }catch(error){if(!current())return;const failure=known??localFailure(error,phase);diagnostics.complete(diagnostic,failure);status=(saved?'No se pudo recuperar toda la cola. Se conserva la cola guardada y tu organización. ':'')+failureText(failure)+' Vuelve a comprobar el almacenamiento o prepara otra selección.';}
 finally{
  // Record the primary error above before best-effort resource settlement.
  // Keep Activity admitted through cleanup; an old finally never clears a new scope.
  if(!sourcePublished)sourceAbort.abort();await preparation.settle();
  diagnostics.finish(diagnostic);if(owns()){busy=false;configuring=false;emit();}operation.end();
 }
}
function snapshot():Snapshot|undefined{
 if(suspendedSnapshot)return suspendedSnapshot;
 if(!player.current&&!player.entries.length)return;
 return {version:1,entries:player.entries.map(({id,trackId})=>({id,trackId})),currentEntryId:player.current?.id??null,position:player.current&&Number.isFinite(audio.currentTime)?audio.currentTime:0,repeat:player.repeat,shuffleOrder:player.shuffleOrder?[...player.shuffleOrder]:null};
}
let saveFailureBurst=false;let saveFailureScope=diagnostics.scope();
function saveLatestQueue(caller:()=>boolean=()=>true,allowEmpty=false):Promise<'saved'|'not-saved'>{
 const raw=captureRemovalRaw(),review=sourceReview.captureCurrent();
 const current=()=>{try{return raw()&&review()&&caller()&&!copyRemovalBlocked()&&!queueInsertionUncertain;}catch{return false;}};
 if(!current())return Promise.resolve('not-saved');
 const operation=control.activity.begin();if(!operation)return Promise.resolve('not-saved');++queueSaveTokens;
 const diagnostic=beginDiagnostic('save-position'),diagnosticScope=diagnostics.scope();
 const guard=()=>operation.current()&&current();
 const work=writes.then(async():Promise<'saved'|'not-saved'>=>{
  if(!guard())return 'not-saved';
  // Read the latest structure at execution, never an old queued snapshot.
  const saved=snapshot()??(allowEmpty?{version:1 as const,entries:[],currentEntryId:null,position:0,repeat:player.repeat,shuffleOrder:null}:undefined);if(!saved)return 'not-saved';
  const db=await openExistingDatabase();let record:{tx:IDBTransaction;current:()=>boolean}|undefined;
  try{
   if(!guard())return 'not-saved';const tx=admittedTransaction(db,'settings','readwrite'),done=transactionDone(tx);record={tx,current:guard};queueSaveTransactions.add(record);
   try{if(!guard()){tx.abort();await done.catch(()=>{});return 'not-saved';}tx.objectStore('settings').put(saved,'library-playback');if(!guard())try{tx.abort();}catch{/* commit winner */}await done;return 'saved';}
   catch(error){try{tx.abort();}catch{/* settled */}await done.catch(()=>{});throw error;}
  }finally{if(record)queueSaveTransactions.delete(record);closeDatabase(db);}
 }).then(value=>{if(value==='saved'&&operation.current()&&diagnosticScope())saveFailureBurst=false;return value;}).catch((error):'not-saved'=>{
 if(!operation.current())return 'not-saved';if(diagnosticScope()){if(!saveFailureScope()){saveFailureBurst=false;saveFailureScope=diagnostics.scope();}
 if(!saveFailureBurst){diagnostics.complete(diagnostic,domFailure(error,'write'));saveFailureBurst=true;}}
 status='No se pudo guardar la posición. Tu biblioteca se conserva.';emit();return 'not-saved';}).finally(()=>{diagnostics.finish(diagnostic);--queueSaveTokens;operation.end();});
 writes=work.then(()=>{});return work;
}
function savePosition(){
 if(!control.owner||configuring||insertionCommitInProgress||copyRemovalBlocked()||queueInsertionUncertain)return;
 void saveLatestQueue();
}
let mediaSessionIdentity:string|null=null;
let mediaSessionArtwork:{trackId:string;image:MediaImage}|null=null;
function updateMediaSessionArtwork(trackId:string,image:MediaImage|null,previousUrl?:string){
 if(image){if(!owner||player.current?.trackId!==trackId)return;mediaSessionArtwork={trackId,image};}
 else if(mediaSessionArtwork?.image.src===previousUrl)mediaSessionArtwork=null;
 syncMediaSession();
}
function syncMediaSession(){
 if(!('mediaSession'in navigator)||!owner)return;
 const metadata=player.current?{title:player.current.title,artist:tracks.find(t=>t.id===player.current?.trackId)?.artist??'Artista desconocido',album:tracks.find(t=>t.id===player.current?.trackId)?.album??'',artwork:mediaSessionArtwork?.trackId===player.current.trackId?[mediaSessionArtwork.image]:[]}:null,key=JSON.stringify(metadata);
 if(key!==mediaSessionIdentity){navigator.mediaSession.metadata=metadata?new MediaMetadata(metadata):null;mediaSessionIdentity=key;}
 const state=player.state==='playing'?'playing':'paused';if(navigator.mediaSession.playbackState!==state)navigator.mediaSession.playbackState=state;
}
player.subscribe(change=>{
 if(change==='state'){sourceProtection.observePlayer();syncMediaSession();}
 if(owner&&!configuring&&!insertionCommitInProgress&&player.current&&(player.state!=='playing'||Date.now()-lastSave>2000)){lastSave=Date.now();savePosition();}
 if(change==='state')emit();
});
function clearMediaSession(){mediaSessionIdentity=null;mediaSessionArtwork=null;if('mediaSession'in navigator){navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none';for(const action of ['play','pause','nexttrack','previoustrack','seekto']as const)try{navigator.mediaSession.setActionHandler(action,null);}catch{/* optional */}}}
function installMediaSession(){if(!('mediaSession'in navigator))return;const scope=scopeId;
 for(const [action,handler]of Object.entries({play:()=>void player.play(),pause:()=>player.pause(),nexttrack:()=>player.next(),previoustrack:()=>player.previous(),seekto:(d:MediaSessionActionDetails)=>{if(d.seekTime!==undefined)player.seek(d.seekTime);}}))try{navigator.mediaSession.setActionHandler(action as MediaSessionAction,(d)=>{if(scope===scopeId&&control.owner&&!busy&&(action==='pause'||!collectionBlocked())){cancelSelectedSongIntent();handler(d);}});}catch{/* optional */}
}
async function prepareRelease(){
 const saved=snapshot();suspendedSnapshot=saved;
 ++scopeId;diagnostics.resetScope();player.suspend();clearMediaSession();
 sourceProtection.invalidateScope();await sourceProtection.releaseUnused();
 await writes;
 if(saved)await writeRecord('settings','library-playback',saved);
}
function releaseBlocked(){let pending=true;try{pending=!!sessionStorage.getItem('pulso-web:organization:pending-operation');}catch{/* Unknown tracking remains blocked. */}return busy||copyRemovalBlocked()||queueForeignBlocked()||pending;}
async function cede(){try{
 const released=await control.cede(prepareRelease,releaseBlocked);
 status=released?'Control cedido. Los bytes ya entregados a un lector no se pueden retirar.':'No se puede ceder: termina las operaciones y resuelve los resultados pendientes. Después confirma de nuevo.';
 }catch{status='No se pudo guardar la cola. Conservas el control, con el audio detenido. Reintenta Ceder control o prepara la cola de nuevo.';}emit();}
function finishTransferPlay(){
 const intent=transferPlayIntent;if(!intent||intent.scheduled)return;
 if(intent.generation!==databaseGeneration||document.visibilityState==='hidden'||['refused','cancelled','unsupported','failed'].includes(control.transferState)){transferPlayIntent=null;return;}
 if(control.transferState!=='acquired'||!control.owner||busy||startupQueueAttempt||deferredQueueRestore||copyRemovalBlocked()||queueForeignBlocked()||!control.activity.resolved)return;
 if(!player.entries.length){transferPlayIntent=null;status='Control disponible en esta pestaña. No hay una cola guardada para reproducir.';return;}
 const current=captureRemovalRaw();intent.scheduled=true;
 queueMicrotask(()=>{if(transferPlayIntent!==intent)return;transferPlayIntent=null;if(!current()||document.visibilityState==='hidden'||busy||copyRemovalBlocked()||queueForeignBlocked()||!control.activity.resolved)return;void player.play();});
}
async function useThisTab(withPlayback=false){
 if(!control.supported||databaseState!=='ready'||control.state==='cediendo')return;
 transferPlayIntent=withPlayback?{generation:databaseGeneration}:null;
 status=withPlayback?'Solicitando el control para reproducir aquí…':'Solicitando el control para esta pestaña…';
 // Start the new ownership intent before observers inspect the previous outcome.
 try{const request=control.useHere();emit();await request;}catch{transferPlayIntent=null;status='No se pudo transferir el control. Reintenta cuando termine la operación de la otra pestaña.';}
 emit();
}
function cancelTabTransfer(){transferPlayIntent=null;control.cancelTransfer();emit();}
// Later user interaction cancels a pending Play, including interactions that resolve a recovery gate.
document.addEventListener('pointerdown',()=>{transferPlayIntent=null;},true);
document.addEventListener('keydown',event=>{if(['Tab','Escape','Enter',' '].includes(event.key))transferPlayIntent=null;},true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){transferPlayIntent=null;savePosition();}});
window.addEventListener('pagehide',()=>{
 transferPlayIntent=null;
 diagnostics.resetScope();const saved=snapshot();suspendedSnapshot=saved;
 control.hide(async()=>{await writes;if(saved)await writeRecord('settings','library-playback',saved);},releaseBlocked);
 ++scopeId;player.suspend();clearMediaSession();sourceProtection.invalidateScope();void sourceProtection.releaseUnused();
 queueInsertions.cancelAll('revoked');
});
window.addEventListener('pageshow',event=>{if(event.persisted){status='Página recuperada sin control. Comprueba la disponibilidad; si hay operaciones pendientes, cierra esta entrada y vuelve a abrir.';emit();}});
// Realm-local native storage signals never authorize data cleanup or recovery.
// A blocked open can be retried explicitly; version changes require a new document.
const databaseAdmitted=()=>databaseState==='ready'||databaseRecoverable()&&[...databaseRetries].some(current=>current());
registerDatabaseOpenGuard(databaseAdmitted);
registerDatabaseUseGuard(databaseAdmitted);
function applyDatabaseLifecycle(state:DatabaseLifecycleState){
 transferPlayIntent=null;
 if(databaseReloadRequired()||databaseState===state)return;
 ++databaseGeneration;
 queueInsertions.cancelAll('revoked');
 databaseState=state;copyRemovalPending=true;copyRemovalStartup=null;metadataRescanBlocked=true;control.activity.block('metadata-rescan',true);control.activity.block('database',true);
 revokeDatabaseWorkerAttempts(state);
 if(databaseRecoverable()){
  retireDatabaseRealm();
  status=state==='connection-closed'?'Se interrumpió el acceso a la base local. Reintenta la apertura para revisar los datos.':'La base local está bloqueada. Cierra las otras entradas de Pulso y reintenta la apertura.';
  emit();return;
 }
 suspendedSnapshot=snapshot();configuring=true;++scopeId;
 // Local native notification invalidates before close. A remote realm already
 // revoked itself; this document invalidates synchronously on receipt.
 control.activity.invalidate();player.suspend();clearMediaSession();
 sourceProtection.invalidateScope();void sourceProtection.releaseUnused();busy=false;
 retireDatabaseRealm();
 diagnosticCapabilities=Object.freeze({...diagnosticCapabilities,storageOperation:'failed'});
 status=state==='version-incompatible'?'Esta versión no admite la base local. Abre la versión actualizada para continuar.':'La base local cambió de versión. Abre la versión actual para revisar la biblioteca.';
 emit();
}
subscribeDatabaseLifecycle(applyDatabaseLifecycle);
registerDatabaseRealmHost({
 capture(kind,callerCurrent){
  if(!control.owner||databaseState!=='ready'||!callerCurrent()||((kind==='import'||kind==='batch')&&(importRecoveryPending()||metadataRescanBlocked||copyRemovalPending)))return null;
  const resource=control.activity.begin();if(!resource)return null;
  const scope=scopeId,proof=control.proof;
  return {current:()=>scope===scopeId&&proof===control.proof&&control.owner&&databaseState==='ready'&&resource.current()&&callerCurrent(),onLifecycle:applyDatabaseLifecycle,end:()=>resource.end()};
 },
 onLifecycle:applyDatabaseLifecycle,
});
attachDatabaseTransportLifecycle(applyDatabaseLifecycle);
let activeAccount:string|null=null,accountQueue:Snapshot|undefined,accountQueueOwner:string|null=null;
function accountBoundary(){
 const next=accountController.getSnapshot().user?.id??null;if(next===activeAccount)return;
 const previous=activeAccount;activeAccount=next;librarySync.account(next===LOCAL_ACCOUNT.id?null:next);preparedLibraryAccount=null;lastLibrarySyncSignature='';tracks=[];playlists=[];addedTrackIds=new Set();
 if(previous){
  accountEpoch++;accountQueue=snapshot();accountQueueOwner=previous;transferPlayIntent=null;cancelSelectedSongIntent();queueInsertions.cancelAll('user');control.cancelTransfer();audio.pause();player.suspend();player.setQueue([]);clearMediaSession();
  if(control.owner&&control.activity.idle&&!releaseBlocked()){
   const saved=accountQueue;
   void control.cede(async()=>{await prepareRelease();if(saved)await writeRecord('settings','library-playback',saved);accountQueue=undefined;},releaseBlocked).then(released=>{if(released&&accountAvailable()&&control.state==='sin-control')void control.acquire();}).catch(()=>{control.activity.close();});
  }else control.activity.close();
 }
 if(next){
  if(control.state==='con-control'){control.activity.reopen();installMediaSession();if(accountQueueOwner===next&&accountQueue?.entries.length){deferredQueueRestore={saved:accountQueue,warnings:[],current:captureRemovalRaw()};accountQueue=undefined;resumeStartupQueue();}void refresh(true,false);}
  else void control.acquire();
  if(!control.supported){status='Este navegador no dispone de Web Locks. Reproducción y mutaciones bloqueadas.';void refresh();}
 }
 emit();
}
accountController.subscribe(accountBoundary);accountBoundary();void accountController.load();reuseInstalledWindow(window);
function App(){
 const account=React.useSyncExternalStore(accountController.subscribe,accountController.getSnapshot);
 const [setupReadyFor,setSetupReadyFor]=React.useState<string|null>(null);
 const onSetupReady=React.useCallback((ready:boolean)=>setSetupReadyFor(ready?account.user?.id??null:null),[account.user?.id]);
 const librarySyncState=React.useSyncExternalStore(librarySync.subscribe,librarySync.getSnapshot);
 const [,render]=React.useReducer(n=>n+1,0);React.useEffect(()=>{listeners.add(render);return()=>{listeners.delete(render);};},[]);
 const mutationCurrent=captureForeignMutationCurrent(),replacementCurrent=captureReplacementCurrent(),insertionCurrent=captureInsertionCurrent();
 const viewAct=(...args:Parameters<typeof act>)=>mutationCurrent()?act(...args):Promise.resolve();
 const viewQueue=(...args:Parameters<typeof queue>)=>replacementCurrent()?queue(...args):Promise.resolve();
 const viewRecover=(...args:Parameters<typeof recover>)=>mutationCurrent()?recover(...args):Promise.resolve();
 const viewRetain=(...args:Parameters<typeof retainProblem>)=>mutationCurrent()?retainProblem(...args):Promise.resolve();
 function addSelection(rows:readonly {key:string;track:Track}[],placement:Placement,event:React.MouseEvent<HTMLButtonElement>){
  if(!insertionCurrent())return;
  const gesture=event.nativeEvent??event;let intent=insertionGestures.get(gesture);
  if(!intent){const selection:SelectedOccurrence[]=rows.map(({key,track})=>Object.freeze({selectionKey:key,trackId:track.id,entryId:crypto.randomUUID()}));intent=Object.freeze({intentId:crypto.randomUUID(),placement,selection:Object.freeze(selection)});insertionGestures.set(gesture,intent);}
  if(!insertionPresentations.has(intent.intentId))insertionPresentations.set(intent.intentId,captureRemovalRaw());
  const accepted=queueInsertions.enqueue(intent,{current:insertionCurrent});
  if(accepted.kind==='rejected'){status=accepted.reason==='queue-limit'?'La cola completa admite hasta 1000 entradas. No se añadió la selección.':accepted.reason==='pending-limit'?'Hay demasiadas adiciones en espera. Espera a que terminen.':'No se puede añadir esta selección ahora. La cola se conserva.';emit();}
 }
 const [page,setPage]=React.useState<'inicio'|'buscar'|'biblioteca'>('inicio');
 const [settingsOpen,setSettingsOpen]=React.useState(false);
 const [settingsSection,setSettingsSection]=React.useState<'general'|'connections'|'tools'>('general');
 const [libraryTab,setLibraryTab]=React.useState<'playlists'|'albums'|'artists'|null>(null);
 const [libraryDetail,setLibraryDetail]=React.useState(false);
 const libraryOpener=React.useRef<HTMLButtonElement|null>(null);
 const settingsHeading=React.useRef<HTMLHeadingElement>(null),settingsOpener=React.useRef<HTMLButtonElement>(null);
 const [musicSearchTarget,setMusicSearchTarget]=React.useState<HTMLDivElement|null>(null);
 const [views,setViews]=React.useState({buscar:emptyShellView(),biblioteca:emptyShellView()});
 const destination=page==='buscar'?'buscar':'biblioteca';
 const {query,listId,groupMode,groupKey,favorites,present}=views[destination];
 function updateView(patch:Partial<ShellView>){setViews(old=>({...old,[destination]:{...old[destination],...patch}}));}
 const setQuery=(query:string)=>updateView({query});const setListId=(listId:string)=>updateView({listId});
 const setGroupMode=(groupMode:ShellView['groupMode'])=>updateView({groupMode});const setGroupKey=(groupKey:string)=>updateView({groupKey});
 const [name,setName]=React.useState('');const [target,setTarget]=React.useState('');const [theme,setTheme]=React.useState('system');
 const [discardId,setDiscardId]=React.useState<string|null>(null);
 const [rescanTrackId,setRescanTrackId]=React.useState<string|null>(null);
 const rescanHeading=React.useRef<HTMLHeadingElement>(null);
 const rescanOpener=React.useRef<HTMLButtonElement|null>(null),rescanIntent=React.useRef(0);
 const rescanFocus=React.useRef<{kind:'open'|'close';current:()=>boolean;opener:HTMLButtonElement|null}|null>(null);
 const [removalRequest,setRemovalRequest]=React.useState<{identity:object;track:Track}|null>(null);
 const removalHeading=React.useRef<HTMLHeadingElement>(null),removalOpener=React.useRef<HTMLButtonElement|null>(null);
 const removalFocus=React.useRef<{kind:'open'|'close';current:()=>boolean;opener:HTMLButtonElement|null}|null>(null);
 const removalKey=removalScopeKey();
 const removalHost=React.useMemo<CopyRemovalHost>(()=>({activity:control.activity,
  canStart:()=>owner&&!busy&&!copyRemovalBlocked()&&control.activity.idle,
  canRecover:()=>owner&&!busy&&databaseState==='ready'&&!importRecoveryPending()&&!metadataRescanBlocked&&!botImportActive&&!collectionBlocked(),
  captureRaw:captureRemovalRaw,reserve:target=>sourceReview.reserve(target),
  blocking:(blocked,inactive)=>setCopyRemovalBlocking(removalKey,blocked,inactive),
  refresh:()=>refresh(true,false,null),changed:()=>{},
 }),[removalKey]);
 const collectionHeading=React.useRef<HTMLHeadingElement>(null),collectionOpener=React.useRef<HTMLButtonElement|null>(null);
 const collectionKey=removalKey;
 const collectionController=React.useMemo(()=>{const reason=`collection-removal:${collectionKey}:${crypto.randomUUID()}`;return createCollectionRemovalController({activity:control.activity,
  canStart:()=>collectionKey===removalScopeKey()&&owner&&!busy&&!copyRemovalBlocked()&&!queueForeignBlocked()&&!botImportActive&&!deferredQueueRestore&&sourceReview.canPrepare()&&control.activity.idle,
  captureRaw:captureRemovalRaw,
  gate:active=>{if(active){if(collectionKey!==removalScopeKey())return;collectionGate=collectionKey;control.activity.block(reason,true);}else{control.activity.block(reason,false);if(collectionGate===collectionKey)collectionGate=null;}emit();},
  reserve:target=>{control.activity.block(reason,false);try{return sourceReview.reserve(target);}finally{control.activity.block(reason,true);}},refresh:()=>refresh(true,false,null),
  adopt:snapshot=>{if(collectionKey!==removalScopeKey())return;copyRemovalStartup={key:collectionKey,snapshot};++removalRecoveryEpoch;setCopyRemovalBlocking(collectionKey,snapshot.unknown||snapshot.pending.length>0,true);},
  checkpoint:current=>{if(current())void saveLatestQueue(current,true);},changed:()=>emit(),
 });},[collectionKey]);
 const downloadRemovalController=React.useMemo(()=>{const reason=`download-removal:${collectionKey}:${crypto.randomUUID()}`;return createDownloadRemovalController({activity:control.activity,
  canStart:()=>collectionKey===removalScopeKey()&&owner&&!busy&&!copyRemovalBlocked()&&!queueForeignBlocked()&&!botImportActive&&!deferredQueueRestore&&sourceReview.canPrepare()&&control.activity.idle,
  captureRaw:captureRemovalRaw,
  gate:active=>{if(active){if(collectionKey!==removalScopeKey())return;collectionGate=collectionKey;control.activity.block(reason,true);}else{control.activity.block(reason,false);if(collectionGate===collectionKey)collectionGate=null;}emit();},
  reserve:target=>{control.activity.block(reason,false);try{return sourceReview.reserve(target);}finally{control.activity.block(reason,true);}},refresh:()=>refresh(true,false,null),
  adopt:snapshot=>{if(collectionKey!==removalScopeKey())return;copyRemovalStartup={key:collectionKey,snapshot};++removalRecoveryEpoch;setCopyRemovalBlocking(collectionKey,snapshot.unknown||snapshot.pending.length>0,true);},
  checkpoint:current=>{if(current())void saveLatestQueue(current,true);},changed:()=>emit(),
 });},[collectionKey]);
 const routeHeading=React.useRef<HTMLHeadingElement>(null),playerHeading=React.useRef<HTMLHeadingElement>(null);
 const createInput=React.useRef<HTMLInputElement>(null);
 const [playerOpen,setPlayerOpen]=React.useState(false);
 const returnContext=React.useRef<{page:typeof page;scroll:number;opener:HTMLButtonElement}|null>(null);
 const navigationIntent=React.useRef(0);
 const routeScroll=React.useRef({inicio:0,buscar:0,biblioteca:0});
 // Only shell-delayed focus/scroll uses this generation; row commit focus has its own contract.
 const shellInteraction=React.useRef(0);
 React.useLayoutEffect(()=>{
  const cancel=()=>{++shellInteraction.current;};
  const key=(event:KeyboardEvent)=>{if(['Tab','ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key))cancel();};
  document.addEventListener('focusin',cancel,true);document.addEventListener('pointerdown',cancel,true);
  document.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);
  window.addEventListener('wheel',cancel,{passive:true});window.addEventListener('touchmove',cancel,{passive:true});
  return()=>{cancel();document.removeEventListener('focusin',cancel,true);document.removeEventListener('pointerdown',cancel,true);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);window.removeEventListener('wheel',cancel);window.removeEventListener('touchmove',cancel);};
 },[]);
 function shellResponse(){
  const intent=navigationIntent.current,interaction=shellInteraction.current,scope=scopeId,proof=control.proof,hadControl=control.owner;
  return()=>intent===navigationIntent.current&&interaction===shellInteraction.current&&scope===scopeId&&proof===control.proof&&hadControl===control.owner;
 }
 function rescanResponse(){const current=shellResponse(),intent=rescanIntent.current,activity=control.activity.scope(),admission=databaseGeneration;return()=>intent===rescanIntent.current&&admission===databaseGeneration&&activity()&&current();}
 function openRemoval(track:Track,opener:HTMLButtonElement){
  if(!mutationCurrent()||!owner||busy||copyRemovalBlocked()||!removalEligibleTracks.has(track.id))return;
  removalOpener.current=opener;removalFocus.current={kind:'open',current:rescanResponse(),opener};
  setRemovalRequest({identity:{},track});
 }
 function openPendingRemoval(opener:HTMLButtonElement){removalOpener.current=opener;removalFocus.current={kind:'open',current:rescanResponse(),opener};}
 function focusRemoval(){
  const intent=removalFocus.current;if(!intent||!intent.current())return;
  const fallback=settingsOpen?settingsHeading.current:playerOpen?playerHeading.current:page==='inicio'?document.getElementById('home-heading'):routeHeading.current;
  const dest=intent.kind==='open'?removalHeading.current:intent.opener?.isConnected&&!intent.opener.disabled&&intent.opener.getClientRects().length?intent.opener:fallback;
  if(!dest)return;removalFocus.current=null;dest.focus({preventScroll:true});dest.scrollIntoView({behavior:'auto',block:intent.kind==='open'?'start':'nearest',inline:'nearest'});
 }
 function closeRemoval(){removalFocus.current={kind:'close',current:rescanResponse(),opener:removalOpener.current};removalOpener.current=null;setRemovalRequest(null);requestAnimationFrame(focusRemoval);}
 function openCollection(selection:import('./library/collection-removal').CollectionSelection,title:string,opener:HTMLButtonElement){
  if(!mutationCurrent())return;const current=rescanResponse();
  if(!collectionController.start(selection,title))return;
  collectionOpener.current=opener;requestAnimationFrame(()=>{if(current()&&collectionController.getView().visible){collectionHeading.current?.focus({preventScroll:true});collectionHeading.current?.scrollIntoView({block:'start'});}});
 }
 function openDownloadRemoval(ids:string[],title:string,opener:HTMLButtonElement){
  if(!mutationCurrent())return;
  const entries=ids.flatMap(id=>{const asset=storedAssets.find(a=>a.id===id),track=tracks.find(t=>t.assetId===id&&removalEligibleTracks.has(t.id));return asset&&track?[{trackId:track.id,trackRevision:track.revision,asset}]:[];});
  if(downloadRemovalController.start(entries,title))collectionOpener.current=opener;
 }
 function closeCollection(){const current=rescanResponse(),opener=collectionOpener.current;collectionOpener.current=null;requestAnimationFrame(()=>{if(current()){const target=opener?.isConnected&&!opener.disabled?opener:settingsOpen?settingsHeading.current:routeHeading.current;target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest'});}});}
 function openRescan(trackId:string,opener:HTMLButtonElement){
  if(!mutationCurrent()||!owner||busy||copyRemovalBlocked())return;
  ++rescanIntent.current;rescanOpener.current=opener;rescanFocus.current={kind:'open',current:rescanResponse(),opener};setRescanTrackId(trackId);emit();
 }
 function closeRescan(){
  ++rescanIntent.current;rescanFocus.current={kind:'close',current:rescanResponse(),opener:rescanOpener.current};rescanOpener.current=null;setRescanTrackId(null);emit();
 }
 React.useLayoutEffect(()=>{
  const pending=rescanFocus.current;if(!pending)return;rescanFocus.current=null;if(!pending.current())return;
  const opener=pending.opener;
  const fallback=settingsOpen?settingsHeading.current:playerOpen?playerHeading.current:page==='inicio'?document.getElementById('home-heading'):routeHeading.current;
  const destination=pending.kind==='open'?rescanHeading.current:opener?.isConnected&&opener.getClientRects().length?opener:fallback;
  if(destination){destination.focus({preventScroll:true});destination.scrollIntoView({behavior:'auto',block:pending.kind==='open'?'start':'nearest',inline:'nearest'});}
 });
 function navigate(next:typeof page){setSettingsOpen(false);++navigationIntent.current;const current=shellResponse();moveFocus.current=null;favoriteFocus.current=null;returnContext.current=null;setPlayerOpen(false);routeScroll.current[page]=window.scrollY;setPage(next);requestAnimationFrame(()=>{if(current())window.scrollTo(0,routeScroll.current[next]);});return current;}
 function openPlayer(opener:HTMLButtonElement){++navigationIntent.current;const current=shellResponse();moveFocus.current=null;favoriteFocus.current=null;returnContext.current={page,scroll:window.scrollY,opener};setPlayerOpen(true);requestAnimationFrame(()=>{if(!current())return;playerHeading.current?.focus({preventScroll:true});const surface=playerHeading.current?.closest<HTMLElement>('.player-surface');if(surface)surface.scrollTop=0;});}
 function closePlayer(){++navigationIntent.current;const current=shellResponse();const context=returnContext.current;returnContext.current=null;setPlayerOpen(false);if(!context)return;setPage(context.page);requestAnimationFrame(()=>{if(!current())return;window.scrollTo(0,context.scroll);(context.opener.isConnected?context.opener:context.page==='inicio'?document.getElementById('home-heading'):routeHeading.current)?.focus({preventScroll:true});});}
 const playAuth=accountEpoch,playScope=scopeId,playProof=control.proof,playGeneration=databaseGeneration;const playCurrent=()=>accountAvailable()&&playAuth===accountEpoch&&playScope===scopeId&&playProof===control.proof&&playGeneration===databaseGeneration;
 const play=()=>{if(!playCurrent()||collectionBlocked())return;if(!owner){void useThisTab(true);return;}transferPlayIntent=null;if(!busy&&player.entries.length){cancelSelectedSongIntent();void player.play();}};const pause=()=>{if(!playCurrent())return;transferPlayIntent=null;if(owner&&!busy&&player.current){cancelSelectedSongIntent();player.pause();}};
 React.useLayoutEffect(()=>{
  const bars=[document.querySelector<HTMLElement>('.shell-nav'),document.querySelector<HTMLElement>('.mini-player')];
  const measure=()=>bars.forEach((bar,i)=>document.documentElement.style.setProperty(i?'--mini-height':'--nav-height',`${bar&&getComputedStyle(bar).position==='fixed'&&(i!==0||window.innerWidth<1024)?bar.getBoundingClientRect().height:0}px`));
  measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);const fallback=observer?null:new MutationObserver(measure);bars.forEach(bar=>{if(bar)fallback?.observe(bar,{subtree:true,childList:true,characterData:true});});bars.forEach(bar=>{if(bar)observer?.observe(bar);});window.addEventListener('resize',measure);
  return()=>{observer?.disconnect();fallback?.disconnect();window.removeEventListener('resize',measure);};
 },[!!player.current,!!account.user]);
 React.useEffect(()=>{let mounted=true;void readRecord<string>('settings','theme').then(value=>{if(mounted&&databaseState==='ready'&&value&&['system','light','dark'].includes(value)){setTheme(value);document.documentElement.dataset.theme=value;}}).catch(()=>{/* Appearance is optional; storage lifecycle owns the blocking notice. */});return()=>{mounted=false;};},[]);
 React.useEffect(()=>{setViews(old=>{let changed=false;const next={...old};for(const route of ['buscar','biblioteca']as const){if(old[route].listId&&!playlists.some(l=>l.id===old[route].listId)){next[route]={...old[route],listId:''};changed=true;}}return changed?next:old;});},[playlists]);
 const selected=playlists.find(l=>l.id===listId);
 const libraryTracks=React.useMemo(()=>tracks.filter(t=>addedTrackIds.has(t.id)),[tracks,addedTrackIds]);
 const recent=React.useMemo(()=>recentTracks(libraryTracks),[libraryTracks]);const homeLists=React.useMemo(()=>homePlaylists(playlists),[playlists]);
 const trackIndex=React.useMemo(()=>new Map(tracks.map(t=>[t.id,t])),[tracks]);
 const currentEntryId=player.current?.id,currentTrack=player.current?trackIndex.get(player.current.trackId):undefined;
 React.useEffect(syncMediaSession,[currentEntryId,currentTrack,owner,player.state]);
 const [playerOrganization,setPlayerOrganization]=React.useState<{entryId:string;pending:boolean;message:string}|null>(null);
 const playerOrganizationFlight=React.useRef(false);
 const playerOrganizationEpoch=React.useRef(0);
 const [storedArtistHint,setStoredArtistHint]=React.useState<{entryId:string;artist:string}|null>(null);
 React.useEffect(()=>{
  let live=true;setStoredArtistHint(null);
  if(currentEntryId&&currentTrack&&databaseState==='ready')void readSongDisplayArtist(currentTrack,()=>live).then(artist=>{if(live&&artist)setStoredArtistHint({entryId:currentEntryId,artist});}).catch(()=>{/* Optional presentation metadata. */});
  return()=>{live=false;};
 },[currentEntryId,currentTrack?.id,currentTrack?.artist,currentTrack?.audioFingerprint?.sha256,currentTrack?.audioFingerprint?.bytes,databaseState,scopeId,control.proof]);
 const playerReadScope=captureRemovalRaw(),playerGeneration=player.generation,playerQueueEpoch=player.queueEpoch,playerNavigation=navigationIntent.current;
 const playerLifetime=()=>playerOpen&&navigationIntent.current===playerNavigation&&playerReadScope()&&player.current?.id===currentEntryId&&player.generation===playerGeneration&&player.queueEpoch===playerQueueEpoch;
 const playerActionCurrent=()=>playerLifetime()&&mutationCurrent();
 const playerDisplayArtist=miniPlayerArtist(currentTrack,currentEntryId??'',miniPlayerArtistHint?.entryId===currentEntryId?miniPlayerArtistHint:storedArtistHint)??currentTrack?.artist??null;
 const playerLyrics=usePlayerLyrics(control.activity,currentTrack?.id??null,`${scopeId}:${control.proof}:${databaseGeneration}`,playerOpen,currentTrack&&playerDisplayArtist?{title:currentTrack.title,artist:playerDisplayArtist,album:currentTrack.album,durationSeconds:currentTrack.duration,current:playerLifetime}:undefined);
 async function favoritePlayer(){
  if(playerOrganizationFlight.current||!playerActionCurrent()||!currentTrack||!currentEntryId||!canOrganize)return;
  const epoch=++playerOrganizationEpoch.current, expected=!currentTrack.favorite;
  const live=()=>epoch===playerOrganizationEpoch.current&&playerLifetime();
  playerOrganizationFlight.current=true;setPlayerOrganization({entryId:currentEntryId,pending:true,message:'Guardando en Favoritos…'});
  let confirmed=false;
  try{
   await viewAct(current=>editTrack(currentTrack.id,currentTrack.revision,{favorite:expected},()=>current()&&live()),()=>{
    const saved=tracks.find(track=>track.id===currentTrack.id);
    confirmed=!!saved&&saved.favorite===expected&&saved.revision===currentTrack.revision+1;
   });
   if(live())setPlayerOrganization({entryId:currentEntryId,pending:false,message:confirmed?(expected?'Añadida a Favoritos.':'Quitada de Favoritos.'):'No se pudo confirmar el cambio en Favoritos. Revisa la biblioteca antes de repetirlo.'});
  }catch{if(live())setPlayerOrganization({entryId:currentEntryId,pending:false,message:'No se pudo guardar en Favoritos. La reproducción sigue disponible.'});}
  finally{playerOrganizationFlight.current=false;setPlayerOrganization(old=>old?.entryId===currentEntryId&&old.pending?{...old,pending:false}:old);}
 }
 const baseRows=React.useMemo(()=>page!=='buscar'&&selected?selected.entries.flatMap((entry,index)=>{const track=trackIndex.get(entry.trackId);return track?[{track,key:entry.id,playlistIndex:index}]:[];}):(favorites?tracks.filter(t=>t.favorite):libraryTracks).map(track=>({track,key:track.id,playlistIndex:-1})),[selected,libraryTracks,tracks,trackIndex,page,favorites]);
 const baseTracks=React.useMemo(()=>baseRows.map(row=>row.track),[baseRows]);
 const albumMetadata=React.useMemo(()=>new Map(tracks.map(t=>[t.id,resolveLocalAlbumMetadata(t)])),[tracks]);
 const metadataScope=React.useMemo(()=>JSON.stringify(tracks.map(t=>{const info=albumMetadata.get(t.id)!;return [t.id,t.title,t.artist,t.album,info.track.state==='known'?info.track.value:null,info.disc.state==='known'?info.disc.value:null,info.albumArtist.state==='known'?info.albumArtist.value:null,info.compilation.state==='known'?info.compilation.value:null];})),[tracks,albumMetadata]);
 const groups=React.useMemo(()=>groupMode==='artists'?groupArtists(baseTracks):groupMode==='albums'?groupAlbums(baseTracks):[],[groupMode,baseTracks]);
 const activeGroup=selectGroup(groups,groupKey);
 React.useEffect(()=>{if(groupKey&&!activeGroup)setGroupKey('');},[groupKey,activeGroup]);
 const visible=React.useMemo(()=>{const ids=activeGroup?new Set(activeGroup.trackIds):null;const rows=baseRows.filter(({track:t})=>(!ids||ids.has(t.id))&&matchesShellTrack(t,views[destination],availability));return groupMode==='albums'&&activeGroup&&!activeGroup.unknown?orderAlbumRows(rows):rows;},[baseRows,activeGroup,views,destination,groupMode]);
 const viewScope=JSON.stringify([page,listId,groupMode,groupKey,query,favorites,present,metadataScope]);
 // Reconcile both namespaces on every data update, including while Inicio is open.
 const routeTotals=React.useMemo(()=>{function routeSelection(route:'buscar'|'biblioteca'){
  const v=views[route],list=route==='biblioteca'?playlists.find(l=>l.id===v.listId):undefined;
  const rows=list?list.entries.flatMap(e=>{const t=trackIndex.get(e.trackId);return t?[t]:[];}):v.favorites?tracks.filter(t=>t.favorite):libraryTracks;
  const gs=v.groupMode==='artists'?groupArtists(rows):v.groupMode==='albums'?groupAlbums(rows):[];
  const g=selectGroup(gs,v.groupKey),ids=g?new Set(g.trackIds):null;
  return rows.filter(t=>(!ids||ids.has(t.id))&&matchesShellTrack(t,v,availability)).length;
 }
 return {biblioteca:routeSelection('biblioteca'),buscar:routeSelection('buscar')};},[views,playlists,libraryTracks,trackIndex,tracks]);
 const libraryPagination=useLibraryPage(routeTotals.biblioteca,JSON.stringify([views.biblioteca,metadataScope]));
 const searchPagination=useLibraryPage(routeTotals.buscar,JSON.stringify([views.buscar,metadataScope]));
 const pagination=destination==='buscar'?searchPagination:libraryPagination;
 const collectionPlaybackViewKey=JSON.stringify([viewScope,selected?.revision,visible.map(({key,track})=>[key,track.id])]);
 const latestCollectionPlaybackView=React.useRef(collectionPlaybackViewKey);latestCollectionPlaybackView.current=collectionPlaybackViewKey;
 const collectionQueueMatches=visible.length>0&&player.entries.length===visible.length&&player.entries.every((entry,index)=>entry.trackId===visible[index].track.id);
 const [collectionPreparing,setCollectionPreparing]=React.useState<{view:string;trackId:string}|null>(null);
 async function playCollection(startKey?:string){
  if(!replacementCurrent()||!owner||busy||copyRemovalBlocked()||!sourceReview.canPrepare()||!visible.length)return;
  const startIndex=startKey===undefined?null:visible.findIndex(row=>row.key===startKey);
  if(startIndex===-1)return;
  if(startIndex!==null&&player.state==='playing'&&player.current&&visible[startIndex].track.id===player.current.trackId)return;
  if(collectionQueueMatches&&player.current){
   if(startIndex===null){if(player.state==='playing')pause();else play();}
   else if(player.index===startIndex){if(player.state!=='playing')play();}
   else {cancelSelectedSongIntent();transferPlayIntent=null;player.select(startIndex,true);}
   return;
  }
  const view=shellResponse(),raw=captureRemovalRaw(),review=sourceReview.captureCurrent(),key=collectionPlaybackViewKey;
  cancelSelectedSongIntent();const playbackIntent=selectedSongIntent;
  const live=()=>playbackIntent===selectedSongIntent&&view()&&raw()&&review()&&latestCollectionPlaybackView.current===key;
  const ids=visible.map(({track})=>track.id),epoch=player.queueEpoch;
  const preparing={view:key,trackId:ids[startIndex??0]};setCollectionPreparing(preparing);
  try{await viewQueue(ids,undefined,[],live);
  if(!live()||document.visibilityState==='hidden'||busy||copyRemovalBlocked()||queueForeignBlocked()||!sourceReview.canPrepare()||player.queueEpoch!==epoch+1||!player.current||player.entries.length!==ids.length||!player.entries.every((entry,index)=>entry.trackId===ids[index]))return;
  transferPlayIntent=null;if(startIndex!==null&&startIndex!==player.index)player.select(startIndex,true);else void player.play();
  }finally{setCollectionPreparing(value=>value===preparing?null:value);}
 }
 const pageRows=visible.slice(pagination.start,pagination.end);
 const filteredPlaylist=!!query||!!groupKey||favorites||present||groupMode!=='tracks';
 type MoveFocus={viewScope:string;page:number;scope:number;proof:string;source:HTMLButtonElement;entryId:string;delta:-1|1;listId:string;revision:number;entries:Playlist['entries'];verified:boolean};
 const moveFocus=React.useRef<MoveFocus|null>(null);
 type FavoriteIntent={source:HTMLButtonElement;viewScope:string;page:number;scope:number;proof:string;trackId:string;revision:number;keys:string[];index:number;verified:boolean};
 const favoriteFocus=React.useRef<FavoriteIntent|null>(null),favoriteButtons=React.useRef(new Map<string,HTMLButtonElement>());
 async function toggleFavorite(track:Track,key:string,source:HTMLButtonElement){
  if(!mutationCurrent()||!owner||busy||copyRemovalBlocked())return;
  const intent:FavoriteIntent={source,viewScope,page:pagination.page,scope:scopeId,proof:control.proof,trackId:track.id,revision:track.revision+1,keys:visible.filter(row=>row.track.id!==track.id).map(row=>row.key),index:visible.slice(0,visible.findIndex(row=>row.key===key)).filter(row=>row.track.id!==track.id).length,verified:false};
  favoriteFocus.current=favorites&&track.favorite&&document.activeElement===source?intent:null;
  await viewAct(current=>editTrack(track.id,track.revision,{favorite:!track.favorite},current),()=>{
   const current=tracks.find(t=>t.id===track.id);
   if(favoriteFocus.current===intent&&current?.revision===intent.revision&&!current.favorite){intent.verified=true;render();}
  });
  if(favoriteFocus.current===intent&&!intent.verified)favoriteFocus.current=null;
 }
 React.useLayoutEffect(()=>{
  const intent=favoriteFocus.current;if(!intent)return;
  if(intent.viewScope!==viewScope||intent.scope!==scopeId||intent.proof!==control.proof||!owner||busy||!document.hasFocus()||
   (pagination.page!==intent.page&&pagination.page!==Math.max(0,Math.ceil(visible.length/LIBRARY_PAGE_SIZE)-1))||
   (document.activeElement!==intent.source&&(intent.source.isConnected||document.activeElement!==document.body))){favoriteFocus.current=null;return;}
  if(!intent.verified)return;
  const current=tracks.find(t=>t.id===intent.trackId);
  if(!current||current.favorite||current.revision!==intent.revision||visible.length!==intent.keys.length||visible.some((row,i)=>row.key!==intent.keys[i])){favoriteFocus.current=null;return;}
  const targetIndex=Math.min(intent.index,visible.length-1),destination=Math.max(0,Math.floor(targetIndex/LIBRARY_PAGE_SIZE));
  if(destination!==pagination.page){intent.page=destination;pagination.onPage(destination);return;}
  favoriteFocus.current=null;
  const nextFavorite=favoriteButtons.current.get(visible[targetIndex]?.key);(nextFavorite?trackActionOpener(nextFavorite):routeHeading.current)?.focus();
 });
 const moveButtons=React.useRef(new Map<string,HTMLButtonElement>());
 React.useEffect(()=>{
  // A different focus destination is a new user intent, even if they later return.
  const cancel=()=>{moveFocus.current=null;favoriteFocus.current=null;};
  const focus=(event:FocusEvent)=>{if((moveFocus.current&&event.target!==moveFocus.current.source)||(favoriteFocus.current&&event.target!==favoriteFocus.current.source))cancel();};
  const pointer=(event:PointerEvent)=>{if((moveFocus.current&&event.target!==moveFocus.current.source)||(favoriteFocus.current&&event.target!==favoriteFocus.current.source))cancel();};
  const keyboard=(event:KeyboardEvent)=>{if(event.key==='Tab')cancel();};
  document.addEventListener('focusin',focus);document.addEventListener('pointerdown',pointer);document.addEventListener('keydown',keyboard);
  window.addEventListener('blur',cancel);
  return()=>{cancel();document.removeEventListener('focusin',focus);document.removeEventListener('pointerdown',pointer);document.removeEventListener('keydown',keyboard);window.removeEventListener('blur',cancel);};
 },[]);
 React.useLayoutEffect(()=>{
  const intent=moveFocus.current;if(!intent)return;
  if(intent.viewScope!==viewScope||intent.page!==pagination.page||intent.scope!==scopeId||intent.proof!==control.proof||!owner||busy||!document.hasFocus()||
   (document.activeElement!==intent.source&&(intent.source.isConnected||document.activeElement!==document.body))){moveFocus.current=null;return;}
  if(!intent.verified)return;
  const current=playlists.find(list=>list.id===intent.listId);
  if(!current||current.revision!==intent.revision||current.entries.length!==intent.entries.length||current.entries.some((entry,i)=>entry.id!==intent.entries[i].id||entry.trackId!==intent.entries[i].trackId)){moveFocus.current=null;return;}
  // Missing track records are omitted from visible rows, so absolute playlist indices cannot select a page.
  const index=visible.findIndex(row=>row.key===intent.entryId);if(index<0){moveFocus.current=null;return;}
  const destination=Math.floor(index/LIBRARY_PAGE_SIZE);
  if(destination!==pagination.page){intent.page=destination;pagination.onPage(destination);return;}
  moveFocus.current=null;
  const movedButton=moveButtons.current.get(`${intent.delta}:${intent.entryId}`);if(movedButton)(movedButton.closest('dialog')?.open?movedButton:trackActionOpener(movedButton)).focus();
 });
 function moveAdjacent(key:string,delta:-1|1){const index=visible.findIndex(row=>row.key===key),row=visible[index],neighbor=visible[index+delta];if(!row||!selected)return false;if(row.playlistIndex===0&&delta===-1||row.playlistIndex===selected.entries.length-1&&delta===1)return true;return !!neighbor&&neighbor.playlistIndex===row.playlistIndex+delta;}
 async function moveEntry(entryId:string,delta:-1|1,source:HTMLButtonElement){
  if(!mutationCurrent()||!selected||!owner||busy||copyRemovalBlocked()||filteredPlaylist||!moveAdjacent(entryId,delta))return;
  const index=selected.entries.findIndex(entry=>entry.id===entryId),destination=index+delta;
  if(index<0||destination<0||destination>=selected.entries.length)return;
  const entries=[...selected.entries];[entries[index],entries[destination]]=[entries[destination],entries[index]];
  const intent:MoveFocus={viewScope,page:pagination.page,scope:scopeId,proof:control.proof,source,entryId,delta,listId:selected.id,revision:selected.revision+1,entries,verified:false};
  moveFocus.current=document.activeElement===source?intent:null;
  await viewAct(current=>changePlaylist(selected.id,selected.revision,{type:'move',entryId,delta},current),()=>{
   if(moveFocus.current!==intent)return;
   // act catches failures; only this post-refresh callback can request navigation/focus.
   intent.verified=true;render();
  });
  if(moveFocus.current===intent&&!intent.verified)moveFocus.current=null;
 }
 const downloads=React.useMemo(()=>storedAssets.map(asset=>({asset,aliases:tracks.filter(track=>track.assetId===asset.id)})),[tracks,storedAssets]);
 const listeningCache=React.useMemo(()=>summarizeListeningCache({tracks,assets:storedAssets,libraryTrackIds:addedTrackIds,playlists}),[tracks,storedAssets,addedTrackIds,playlists]);
 const storageSummary=React.useMemo(()=>summarizeStorage(storedAssets,new Set(listeningCacheAssets({tracks,assets:storedAssets,libraryTrackIds:addedTrackIds,playlists}).map(asset=>asset.id)),storageEstimate),[tracks,storedAssets,addedTrackIds,playlists,storageEstimate]);
 const protectedCopies=settingsOpen?sourceProtection.getReadonlySnapshot():null;
 const protectedAssetIds=new Set([protectedCopies?.current,...(protectedCopies?.prepared??[])].flatMap(ref=>ref?.source.asset?[ref.source.asset.id]:[]));
 for(const source of protectedCopies?.retainedSources??[])if(source.asset)protectedAssetIds.add(source.asset.id);
 const pendingTrackIds=new Set((protectedCopies?.pending??[]).flatMap(p=>p.trackIds));
 const canOrganize=owner&&!busy&&!copyRemovalBlocked()&&!queueForeignBlocked();
 const telegramLibraryPending=importRecoveryPending()||metadataRescanBlocked||copyRemovalPending;
 const telegramBlocked=telegramBlockReason({supported:control.supported,owner,acquiring:control.state==='adquiriendo',storageReady:databaseState==='ready',busy,reserved:sourceReview.hasReservation(),queuePending:queueForeignBlocked()});
 const canAppend=insertionBaseReady()&&deferredQueueRestore===null&&sourceReview.canPrepare()&&control.activity.count===queueInsertions.pendingCount+queueSaveTokens&&(queueInsertions.pendingCount>0||!sourceProtection.getReadonlySnapshot().unknown);
 const canUseThisTab=control.supported&&control.state==='sin-control'&&databaseState==='ready'&&!['pending','acquiring'].includes(control.transferState);
 const canPlayHere=owner?!busy&&!collectionBlocked()&&!!player.entries.length:canUseThisTab;
 const transferText={idle:'',acquiring:'Preparando el control en esta pestaña…',pending:'Esperando a que la otra pestaña guarde la cola y ceda el control.',acquired:'El control está en esta pestaña.',refused:'La otra pestaña tiene una operación pendiente. Termínala y vuelve a pulsar Usar en esta pestaña.',cancelled:'Solicitud cancelada. No se iniciará música aquí.',unsupported:'No se pudo avisar a la otra pestaña. Cede allí el control y comprueba aquí.',failed:'No se pudo transferir el control. Reintenta sin cerrar las operaciones pendientes.'}[control.transferState];
 const duration=Number.isFinite(audio.duration)?audio.duration:0;
 // The queue has no clock-dependent content; keep its element stable between progress frames.
 const playerQueue=<div className="player-queue">{queueInsertions.pendingCount>0&&<div><p role="status">{queueInsertions.pendingCount} adiciones pendientes; la reproducción sigue disponible.</p><button onClick={()=>queueInsertions.cancelAll('user')}>Detener adiciones pendientes</button></div>}{queueInsertionUncertain&&<p role="alert">No se ha confirmado el cierre de algunos recursos. Espera antes de iniciar otra operación; conserva tus archivos originales.</p>}<button disabled={!owner||busy||copyRemovalBlocked()||queueInsertionUncertain||!player.entries.length} onClick={()=>{if(replacementCurrent())void clearQueue();}}>Vaciar cola</button><ol>{player.entries.map((e,i)=><li key={e.id}><button aria-current={i===player.index?'true':undefined} disabled={!owner||busy||collectionBlocked()} onClick={()=>{if(playCurrent()&&owner&&!busy&&!collectionBlocked()){cancelSelectedSongIntent();player.select(i,true);}}}>{e.title}</button><button aria-label={`Subir en cola ${e.title}`} disabled={!owner||busy||collectionBlocked()||i===0} onClick={()=>{if(playCurrent()&&!collectionBlocked())player.moveEntry(e.id,-1);}}>Subir</button><button aria-label={`Bajar en cola ${e.title}`} disabled={!owner||busy||collectionBlocked()||i===player.entries.length-1} onClick={()=>{if(playCurrent()&&!collectionBlocked())player.moveEntry(e.id,1);}}>Bajar</button><button aria-label={`Quitar de cola ${e.title}`} disabled={!owner||busy||collectionBlocked()||i===player.index} onClick={()=>{if(playCurrent()&&!collectionBlocked())player.removeFuture(e.id);}}>Quitar</button></li>)}</ol></div>;
 if(!account.user)return <AccountRequired/>;
 return <main className="pulso-app" inert={setupReadyFor!==account.user.id} aria-hidden={setupReadyFor!==account.user.id?true:undefined} data-setup-pending={setupReadyFor!==account.user.id?'true':undefined} data-player-open={playerOpen?'true':undefined}><MobileInstallNotice/><header className="pulso-header"><p className="pulso-wordmark" aria-label="Pulso Web">pulso</p><h1 className="pulso-visually-hidden">Tu música, en este navegador</h1><nav className="shell-nav" aria-label="Principal">{(['inicio','buscar','biblioteca']as const).map(p=><button key={p} aria-current={page===p?'page':undefined} onClick={()=>{if(p==='biblioteca'){setLibraryDetail(false);setViews(old=>({...old,biblioteca:emptyShellView()}));}navigate(p);}}><svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{p==='inicio'?<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>:p==='buscar'?<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>:<><path d="M4 4v16M9 4v16M14 5l5-1 2 15-5 1z"/></>}</svg><span>{p==='inicio'?'Inicio':p==='buscar'?'Buscar':'Biblioteca'}</span></button>)}</nav><button className="desktop-search-link" type="button" onClick={()=>{const current=navigate('buscar');requestAnimationFrame(()=>{if(current())musicSearchTarget?.querySelector<HTMLInputElement>('input[type=search]')?.focus();});}}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span>¿Qué quieres escuchar?</span></button><AccountAccess/><button ref={settingsOpener} type="button" aria-expanded={settingsOpen} onClick={()=>{setSettingsSection('general');setSettingsOpen(true);requestAnimationFrame(()=>{settingsHeading.current?.focus();settingsHeading.current?.scrollIntoView({block:'start'});});}}>Configuración</button></header><aside className="desktop-library" aria-label="Accesos a tu biblioteca"><p>Tu biblioteca</p><button type="button" onClick={()=>{setViews(old=>({...old,biblioteca:{...emptyShellView(),favorites:true}}));setLibraryDetail(true);navigate('biblioteca');}}><span className="desktop-library__cover"><CollectionCover favorite trackIds={[]}/></span><span><strong>Favoritos</strong><small>Playlist automática</small></span></button>{homeLists.map(list=><button type="button" key={list.id} onClick={()=>{setViews(old=>({...old,biblioteca:{...emptyShellView(),listId:list.id}}));setLibraryDetail(true);navigate('biblioteca');}}><span className="desktop-library__cover"><CollectionCover trackIds={list.entries.map(entry=>entry.trackId)} enabled={!settingsOpen}/></span><span><strong>{list.name}</strong><small>{list.entries.length} canciones</small></span></button>)}</aside>{updateReady&&<p role="status">Hay una versión nueva preparada. Se actualizará automáticamente al terminar de escuchar y guardar los cambios.</p>}
<AlbumDownloadNotice/>

 <div ref={setMusicSearchTarget} hidden={page!=='buscar'||settingsOpen} aria-label="Buscador musical"/>


 {databaseState!=='ready'&&<section aria-label="Estado de la base local"><h2>{databaseRecoverable()?'Apertura pendiente de revisión':'Es necesario volver a abrir Pulso'}</h2><p role="alert">{databaseState==='connection-closed'?'Se interrumpió el acceso al almacenamiento local. Reintenta la apertura antes de continuar.':databaseState==='blocked'?'Otra entrada de Pulso mantiene la base local ocupada. Ciérrala y reintenta la apertura.':databaseState==='version-incompatible'?'Esta versión de Pulso no admite la versión de la base local. Abre una versión actualizada para continuar.':'La base local cambió de versión. El acceso queda detenido hasta volver a abrir la aplicación.'}</p>{databaseRecoverable()?<button disabled={!owner||busy} onClick={()=>void admitted('refresh-library',checkFiles)}>Reintentar apertura</button>:<><button disabled={control.activity.count>0||activeDatabaseWorkerAttempts()>0} onClick={()=>{if(control.activity.count===0&&activeDatabaseWorkerAttempts()===0)location.assign('/open.html');}}>Abrir versión actual</button>{(control.activity.count>0||activeDatabaseWorkerAttempts()>0)&&<p>Espera a que termine la operación pendiente antes de volver a abrir.</p>}</>}</section>}
 {!owner&&databaseState==='ready'&&<section aria-label="Control de esta pestaña disponible"><p>Otra pestaña controla la reproducción. Puedes usar Pulso aquí sin iniciar música.</p><button disabled={!canUseThisTab} onClick={()=>{if(playCurrent())void useThisTab();}}>Usar en esta pestaña</button>{transferText&&<p role="status">{transferText}</p>}</section>}
 <section hidden={!settingsOpen} className="settings-view" aria-label="Configuración" aria-labelledby="settings-heading">
  <h2 id="settings-heading" ref={settingsHeading} tabIndex={-1}>Configuración</h2>
  <button type="button" onClick={()=>{setSettingsOpen(false);requestAnimationFrame(()=>settingsOpener.current?.focus());}}>Cerrar configuración</button>
<p className="settings-intro">Tu cuenta, tu música y este navegador.</p><nav className="settings-navigation" aria-label="Secciones de configuración">{([['general','General'],['connections','Conexiones'],['tools','Herramientas']] as const).map(([id,label])=><button key={id} aria-current={settingsSection===id?'page':undefined} onClick={()=>setSettingsSection(id)}>{label}</button>)}</nav><div hidden={settingsSection!=='general'} className="settings-general">
<StorageSettings key={settingsOpen?'open':'closed'} summary={storageSummary} groups={groupStorageDownloads(tracks,playlists,storedAssets)} onRemove={openDownloadRemoval} items={downloads.map(({asset,aliases})=>{const track=aliases[0],inUse=protectedAssetIds.has(asset.id)||aliases.some(t=>pendingTrackIds.has(t.id));return {id:asset.id,title:track?.title??'Archivo sin ficha',artist:track?.artist??'Artista desconocido',bytes:asset.bytes,protected:inUse,removable:!!track&&removalEligibleTracks.has(track.id),action:<button disabled={!canOrganize||!track||inUse||!removalEligibleTracks.has(track.id)} onClick={event=>{if(track)openRemoval(track,event.currentTarget);}} aria-label={`Quitar descarga de ${track?.title??'archivo sin ficha'}`}>Quitar descarga</button>};})} cacheCopies={listeningCache.copies} canClean={canOrganize} onClean={button=>openCollection({kind:'cache',scope:'global-listening-cache'},'Caché de escucha',button)} canCheck={owner&&!busy&&!botImportActive} onCheck={()=>void admitted('refresh-library',checkFiles)}/>
{settingsOpen&&settingsSection==='general'&&<SpotifyPlaylistExport/>}
<section className="settings-group settings-appearance"><h3>Apariencia</h3><label>Apariencia<select disabled={!canOrganize} value={theme} onChange={e=>{const next=e.target.value;void viewAct(async()=>{await writeRecord('settings','theme',next);if(!control.owner)return;setTheme(next);document.documentElement.dataset.theme=next;});}}><option value="system">Sistema</option><option value="light">Clara</option><option value="dark">Oscura</option></select></label></section><section className="settings-group settings-app-update" aria-labelledby="app-update-heading"><h3 id="app-update-heading">Actualización de la app</h3><div className="settings-group__body"><p role="status">{manualReloadPending?'Esperando a que terminen las operaciones para recargar…':updateState==='checking'?'Comprobando versión…':updateState==='current'?'Actualizada':updateState==='available'?'Nueva versión disponible':'No se pudo comprobar si hay actualizaciones.'}</p><button type="button" disabled={manualReloadPending||updateNavigationLocked} onClick={()=>{player.pause();automaticUpdates?.reload();}}>Recargar app</button><p>Recarga Pulso y conserva tus datos. Si hay música sonando, se pausará.</p></div></section><section className="settings-group" aria-label="Sincronización de biblioteca"><h3>Biblioteca de tu cuenta</h3><div className="settings-group__body"><p role="status">{librarySyncMessage[librarySyncState]}</p><p>Playlists, favoritos, álbumes y artistas se conservan con tu cuenta. La música se descarga por separado en cada dispositivo.</p><button type="button" disabled={!owner||busy||librarySyncState==='syncing'} onClick={()=>void librarySync.sync()}>Sincronizar biblioteca</button></div></section></div><div className="settings-groups">
<section hidden={settingsSection!=='connections'} className="settings-group"><h3>Cuenta y fuentes</h3><div className="settings-group__body"><section aria-label="Música de Telegram"><details className="settings-help"><summary>Cómo buscar y escuchar</summary><p>En Buscar puedes consultar sugerencias musicales y las opciones del bot que elijas. Conecta tu cuenta de Telegram y configura tus bots para consultarlos. Al elegir una canción se comprueba tu copia local; si falta, se obtiene del bot para descargarla y escucharla. Límite por canción: {formatStorageMB(AUDIO_FILE_MAX_BYTES)}.</p></details><p role="status">{status}</p></section>
 <TelegramPanel requiredSetup onSetupReady={onSetupReady} accountId={account.user?.id} activity={control.activity} canConnect={telegramBlocked===null} blockedReason={telegramBlocked} libraryPending={telegramLibraryPending} onCheckControl={canUseThisTab?()=>{if(!playCurrent())return;transferPlayIntent=null;void control.acquire();}:undefined} onRequestControl={canUseThisTab?()=>{if(playCurrent())void useThisTab();}:undefined} scopeKey={`${accountEpoch}:${scopeId}:${control.proof}:${databaseGeneration}`} captureCurrent={captureTelegramCurrent} captureLifetime={captureTelegramLifetime} captureSongPlayback={captureSongPlayback} captureSongDownload={captureSongDownload} songCaptureBlockedReason={songCaptureBlockedReason} captureSongCopyInspection={captureSongCopyInspection} searchTarget={musicSearchTarget} searchVisible={page==='buscar'&&!settingsOpen} localTracks={tracks} libraryTrackIds={addedTrackIds} songPlaylists={playlists} playerTrackId={player.current?.trackId??null} playerPlaying={owner&&player.state==='playing'} captureSongManagement={captureSongManagement} captureDownloadSave={captureBotAudioSave}/></div></section>
<section hidden={settingsSection!=='tools'} className="settings-group"><h3>Reproducción y pestañas</h3><div className="settings-group__body"><section aria-label="Control de esta pestaña"><h2>Control de reproducción</h2><p role="status">{owner?'Activa en esta pestaña':control.state==='adquiriendo'?'Preparando control…':'Control en otra pestaña'}</p>{transferText&&<p role="status">{transferText}</p>}{owner?<><button onClick={()=>{if(!playCurrent())return;transferPlayIntent=null;void cede();}}>Ceder control</button>{control.requests.length>0&&<div><p>{control.requests.length} pestañas solicitan el control.</p><button onClick={()=>{if(playCurrent())control.retain();}}>Conservar control</button></div>}<p>{control.activity.count} operaciones activas. La cesión espera a que las operaciones estén resueltas.</p></>:<><button disabled={!canUseThisTab} onClick={()=>{if(playCurrent())void useThisTab();}}>Usar en esta pestaña</button>{['pending','acquiring'].includes(control.transferState)&&<button onClick={()=>{if(playCurrent())cancelTabTransfer();}}>Cancelar solicitud de control</button>}<button disabled={!control.supported||control.state!=='sin-control'||control.transferState==='pending'} onClick={()=>{if(!playCurrent())return;transferPlayIntent=null;void control.acquire();}}>Comprobar disponible</button><p>Puedes mantener varias pestañas abiertas. Al usar esta, la anterior guarda la cola y se detiene antes de ceder. Cambiar de pestaña no inicia música. Si hay operaciones pendientes o una versión anterior, cede el control allí o cierra esa entrada.{!control.messaging?' Los avisos entre pestañas no están disponibles; cede manualmente en la otra pestaña.':''}</p></>}</section></div></section></div></section>
 {unverifiedImportResponses.size>0&&<section aria-label="Respuestas de copias pendientes"><h2>Hay respuestas sin confirmar</h2><p>No se pudo confirmar el resultado de una operación. Conservamos los datos y pausamos las descargas y los cambios de organización. Revisaremos los registros locales sin repetir descargas ni borrar archivos.</p><button disabled={!owner||busy} onClick={()=>void admitted('refresh-library',checkFiles)}>Revisar respuestas pendientes</button></section>}
 {importRecoveryPending()&&<section aria-label="Recuperación de copias"><h2>Hay copias pendientes de confirmar</h2><p>Las nuevas descargas están en pausa. Puedes verificar una copia interrumpida o descartar únicamente su parcial; las canciones ya conservadas no se borran.</p><ul>{operations.filter(job=>!terminal(job)).map(job=><li key={job.operationId}><p>{job.state==='uncertain'||job.state==='publishing'?'Resultado por confirmar':job.state==='cleanup'?'Parcial pendiente':'Copia interrumpida'} · {formatStorageProgress(job.bytes,job.expectedBytes)} copiados</p><button disabled={!owner||busy||copyRemovalPending||databaseState!=='ready'||!job.asset||!job.track} onClick={()=>void viewRecover(job,'resume')}>Verificar y recuperar copia</button><button disabled={!owner||busy||copyRemovalPending||databaseState!=='ready'} onClick={()=>setDiscardId(job.operationId)}>Descartar copia incompleta</button>{discardId===job.operationId&&<div><p>Se comprobará que esta copia no esté publicada ni en uso antes de descartar su parcial. La biblioteca y los archivos conservados permanecen.</p><button disabled={!owner||busy||copyRemovalPending||databaseState!=='ready'} onClick={()=>{setDiscardId(null);void viewRecover(job,'discard');}}>Confirmar descarte del parcial</button><button onClick={()=>setDiscardId(null)}>Conservar copia</button></div>}</li>)}</ul>{importProblems.filter(issue=>!issue.retained).map((issue,i)=><div key={i}><p>{issue.kind==='legacy'?'Registro de importación anterior sin propiedad verificable.':'Registro de importación inválido o sin propiedad verificable.'} Conservaremos sus archivos; no se puede autorizar su limpieza ni dar la copia por completa.</p><button disabled={!owner||busy||copyRemovalPending||databaseState!=='ready'} onClick={()=>void viewRetain(issue)}>Conservar esos archivos y continuar</button></div>)}</section>}
 <div hidden={page!=='inicio'||settingsOpen}><HomeView visible={page==='inicio'&&!settingsOpen} continueSelection={player.current?{trackId:player.current.trackId,title:player.current.title,artist:trackIndex.get(player.current.trackId)?.artist??'Artista desconocido',stateText:!owner?'Sin control en esta pestaña':player.state+(player.error?` · ${player.error}`:''),positionSeconds:audio.currentTime,canPlay:canPlayHere,playing:owner&&player.state==='playing'}:null} recent={recent.map(t=>({id:t.id,title:t.title,artist:t.artist??'Artista desconocido',availability:availabilityText(trackAvailability(t,availability)),canPrepare:owner&&!busy&&!copyRemovalBlocked()&&sourceReview.canPrepare()&&databaseState==='ready'&&trackAvailability(t,availability)==='available'}))} playlists={homeLists.map(l=>({id:l.id,name:l.name,count:l.entries.length,trackIds:l.entries.map(entry=>entry.trackId)}))} empty={!tracks.length}  canCreate={canOrganize} onOpenPlayer={openPlayer} onPlay={play} onOpenFavorites={()=>{setViews(old=>({...old,biblioteca:{...emptyShellView(),favorites:true}}));setLibraryDetail(true);navigate('biblioteca');}} onOpenLibrary={()=>{setLibraryDetail(false);navigate('biblioteca');}} onOpenPlaylist={id=>{setLibraryDetail(true);setViews(old=>({...old,biblioteca:{...emptyShellView(),listId:id}}));navigate('biblioteca');}} onPrepareTrack={id=>void viewQueue([id])} onOpenSearch={()=>navigate('buscar')} onCreatePlaylist={()=>{setLibraryDetail(false);setLibraryTab('playlists');const current=navigate('biblioteca');requestAnimationFrame(()=>{if(current()){createInput.current?.closest('details')?.setAttribute('open','');createInput.current?.focus();}});}}/></div>
 <section hidden={page!=='biblioteca'||settingsOpen} aria-label="Colección" className="library-view"><h2 ref={routeHeading} tabIndex={-1}>Biblioteca</h2>
 <div hidden={libraryDetail} className="library-overview"><div className="library-tabs" aria-label="Tipos de colección">{(['playlists','albums','artists'] as const).map(tab=><button key={tab} type="button" aria-pressed={libraryTab===tab} onClick={()=>setLibraryTab(old=>old===tab?null:tab)}>{tab==='playlists'?'Playlists':tab==='albums'?'Álbumes':'Artistas'}</button>)}</div>
 <div className="library-grid">{(libraryTab===null||libraryTab==='playlists')&&<><button className="collection-card" onClick={event=>{libraryOpener.current=event.currentTarget;setViews(old=>({...old,biblioteca:{...emptyShellView(),favorites:true}}));setLibraryDetail(true);}}><span className="collection-card__art favorite-art"><CollectionCover favorite trackIds={[]}/></span><strong>Favoritos</strong><span>Playlist automática · {tracks.filter(t=>t.favorite).length} canciones</span></button>{playlists.map(list=><button className="collection-card" key={list.id} onClick={event=>{libraryOpener.current=event.currentTarget;setViews(old=>({...old,biblioteca:{...emptyShellView(),listId:list.id}}));setLibraryDetail(true);}}><span className="collection-card__art"><CollectionCover trackIds={list.entries.map(entry=>entry.trackId)} enabled={page==='biblioteca'&&!settingsOpen&&!libraryDetail}/></span><strong>{list.name}</strong><span>Playlist · {list.entries.length} canciones</span></button>)}</>}
 {(['albums','artists'] as const).filter(kind=>libraryTab===null||libraryTab===kind).flatMap(kind=>(kind==='albums'?groupAlbums(libraryTracks):groupArtists(libraryTracks)).map(group=><button className="collection-card" key={kind+group.key} onClick={event=>{libraryOpener.current=event.currentTarget;setViews(old=>({...old,biblioteca:{...emptyShellView(),groupMode:kind,groupKey:group.key}}));setLibraryDetail(true);}}><span className={`collection-card__art${kind==='artists'?' collection-card__art--artist':''}`}><CollectionCover trackIds={group.trackIds} enabled={page==='biblioteca'&&!settingsOpen&&!libraryDetail}/></span><strong>{group.label}</strong><span>{kind==='albums'?'Álbum':'Artista'} · {group.trackIds.length} canciones</span></button>))}</div>
 {libraryTab&&libraryTab!=='playlists'&&!(libraryTab==='albums'?groupAlbums(libraryTracks):groupArtists(libraryTracks)).length&&<p>Aún no hay {libraryTab==='albums'?'álbumes':'artistas'} en tu biblioteca.</p>}
 </div><div hidden={!libraryDetail} className="library-detail"><BackButton className="collection-back" onClick={()=>{const current=shellResponse(),opener=libraryOpener.current;setLibraryDetail(false);setViews(old=>({...old,biblioteca:emptyShellView()}));requestAnimationFrame(()=>{if(current()&&opener?.isConnected)opener.focus({preventScroll:true});});}}>Volver a Biblioteca</BackButton><CollectionHeader title={selected?.name??(favorites?'Favoritos':activeGroup?.label??'Colección')} kind={selected?'Playlist personal':favorites?'Playlist automática':activeGroup?.kind==='album'?'Álbum':'Colección'} count={visible.length} duration={visible.length&&visible.every(({track})=>Number.isFinite(track.duration)&&track.duration>0)?visible.reduce((sum,{track})=>sum+track.duration,0):null}
  artwork={<CollectionCover trackIds={visible.map(({track})=>track.id)} favorite={!selected&&favorites} enabled={page==='biblioteca'&&!settingsOpen&&libraryDetail}/>}
  playing={owner&&collectionQueueMatches&&player.state==='playing'} canPlay={owner&&!busy&&databaseState==='ready'&&!copyRemovalBlocked()&&sourceReview.canPrepare()&&!!visible.length} busy={busy} onPlay={()=>void playCollection()}
  shuffle={collectionQueueMatches&&!!player.shuffleOrder} canShuffle={owner&&!busy&&!collectionBlocked()&&collectionQueueMatches&&!!player.current} onShuffle={()=>{if(playCurrent()&&owner&&!busy&&!collectionBlocked())player.setShuffle(!player.shuffleOrder);}}/>
 {selected&&<button type="button" disabled={!canOrganize} onClick={event=>openCollection({kind:'playlist',id:selected.id,revision:selected.revision},selected.name,event.currentTarget)}>Eliminar playlist</button>}
 {activeGroup?.kind==='album'&&!activeGroup.unknown&&groupAlbums(libraryTracks).some(group=>group.key===activeGroup.key&&!group.unknown)&&<button type="button" disabled={!canOrganize} onClick={event=>openCollection({kind:'album',scope:'global-library',key:activeGroup.key},activeGroup.label,event.currentTarget)}>Retirar álbum</button>}
 <button type="button" disabled={!canOrganize||!visible.length} onClick={()=>requestLibraryDownload(visible.map(({track})=>track.id),selected?.name??activeGroup?.label??'Mi biblioteca')}>Descargar esta selección en este dispositivo</button>
 <details className="collection-tools"><summary><span aria-hidden="true">⋯</span><span>{selected?'Opciones de playlist':'Opciones de colección'}</span></summary><div className="collection-tools__content"><details><summary>Filtros de canciones</summary><label>Buscar por título, artista o álbum<input value={query} onChange={e=>setQuery(e.target.value)} type="search"/></label>
 <div hidden={page==='buscar'}><label>Solo favoritos<input type="checkbox" checked={favorites} onChange={e=>updateView({favorites:e.target.checked})}/></label><label>Solo copias presentes<input type="checkbox" checked={present} onChange={e=>updateView({present:e.target.checked})}/></label>
 <label>Vista<select aria-label="Vista" value={listId} onChange={e=>{setListId(e.target.value);}}><option value="">Todas las canciones</option>{playlists.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
 <label>Agrupar por<select aria-label="Agrupación de biblioteca" value={groupMode} onChange={e=>{setGroupMode(e.target.value as 'tracks'|'artists'|'albums');setGroupKey('');}}><option value="tracks">Canciones</option><option value="artists">Artistas</option><option value="albums">Álbumes</option></select></label>
 {groupMode!=='tracks'&&<div><label>{groupMode==='artists'?'Artista':'Álbum'}<select aria-label={groupMode==='artists'?'Grupo de artista':'Grupo de álbum'} value={activeGroup?.key??''} onChange={e=>setGroupKey(e.target.value)}><option value="">Todas las agrupaciones</option>{groups.map(group=><option key={group.key} value={group.key}>{group.label}{group.kind==='album'&&group.artist?` · ${group.artist}`:''} · {group.trackIds.length} pistas</option>)}</select></label><p>Agrupaciones locales por datos conservados y etiquetas del archivo. La identidad externa y la completitud de los álbumes no están verificadas.</p>{activeGroup&&<p>{activeGroup.unknown?'Sin metadatos suficientes para identificar esta agrupación.':`Datos: ${activeGroup.provenance.map(source=>source==='manual'?'correcciones manuales':'etiquetas del archivo').join(' y ')||'desconocidos'}.`} {activeGroup.kind==='album'?'Completitud desconocida.':''}</p>}{activeGroup?.kind==='album'&&!activeGroup.unknown&&<p>{activeGroup.criterion==='albumArtist'?'Agrupación por artista del álbum declarado en el archivo.':'Agrupación por el artista disponible en la biblioteca.'} Orden por disco y número de pista declarados; los números desconocidos quedan al final.</p>}</div>}
 </details>
 <p>{visible.length} canciones · {libraryTracks.length} en biblioteca</p><div className="controls"><button disabled={!canAppend||!visible.length} onClick={event=>addSelection(visible,'next',event)}>Añadir selección a continuación ({visible.length})</button><button disabled={!canAppend||!visible.length} onClick={event=>addSelection(visible,'end',event)}>Añadir selección al final ({visible.length})</button></div><p>Estas acciones añaden toda la selección filtrada, incluidas las otras páginas.</p><button disabled={!owner||busy||databaseState!=='ready'||(copyRemovalBlocked()||!sourceReview.canPrepare())||!visible.length} onClick={()=>void viewQueue(visible.map(({track})=>track.id))}>Preparar cola de esta selección</button>
 {page!=='buscar'&&selected&&<details><summary>Editar playlist</summary><form onSubmit={e=>{e.preventDefault();const value=new FormData(e.currentTarget).get('name');void viewAct(current=>changePlaylist(selected.id,selected.revision,{type:'rename',name:String(value)},current));}}><label>Nombre de playlist<input name="name" defaultValue={selected.name} key={selected.id+selected.revision} required maxLength={100}/></label><button disabled={!canOrganize}>Renombrar</button></form></details>}
 {page!=='buscar'&&selected&&filteredPlaylist&&<p>Para reordenar la playlist completa, quita los filtros de búsqueda, favoritos, copias y agrupación.</p>}
 </div></details>
 {!visible.length&&<div className="collection-empty"><p>Esta colección todavía no tiene canciones.</p><button type="button" onClick={()=>navigate('buscar')}>Buscar canciones</button></div>}
 {pagination.pages>1&&<LibraryPagination {...pagination}/>}<ol className="tracks" start={pagination.start+1}>{pageRows.map(({track,key,playlistIndex})=>{const info=albumMetadata.get(track.id)!;return <li key={key}><CatalogArtwork key={control.proof+track.id} trackId={track.id} className="collection-track-art" enabled={page==='biblioteca'&&!settingsOpen&&libraryDetail}/><button className="collection-track-main" aria-label={`Escuchar ${track.title}`} aria-current={player.current?.trackId===track.id?'true':undefined} disabled={!owner||busy||databaseState!=='ready'||copyRemovalBlocked()||!sourceReview.canPrepare()} onClick={()=>{if(trackAvailability(track,availability)==='available')void playCollection(key);else requestLibraryDownload([track.id],track.title,true);}}><strong>{track.title}</strong><span>{track.artist??'Artista desconocido'}</span>{owner&&player.state==='playing'&&player.current?.trackId===track.id&&<PlaybackIndicator/>}</button>{((collectionPreparing?.view===collectionPlaybackViewKey&&collectionPreparing.trackId===track.id)||(player.current?.trackId===track.id&&(player.state==='loading'||player.state==='buffering')))&&<span className="collection-track-loading" role="status"><span>Preparando canción…</span><progress aria-label={`Carga de ${track.title}`}/></span>}<TrackActionsMenu title={track.title} artist={track.artist??'Artista desconocido'} active={page==='biblioteca'&&!settingsOpen&&libraryDetail&&!playerOpen} artwork={<CatalogArtwork trackId={track.id} className="track-actions-art" enabled={page==='biblioteca'&&!settingsOpen&&libraryDetail}/>}>
 <button disabled={!canOrganize} aria-pressed={track.favorite} ref={button=>{if(button)favoriteButtons.current.set(key,button);else favoriteButtons.current.delete(key);}} onClick={event=>void toggleFavorite(track,key,event.currentTarget)}>{track.favorite?'Quitar favorito':'Favorito'}</button>
 <button disabled={!canAppend||track.assetId===null} aria-label={`Añadir a continuación ${track.title}`} onClick={event=>addSelection([{key,track}],'next',event)}>Reproducir a continuación</button>
 <button disabled={!canAppend||track.assetId===null} aria-label={`Añadir al final ${track.title}`} onClick={event=>addSelection([{key,track}],'end',event)}>Añadir al final de la cola</button>
 <details className="track-actions-playlist"><summary>Añadir a una playlist</summary><label>Playlist de destino<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Elige una playlist</option>{playlists.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button disabled={!canOrganize||!target||!!playlists.find(p=>p.id===target)?.entries.some(e=>e.trackId===track.id)} onClick={()=>{const list=playlists.find(p=>p.id===target);if(list)void viewAct(current=>changePlaylist(list.id,list.revision,{type:'add',trackId:track.id},current));}}>Añadir a playlist</button></details>
 {page!=='buscar'&&selected&&<><details className="track-actions-order"><summary>Ordenar en esta playlist</summary>{([-1,1]as const).map(delta=><button key={delta} ref={button=>{const id=`${delta}:${key}`;if(button)moveButtons.current.set(id,button);else moveButtons.current.delete(id);}} disabled={!canOrganize||filteredPlaylist||!moveAdjacent(key,delta)} aria-disabled={delta===-1?playlistIndex===0:playlistIndex===selected.entries.length-1} aria-label={`${delta===-1?'Subir':'Bajar'} ${track.title}`} onClick={event=>void moveEntry(key,delta,event.currentTarget)}>{delta===-1?'Subir canción':'Bajar canción'}</button>)}</details><button disabled={!canOrganize} onClick={()=>void viewAct(current=>changePlaylist(selected.id,selected.revision,{type:'remove',entryId:key},current))}>Quitar de playlist</button></>}
 <button data-menu-dismiss="true" disabled={!canOrganize||!removalEligibleTracks.has(track.id)} aria-label={`Revisar retirada de ${track.title}`} onClick={event=>openRemoval(track,trackActionOpener(event.currentTarget))}>Gestionar copia local</button>
 <details className="track-actions-info"><summary>Información de la canción</summary><p>{track.album??'Álbum desconocido'} · {Math.floor(track.duration/60)}:{String(Math.floor(track.duration%60)).padStart(2,'0')}</p><p>{availabilityText(trackAvailability(track,availability))}</p><AlbumMetadataInfo track={info.track.state==='known'?info.track.value:null} disc={info.disc.state==='known'?info.disc.value:null} albumArtist={info.albumArtist.state==='known'?info.albumArtist.value:null} compilation={info.compilation.state==='known'?info.compilation.value:null}/><button data-menu-dismiss="true" disabled={!canOrganize} aria-label={`Revisar datos del archivo de ${track.title}`} onClick={event=>openRescan(track.id,trackActionOpener(event.currentTarget))}>Revisar datos del archivo</button></details>
 </TrackActionsMenu></li>;})}</ol>
 </div><details className="create-playlist" hidden={libraryDetail||libraryTab!==null&&libraryTab!=='playlists'}><summary>Crear una playlist</summary><form onSubmit={e=>{e.preventDefault();void viewAct(async current=>{const list=await createPlaylist(name,current);if(current()){setTarget(list.id);setName('');}});}}><label>Nueva playlist<input ref={createInput} value={name} onChange={e=>setName(e.target.value)} maxLength={100} required/></label><button disabled={!canOrganize}>Crear playlist</button></form></details></section>
 <DownloadRemovalDialog key={`downloads:${collectionKey}`} controller={downloadRemovalController} onClose={closeCollection}/>
 <CollectionRemovalController key={collectionKey} controller={collectionController} headingRef={collectionHeading} onVisible={()=>{}} onClose={closeCollection}/>
 <LocalCopyRemovalController key={`${removalKey}:${removalRecoveryEpoch}`} host={removalHost} startup={copyRemovalStartup?.key===removalKey?copyRemovalStartup.snapshot:null} request={removalRequest} canUse={owner&&databaseState==='ready'} headingRef={removalHeading} onOpen={openPendingRemoval} onVisible={focusRemoval} onClose={closeRemoval}/>
 <MetadataRescanController key={`metadata-rescan:${scopeId}:${control.proof}:${databaseGeneration}`} activity={control.activity} scopeKey={`${scopeId}:${control.proof}:${databaseGeneration}`} canUse={owner&&!botImportActive&&databaseState==='ready'&&!sourceReview.hasReservation()&&!queueForeignBlocked()} canStart={owner&&!busy&&!botImportActive&&databaseState==='ready'&&!importRecoveryPending()&&!copyRemovalPending&&!sourceReview.hasReservation()&&control.activity.idle} track={rescanTrackId?trackIndex.get(rescanTrackId)??null:null} headingRef={rescanHeading} captureCurrent={captureRescanCurrent} captureAdmission={captureForeignMutationCurrent} onBlocking={setMetadataRescanBlocking} onCommitted={()=>refresh(true,false,null)} onClose={closeRescan}/>
 <div hidden={!settingsOpen||settingsSection!=='tools'} className="settings-secondary"><details className="settings-group"><summary><strong>Verificar playlists</strong><span>Revisar las copias de una selección</span></summary><div className="settings-group__body"><LocalBatchPanel key={`local-batch:${control.proof}`} activity={control.activity} beginDiagnostic={beginPanelDiagnostic} playlist={selected??null} canStart={canOrganize} captureWriteCurrent={captureForeignMutationCurrent} onStatus={text=>{status=text;emit();}}/></div></details></div>
 <PlaybackProgress subscribe={player.subscribe} enabled={playerOpen}>{()=> <PlayerSurface open={playerOpen} onClose={closePlayer}>
  <NowPlayingView open={playerOpen} headingRef={playerHeading} title={player.current?.title??'Sin selección'}
   artist={playerDisplayArtist??'Artista desconocido'} album={currentTrack?.album}
   artwork={currentTrack?<PlayerArtwork activity={control.activity} trackId={currentTrack.id} title={currentTrack.title} artist={playerDisplayArtist} album={currentTrack.album} durationSeconds={currentTrack.duration} scopeKey={`${scopeId}:${control.proof}:${databaseGeneration}`} enabled={owner} current={()=>owner&&playerReadScope()&&player.current?.trackId===currentTrack.id} onArtwork={(image,previousUrl)=>updateMediaSessionArtwork(currentTrack.id,image,previousUrl)} refreshToken={artworkRefreshToken}/>:<div className="artwork-placeholder" aria-hidden="true">♪</div>}
   lyricsPreview={<PlayerLyricsPreview result={playerLyrics.result} timeSeconds={audio.currentTime} loading={playerLyrics.loading} canSeek={owner&&!busy&&!collectionBlocked()&&duration>0} durationSeconds={duration} onSeek={seconds=>{if(playerLifetime()&&playCurrent()&&owner&&!busy&&!collectionBlocked()){cancelSelectedSongIntent();void player.play(seconds);}}}/>}
   lyrics={<><PlayerLyricsReader result={playerLyrics.result} loading={playerLyrics.loading} error={playerLyrics.error} timeSeconds={audio.currentTime} canSeek={owner&&!busy&&!collectionBlocked()&&duration>0} durationSeconds={duration} onRetry={playerLyrics.reload} onSeek={seconds=>{if(playerLifetime()&&playCurrent()&&owner&&!busy&&!collectionBlocked()){cancelSelectedSongIntent();void player.play(seconds);}}}/>
    {player.current&&<details className="player-lyrics-options"><summary>Opciones de letras</summary><LyricsPanel activity={control.activity} key={`lyrics:${control.proof}:${player.current.trackId}`} trackId={player.current.trackId} title={player.current.title} timeSeconds={audio.currentTime} canEdit={canOrganize} captureWriteCurrent={captureLyricsWriteCurrent} onStatus={text=>{status=text;emit();if(text==='Letras guardadas.'||text==='Elección «Sin letras» guardada por ti.'||text==='Elección «Sin letras» guardada.')playerLyrics.reload();}}/></details>}
   </>}
   queue={playerQueue}
   status={player.error||(player.state==='loading'?'Preparando audio…':player.state==='buffering'?'Esperando audio…':!owner?'El control está en otra pestaña.':null)}
   playing={owner&&player.state==='playing'} favorite={currentTrack?.favorite??false} shuffle={!!player.shuffleOrder} repeat={player.repeat} position={audio.currentTime} duration={duration}
   canPlay={canPlayHere} canPause={owner&&!busy&&!!player.current} canPrevious={owner&&!busy&&!collectionBlocked()&&!!player.current} canNext={owner&&!busy&&!collectionBlocked()&&player.following()>=0} canSeek={owner&&!busy&&!collectionBlocked()&&duration>0} canOrganize={canOrganize&&!!player.current}
   onPlay={play} onPause={pause} onPrevious={()=>{if(playCurrent()&&owner&&!busy&&!collectionBlocked()){cancelSelectedSongIntent();player.previous();}}} onNext={()=>{if(playCurrent()&&owner&&!busy&&!collectionBlocked()){cancelSelectedSongIntent();player.next();}}}
   onSeek={value=>{if(playCurrent()&&owner&&!busy&&!collectionBlocked()){cancelSelectedSongIntent();player.seek(value);}}} onShuffle={()=>{if(playCurrent()&&owner&&!busy&&!collectionBlocked())player.setShuffle(!player.shuffleOrder);}} onRepeat={()=>{if(playCurrent()&&owner&&!busy&&!collectionBlocked())player.setRepeat(player.repeat==='off'?'all':player.repeat==='all'?'one':'off');}}
   trackId={currentTrack?.id??null} current={playerActionCurrent}
   favoritePending={playerOrganizationFlight.current}
   favoriteStatus={playerOrganization&&playerOrganization.entryId===currentEntryId?playerOrganization.message:null}
   onFavorite={()=>void favoritePlayer()}/>
 </PlayerSurface>}</PlaybackProgress>
 <div hidden={!settingsOpen||settingsSection!=='tools'} className="settings-secondary"><details className="settings-group"><summary><strong>Archivos locales</strong><span>Verificar y exportar copias</span></summary><div className="settings-group__body"><LocalCopiesController key={`copies:${control.proof}`} activity={control.activity} canUse={owner&&!busy&&!copyRemovalBlocked()&&!queueForeignBlocked()} scopeKey={`${scopeId}:${control.proof}:${databaseState}`} captureCurrent={captureCopyCurrent} tracks={tracks} beginDiagnostic={beginCopyDiagnostic}/></div></details><details className="settings-group"><summary><strong>Organización y respaldo</strong><span>Importar o exportar tu biblioteca</span></summary><div className="settings-group__body">
 <OrganizationPanel key={`organization:${control.proof}`} activity={control.activity} beginDiagnostic={beginPanelDiagnostic} canWrite={canOrganize} captureWriteCurrent={captureLyricsWriteCurrent} onStatus={text=>{status=text;emit();}} onCommitted={(attempt?:PanelDiagnosticAttempt)=>refresh(true,false,(attempt&&panelDiagnosticHandles.get(attempt))??null,'refresh')}/>

 </div></details><details className="settings-group"><summary>Diagnóstico técnico</summary><DiagnosticsPanel session={diagnostics} capabilities={diagnosticCapabilities}/><p>La autorización de Telegram se conserva en este navegador hasta que cierres la sesión, la elimines o sea invalidada por Telegram o el navegador. Los códigos y las contraseñas no se guardan. Las copias locales ya existentes se conservan en este navegador; una limpieza del navegador puede eliminarlas. En el modo compatible para archivos pequeños, la reproducción admite hasta {formatStorageMB(AUDIO_FILE_MAX_BYTES)} por audio y {formatStorageMB(AUDIO_BLOB_TOTAL_MAX_BYTES)} por cola; las copias mayores pueden requerir otro transporte para reproducirse. Portadas locales PNG/JPEG/WebP de hasta {formatStorageMB(2*1024*1024)}; extracción incrustada de ID3v2.3/2.4 sencillo, M4A covr y WAV con ID3, con límites de recursos. Otros formatos conservan un estado de portada explícito.</p></details></div>
 <PlaybackProgress subscribe={player.subscribe}>{()=> <MiniPlayer title={player.current?.title??'Sin reproducción'} artist={player.current?(miniPlayerArtist(currentTrack,player.current.id,miniPlayerArtistHint?.entryId===player.current.id?miniPlayerArtistHint:storedArtistHint)??'Artista desconocido'):null} stateText={!owner?'Sin control en esta pestaña':player.state+(player.error?` · ${player.error}`:'')} playing={owner&&player.state==='playing'} canPlay={canPlayHere} canPause={owner&&!busy} onPlay={play} onPause={pause} onOpenPlayer={openPlayer} onPrevious={()=>{if(playCurrent()&&owner&&!busy&&!collectionBlocked()){cancelSelectedSongIntent();player.previous();}}} onNext={()=>{if(playCurrent()&&owner&&!busy&&!collectionBlocked()){cancelSelectedSongIntent();player.next();}}} canPrevious={owner&&!busy&&!collectionBlocked()} canNext={owner&&!busy&&!collectionBlocked()&&player.following()>=0} position={audio.currentTime} duration={duration} onSeek={value=>{if(playCurrent()&&owner&&!busy&&!collectionBlocked()){cancelSelectedSongIntent();player.seek(value);}}} volume={audio.volume} onVolume={value=>{if(playCurrent()){audio.volume=value;render();}}}/>}</PlaybackProgress></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);

// Versioned navigation bypasses the old shell without activating a worker over
// another tab's playing audio. All persistent data stays in the same origin.
automaticUpdates=startAutomaticUpdates({
 ready:manual=>{
  const focused=document.activeElement;
  return !updateNavigationLocked&&databaseState==='ready'&&!busy&&!configuring&&control.activity.idle&&!queueForeignBlocked()&&!botImportActive&&!sourceReview.hasReservation()&&!updateWorkPending()&&
   !['adquiriendo','cediendo'].includes(control.state)&&(!control.owner||!releaseBlocked())&&
   (manual||!['playing','loading','buffering'].includes(player.state)&&(audio.paused||audio.ended))&&
   !(focused instanceof Element&&focused.matches('input,textarea,select,[contenteditable="true"]'));
 },
 prepare:async manual=>{if(manual)player.pause();if(control.owner&&player.current)return await saveLatestQueue()==='saved';await writes;return true;},
 enter:()=>{
  const wasAdmitted=control.activity.admitted,scope=control.activity.scope(),proof=control.proof;
  updateNavigationLocked=true;if(wasAdmitted)control.activity.close();
  return()=>{updateNavigationLocked=false;if(wasAdmitted&&scope()&&proof===control.proof&&control.state==='con-control')control.activity.reopen();};
 },
 pending:value=>{if(updateReady!==value){updateReady=value;emit();}},
 state:value=>{if(updateState!==value){updateState=value;emit();}},
 manualPending:value=>{manualReloadPending=value;emit();},
});
