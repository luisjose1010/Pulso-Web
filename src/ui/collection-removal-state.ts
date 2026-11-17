import * as core from '../library/collection-removal';
import {prepareCopyRemovalRuntime} from '../playback/copy-removal-runtime';
import {clearRemovalTracking,persistRemovalTracking,scanCopyRemovalStartup,type CopyRemovalStartup} from './local-copy-removal-state';
import type {Activity,ActivityToken} from '../playback/ownership';
import type {SourceReviewResult} from '../playback/source-review-admission';
import type {LocalAsset} from '../library/library';

export interface CollectionHost {
 activity:Activity; canStart():boolean; captureRaw():()=>boolean;
 gate(active:boolean):void; reserve(target:Readonly<LocalAsset>):SourceReviewResult;
 refresh():Promise<void>; adopt(snapshot:CopyRemovalStartup):void; checkpoint(current:()=>boolean):void; changed():void;
}
type State='preparing'|'ready'|'working'|'done'|'uncertain'|'blocked';
export interface CollectionView {
 readonly visible:boolean; readonly state:State; readonly title:string; readonly kind:'playlist'|'album'|'cache';
 readonly summary:core.CollectionPreview|null; readonly accepted:boolean; readonly result:(Omit<core.CollectionOutcome,'freedBytes'> & {freedBytes:number|null})|null; readonly message:string|null;
}
type Run={abort:AbortController;raw:()=>boolean;context:core.CollectionContext;token:ActivityToken|null;preview:core.CollectionPreviewToken|null;settlement:Promise<void>|null;settling:boolean;released:boolean};
const safe=(fn:()=>boolean)=>{try{return fn()===true;}catch{return false;}};
const initial:CollectionView=Object.freeze({visible:false,state:'blocked',title:'',kind:'playlist',summary:null,accepted:false,result:null,message:null});
export function createCollectionRemovalController(host:CollectionHost){
 let view=initial,run:Run|null=null,disposed=false;
 const publish=(patch:Partial<CollectionView>)=>{if(!disposed){view=Object.freeze({...view,...patch});host.changed();}};
 const live=(r:Run)=>!disposed&&run===r&&!r.abort.signal.aborted&&safe(r.raw);
 function release(r:Run){if(r.released||r.settling)return;r.released=true;if(r.preview)core.releaseCollectionRemovalPreview(r.preview);r.preview=null;r.token?.end();r.token=null;if(run===r){run=null;host.gate(false);if(safe(r.raw))host.checkpoint(r.raw);}}
 function start(selection:core.CollectionSelection,title:string){
  if(disposed||run)return false;
  if(!host.canStart()){
   publish({...initial,visible:true,state:'blocked',title,kind:selection.kind,message:'Hay una operación en curso o no se puede comprobar el almacenamiento ahora. Espera a que termine y vuelve a abrir la revisión.'});
   return true;
  }
  const raw=host.captureRaw(),abort=new AbortController();
  const r:Run={abort,raw,context:{signal:abort.signal,current:()=>live(r)},token:null,preview:null,settlement:null,settling:true,released:false};
  run=r;host.gate(true);publish({...initial,visible:true,state:'preparing',title,kind:selection.kind});
  r.token=host.activity.begin();
  const work=(async()=>{try{
   if(!r.token||!live(r))throw Error('admission');
   const result=await core.previewCollectionRemoval(selection,r.context);r.preview=result.token;
   if(live(r)&&r.token.current())publish({state:'ready',summary:result});
   else if(!disposed)publish({state:'blocked',message:'La revisión ya no está vigente.'});
  }catch{if(!disposed&&run===r)publish({state:'blocked',message:'No se pudo preparar la revisión. Conservamos la colección.'});}
  finally{r.settling=false;if(!live(r)||view.state!=='ready')release(r);}})();r.settlement=work;return true;
 }
 async function confirm(expected:CollectionView){
  const r=run;if(view!==expected||!r||!live(r)||r.settling||view.state!=='ready'||!view.accepted||!r.preview)return;
  const token=r.preview;r.preview=null;r.settling=true;publish({state:'working',accepted:false});
  const work=(async()=>{let outcome:core.CollectionOutcome|null=null;
   try{
    outcome=await core.confirmCollectionRemoval(token,{confirm:true,acceptPossibleOnlyCopyLoss:true},r.context,{
     readContext(){if(!r.token)r.token=host.activity.begin();return {signal:r.abort.signal,current:()=>live(r)&&!!r.token?.current()};},
     settlementReadContext(){if(!r.token)r.token=host.activity.begin();return {signal:new AbortController().signal,current:()=>safe(r.raw)&&!!r.token?.current()};},
     async reserve(target){
      r.token?.end();r.token=null;if(!live(r))return {kind:'blocked',reason:'stale'};
      const reserved=host.reserve(target);if(reserved.kind==='blocked')return reserved;
      const fresh=host.captureRaw();const current=()=>live(r)&&safe(fresh)&&reserved.reservation.current();
      const runtime=await prepareCopyRemovalRuntime(target,current);
      if(runtime.kind==='blocked'){reserved.reservation.release();return {kind:'blocked',reason:runtime.reason};}
      if(!current()){runtime.runtime.release();reserved.reservation.release();return {kind:'blocked',reason:'stale'};}
      let released=false;return {kind:'reserved',context:{signal:r.abort.signal,current,runtimeProtectionCurrent:asset=>current()&&runtime.runtime.current(asset)},async release(){if(released)return;released=true;runtime.runtime.release();reserved.reservation.release();}};
     },
     async record(tracking){return safe(r.raw)&&persistRemovalTracking(tracking);},
     // Cancellation revokes new work, not settlement bookkeeping. The core only
     // asks to forget after proving non-dispatch/abort or a durable terminal
     // receipt; keep the original non-reviving scope guard and exact pointer CAS.
     async forget(tracking){return safe(r.raw)&&clearRemovalTracking(tracking);},
    });
   }catch{/* An unknown outcome must be inspected, never replayed. */}
   finally{
    r.token?.end();r.token=null;
    if(safe(r.raw)){
     let refreshFailed=false;try{await host.refresh();}catch{outcome=null;refreshFailed=true;}
     if(!outcome||outcome.metadata==='unknown'||outcome.cleanup==='stopped'){
      const scanAbort=new AbortController();const snapshot=await scanCopyRemovalStartup({signal:scanAbort.signal,current:r.raw});if(safe(r.raw))host.adopt(refreshFailed?{...snapshot,unknown:true}:snapshot);
     }
    }
    if(!disposed&&run===r){const uncertain=!outcome||outcome.metadata==='unknown'||outcome.cleanup==='stopped';publish({state:uncertain?'uncertain':'done',result:outcome?{...outcome,freedBytes:uncertain?null:outcome.freedBytes}:null,message:uncertain?'El resultado de las copias puede estar incompleto. Revisa cualquier retirada pendiente antes de volver a actuar.':null});}
    r.settling=false;if(!live(r))release(r);
   }
  })();r.settlement=work;await work;
 }
 async function cancel(expected:CollectionView){const r=run;if(view!==expected||!r)return;r.abort.abort();await r.settlement;if(run===r){if(!disposed)publish({state:'blocked',accepted:false,message:'Revisión detenida.'});release(r);}}
 function callbacks(expected:CollectionView){const valid=()=>!disposed&&view===expected;return {
  current:()=>valid()&&(!run||live(run)),
  accepted(value:boolean){if(valid()&&run&&live(run)&&view.state==='ready')publish({accepted:value});},
  confirm:()=>confirm(expected),cancel:()=>cancel(expected),
  close(){if(!valid()||run?.settling)return false;if(run)release(run);publish({visible:false,accepted:false});return true;},
 };}
 return {getView:()=>view,start,callbacks,async dispose(){if(disposed)return;disposed=true;const r=run;if(!r)return;r.abort.abort();await r.settlement;release(r);}};
}
