import {useLayoutEffect,useRef,useState} from 'react';
import type {Activity,ActivityToken} from '../playback/ownership';
import type {Track} from '../library/library';
import {subscribeDatabaseLifecycle} from '../storage/database';
import {AppFailure,fromKnownError,makeFailure,type FailureV1} from '../errors/app-failure';
import type {Phase} from '../diagnostics/contract';
import {readLocalCopyInventory,verifyLocalCopy,prepareIndividualAudioExport,requestLocalPersistenceFromGesture,readLocalStorageStatus,localCopyFailureReason,COPY_LIMITS,type InventoryPageV1,type InventoryCursor,type InventoryRowV1,type PreparedAudioExport,type PersistenceResult} from '../library/local-copy-inventory';
import {LocalCopiesPanel,type LocalCopiesPanelProps,type LocalCopyRowView} from './LocalCopiesPanel';

export type CopyPanelOperation='inspect-local-copies'|'verify-local-copy'|'export-audio'|'request-persistence';
export interface CopyPanelDiagnostic {complete(failure:FailureV1|null,phase:Phase,partial?:boolean):void;finish():void}
export interface LocalCopiesControllerProps {
 activity:Activity;canUse:boolean;scopeKey:string;tracks:readonly Track[];
 /** Capture a fresh owner/proof/Activity/database guard, before the first await. */
 captureCurrent:()=>()=>boolean;
 beginDiagnostic?:(operation:CopyPanelOperation,current:()=>boolean)=>CopyPanelDiagnostic|null;
}
interface Attempt {token:ActivityToken;controller:AbortController;current:()=>boolean;diagnostic:CopyPanelDiagnostic|null}
interface Prepared {resource:PreparedAudioExport;url:string;filename:string;current:()=>boolean}
export function audioExportFilename(title:string,mime:string):string {
 const extension=mime==='audio/mpeg'?'.mp3':mime==='audio/mp4'?'.m4a':mime==='audio/wav'?'.wav':'.audio';
 const base=title.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').replace(/^[. ]+|[. ]+$/g,'').slice(0,100).replace(/[\ud800-\udbff]$/,'').replace(/[. ]+$/g,'');
 return (base||'Audio propio')+extension;
}
const availabilityLabels={pending:'Pendiente de comprobar',present:'Archivo presente',missing:'Falta el archivo',corrupt:'Copia no válida',unknown:'Desconocida',changed:'Cambió desde la consulta'} as const;
const integrityLabels={'not-checked':'Sin verificar el contenido',verified:'SHA-256 y longitud verificados',invalid:'No superó la verificación',unknown:'No se pudo confirmar'} as const;
const classificationLabels={'current-kept':'Copia conservada', 'previous-kept':'Generación anterior conservada',staging:'Importación parcial',unclassified:'Archivo sin clasificar',invalid:'Registro inválido'} as const;

/** No automatic storage access on mount, navigation or playback ticks. */
export function LocalCopiesController(props:LocalCopiesControllerProps) {
 const mounted=useRef(false),allowed=useRef(props.canUse);allowed.current=props.canUse;
 const latest=useRef(props);latest.current=props;
 // A callback belongs to the render that exposed it; a later permission must
 // not revive a callback captured before queue preparation or ownership change.
 let admission:()=>boolean;
 try{admission=props.captureCurrent();}catch{admission=()=>false;}
 const active=useRef<Attempt|null>(null),prepared=useRef<Prepared|null>(null);
 const cursors=useRef<(InventoryCursor|undefined)[]>([undefined]),pageIndex=useRef(0);
 // The API's undefined cursor starts a new snapshot. Keep only its first page
 // so navigating back never accidentally requests a new inventory.
 const firstPage=useRef<InventoryPageV1|null>(null);
 const [page,setPage]=useState<InventoryPageV1|null>(null);
 const [inventoryState,setInventoryState]=useState<LocalCopiesPanelProps['inventoryState']>('idle');
 const [pending,setPending]=useState<CopyPanelOperation|null>(null),[message,setMessage]=useState('');
 const [exportView,setExportView]=useState<LocalCopiesPanelProps['exportView']>(null);
 const [progress,setProgress]=useState<LocalCopiesPanelProps['exportProgress']>(null);
 const [persistence,setPersistence]=useState<LocalCopiesPanelProps['persistenceState']>('idle');
 const [storage,setStorage]=useState<Awaited<ReturnType<typeof readLocalStorageStatus>>|null>(null);
 function releasePrepared(){const own=prepared.current;prepared.current=null;if(own){try{URL.revokeObjectURL(own.url);}finally{own.resource.release();}}if(mounted.current)setExportView(null);}
 function safeCurrent(check:()=>boolean){try{return check();}catch{return false;}}
 function invalidate(){active.current?.controller.abort();releasePrepared();firstPage.current=null;cursors.current=[undefined];pageIndex.current=0;if(mounted.current){setPage(null);setInventoryState('idle');setProgress(null);setMessage('Consulta de nuevo el inventario cuando tengas control y almacenamiento disponible.');}}
 useLayoutEffect(()=>{
  mounted.current=true;
  const unsubscribe=subscribeDatabaseLifecycle(invalidate);
  window.addEventListener('pagehide',invalidate);
  return()=>{mounted.current=false;active.current?.controller.abort();releasePrepared();unsubscribe();window.removeEventListener('pagehide',invalidate);};
 },[]);
 useLayoutEffect(()=>{if(!props.canUse||prepared.current&&!safeCurrent(prepared.current.current))invalidate();},[props.canUse,props.scopeKey]);
 function begin(kind:CopyPanelOperation):Attempt|null {
  if(!mounted.current||!allowed.current||active.current||!safeCurrent(admission))return null;
  const guard=latest.current.captureCurrent();if(!safeCurrent(guard))return null;
  const token=latest.current.activity.begin();if(!token)return null;
  const attempt:Attempt={token,controller:new AbortController(),current:()=>mounted.current&&active.current===attempt&&token.current()&&allowed.current&&safeCurrent(guard),diagnostic:null};
  active.current=attempt;
  try{attempt.diagnostic=latest.current.beginDiagnostic?.(kind,attempt.current)??null;}catch{/* Optional observer. */}
  setPending(kind);setProgress(null);setMessage('');return attempt;
 }
 function observe(attempt:Attempt,failure:FailureV1|null,phase:Phase,partial=false){try{attempt.diagnostic?.complete(failure,phase,partial);}catch{/* No feature authority. */}}
 // Logical ownership stays current while cancellation settles, so its diagnostic
 // can still report cancellation. Publishing data additionally requires admission
 // by the signal. A real failure already returned by the operation wins.
 function admitPublication(attempt:Attempt,phase:Phase,failure:FailureV1|null=null){if(attempt.controller.signal.aborted)throw AppFailure.create(failure??makeFailure(phase,'cancelled','cancelled','none'));}
 function finish(attempt:Attempt){try{attempt.diagnostic?.finish();}catch{/* No feature authority. */}finally{attempt.token.end();if(active.current===attempt){active.current=null;if(mounted.current){setPending(null);setProgress(null);}}}}
 function report(attempt:Attempt,error:unknown){if(!attempt.current())return;observe(attempt,fromKnownError(error,{phase:'read',backend:'none',cancelRequested:attempt.controller.signal.aborted}),'read');setMessage(localCopyFailureReason(error));}
 async function inventory(index:number,fresh=false){
  const attempt=begin('inspect-local-copies');if(!attempt)return;
  releasePrepared();setInventoryState('loading');
  if(fresh){firstPage.current=null;cursors.current=[undefined];pageIndex.current=0;setPage(null);}
  try{
   const cached=!fresh&&index===0?firstPage.current:null;
   if(!fresh&&!cached&&!cursors.current[index])throw AppFailure.create(makeFailure('read','integrity','asset-changed','none'));
   const [next,status]=await Promise.all([cached??readLocalCopyInventory({namespace:'local',signal:attempt.controller.signal,current:attempt.current,cursor:fresh?undefined:cursors.current[index]}),readLocalStorageStatus()]);
   if(!attempt.current())return;
   admitPublication(attempt,'read',status.failure);
   if(index===0)firstPage.current=next;
   pageIndex.current=index;if(next.nextCursor)cursors.current[index+1]=next.nextCursor;else cursors.current.length=index+1;
   setPage(next);setStorage(status);setInventoryState('ready');
   setMessage(next.partial?'Consulta parcial. Los datos desconocidos se conservan; no se ofrece retirada.':'Inventario consultado. Encontrar el archivo no confirma su integridad ni la disponibilidad offline.');
   observe(attempt,next.partial?makeFailure('read','internal','limit-exceeded','none'):status.failure,'read',next.partial);
  }catch(error){if(attempt.current())setInventoryState('error');report(attempt,error);}finally{finish(attempt);}
 }
 function title(row:InventoryRowV1){const titles=row.trackIds.slice(0,3).map(id=>latest.current.tracks.find(t=>t.id===id)?.title).filter((v):v is string=>!!v);return titles.length?titles.join(' · ')+(row.trackIds.length>3?' · …':''):classificationLabels[row.classification];}
 async function verify(id:string){
  const row=page?.rows.find(r=>r.rowId===id);if(!row?.copyRef)return;
  const attempt=begin('verify-local-copy');if(!attempt)return;
  try{const result=await verifyLocalCopy({copyRef:row.copyRef,signal:attempt.controller.signal,current:attempt.current});if(!attempt.current())return;
   admitPublication(attempt,'verify',result.failure);
   setPage(old=>old?{...old,rows:old.rows.map(r=>r.rowId===id?{...r,availability:result.availability,integrity:result.integrity,failure:result.failure}:r)}:old);
   if(firstPage.current)firstPage.current={...firstPage.current,rows:firstPage.current.rows.map(r=>r.rowId===id?{...r,availability:result.availability,integrity:result.integrity,failure:result.failure}:r)};
   setMessage(result.failure?failureMessage(result.failure):result.integrity==='verified'?'Copia verificada por SHA-256 y longitud.':'No se pudo confirmar esta copia. Conserva el original.');
   observe(attempt,result.failure,'verify');
  }catch(error){report(attempt,error);}finally{finish(attempt);}
 }
 function failureMessage(failure:FailureV1){return localCopyFailureReason(AppFailure.create(failure));}
 async function prepare(id:string){
  const row=page?.rows.find(r=>r.rowId===id);if(!row?.copyRef)return;
  const attempt=begin('export-audio');if(!attempt)return;releasePrepared();
  let resource:PreparedAudioExport|null=null,url:string|null=null;
  try{
   resource=await prepareIndividualAudioExport(row.copyRef,{signal:attempt.controller.signal,current:attempt.current,onProgress:value=>{if(attempt.current()&&!attempt.controller.signal.aborted)setProgress({read:value.phase==='compose'?value.total:value.bytes,total:value.total});}});
   if(!attempt.current())return;
   admitPublication(attempt,'verify');
   const guard=latest.current.captureCurrent(),filename=audioExportFilename(title(row),resource.mime);
   if(!safeCurrent(guard))return;
   url=URL.createObjectURL(resource.blob);
   if(!attempt.current()||!safeCurrent(guard))return;
   admitPublication(attempt,'verify');
   prepared.current={resource,url,filename,current:guard};setExportView({url,filename,bytes:resource.bytes});
   resource=null;url=null;setMessage('Archivo verificado y preparado. Pulsa el enlace para solicitar su descarga. Conserva el original.');observe(attempt,null,'verify');
  }catch(error){report(attempt,error);}finally{if(url)URL.revokeObjectURL(url);resource?.release();finish(attempt);}
 }
 function requestPersistence(){
  const attempt=begin('request-persistence');if(!attempt)return;setPersistence('requesting');
  // Native persist is invoked in this click stack, before any await or status read.
  const result=requestLocalPersistenceFromGesture();
  void result.then((value:PersistenceResult)=>{if(!attempt.current())return;if(attempt.controller.signal.aborted){setPersistence('unknown');setMessage('Seguimiento cancelado. El navegador puede completar la solicitud de persistencia; no se ha revertido.');observe(attempt,makeFailure('open','cancelled','cancelled','none'),'open');return;}setPersistence(value.state);setMessage(value.state==='granted'?'El navegador concedió persistencia; sigue siendo necesario conservar los originales.':value.state==='denied'?'El navegador no concedió persistencia. Tus archivos se conservan en su estado actual.':'No se pudo confirmar la persistencia del origen.');observe(attempt,value.failure??(value.state==='unknown'?makeFailure('open','internal','unknown','none'):value.state==='unsupported'?makeFailure('open','storage-unavailable','storage-unavailable','none'):null),'open');}).catch(error=>{if(attempt.current())setPersistence('unknown');report(attempt,error);}).finally(()=>{if(mounted.current&&active.current===attempt)setPersistence(old=>old==='requesting'?'unknown':old);finish(attempt);});
 }
 const rows:LocalCopyRowView[]=(page?.rows??[]).map(row=>({id:row.rowId,label:title(row),backend:row.backend,declaredBytes:row.logicalBytes,observedBytes:row.observedBytes,availabilityText:availabilityLabels[row.availability],integrityText:integrityLabels[row.integrity],protectedReason:row.protection==='kept'?'Conservada; no se retira automáticamente':'Propiedad o conservación sin confirmar; se preserva',...row.references,canVerify:!!row.copyRef,canExport:!!row.copyRef&&row.logicalBytes!==null&&row.logicalBytes<=COPY_LIMITS.exportBytes}));
 return <details className="local-copies-controller" onToggle={event=>{if(!event.currentTarget.open){active.current?.controller.abort();releasePrepared();}}}><summary>Gestionar copias locales</summary><LocalCopiesPanel rows={rows} inventoryState={inventoryState} partial={page?.partial??true} referencesComplete={page?.referencesComplete??false} totalObservedBytes={page?.observedBytes??null} totalLogicalBytes={page?.logicalBytes??null} storageUsage={storage?.originUsageBytes??null} quota={storage?.originQuotaBytes??null} storageState={storage?.failure?'La estimación no pudo confirmarse.':storage?.persisted===true?'El navegador informa persistencia concedida.':'La estimación no mide únicamente audio.'} identity="unknown" hasNextPage={!!page?.nextCursor} canPreviousPage={pageIndex.current>0} pending={!!pending} canUse={props.canUse} status={message} persistenceState={persistence} exportView={props.canUse?exportView:null} exportPreparing={pending==='export-audio'} exportProgress={progress} onRefresh={()=>void inventory(0,true)} onPrevious={()=>{if(pageIndex.current>0)void inventory(pageIndex.current-1);}} onNext={()=>{if(page?.nextCursor)void inventory(pageIndex.current+1);}} onVerify={id=>void verify(id)} onPrepareExport={id=>void prepare(id)} onRequestPersistence={requestPersistence} onCancel={()=>{active.current?.controller.abort();setMessage('Cancelación solicitada. Esperando el cierre de la operación.');}} onReleaseExport={releasePrepared} onDownloadPrepared={()=>{const own=prepared.current;if(!own||!allowed.current||!safeCurrent(own.current)){releasePrepared();return false;}return true;}}/></details>;
}
