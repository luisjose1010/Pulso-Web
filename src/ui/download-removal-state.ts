import * as removal from '../library/local-copy-removal';
import {copySourceAsset,sameSourceAsset} from '../playback/local-source-protocol';
import {prepareCopyRemovalRuntime} from '../playback/copy-removal-runtime';
import {clearRemovalTracking,persistRemovalTracking,scanCopyRemovalStartup} from './local-copy-removal-state';
import type {CollectionHost} from './collection-removal-state';
import type {LocalAsset} from '../library/library';
import type {ActivityToken} from '../playback/ownership';

export interface DownloadRemovalEntry {readonly trackId:string;readonly trackRevision:number;readonly asset:Readonly<LocalAsset>}
export interface DownloadRemovalResult {readonly removed:number;readonly skipped:number;readonly remaining:number;readonly freedBytes:number;readonly reason:string|null}
export interface DownloadRemovalView {
 readonly visible:boolean;readonly state:'ready'|'working'|'done'|'uncertain'|'blocked';readonly title:string;readonly accepted:boolean;
 readonly copies:number;readonly bytes:number;readonly processed:number;readonly result:DownloadRemovalResult|null;readonly message:string|null;
}
const initial:DownloadRemovalView=Object.freeze({visible:false,state:'blocked',title:'',accepted:false,copies:0,bytes:0,processed:0,result:null,message:null});
const safe=(fn:()=>boolean)=>{try{return fn()===true;}catch{return false;}};
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
type Run={raw:()=>boolean;abort:AbortController;entries:readonly DownloadRemovalEntry[];token:ActivityToken|null;settlement:Promise<void>|null;settling:boolean;released:boolean};
/** Trusted root composition. The snapshot is explicit user intent, not removal
 * authority: every asset is freshly discovered, reserved, verified and CAS'd. */
export function createDownloadRemovalController(host:CollectionHost,core:typeof removal=removal,prepareRuntime=prepareCopyRemovalRuntime,tracking={persist:persistRemovalTracking,clear:clearRemovalTracking,scan:scanCopyRemovalStartup}){
 let view=initial,run:Run|null=null,disposed=false;
 const publish=(patch:Partial<DownloadRemovalView>)=>{if(!disposed){view=Object.freeze({...view,...patch});host.changed();}};
 const live=(r:Run)=>!disposed&&run===r&&!r.abort.signal.aborted&&safe(r.raw);
 function release(r:Run){if(r.released||r.settling)return;r.released=true;r.token?.end();r.token=null;if(run===r){run=null;host.gate(false);if(safe(r.raw))host.checkpoint(r.raw);}}
 function start(entries:readonly DownloadRemovalEntry[],title:string){
  if(disposed||run)return false;
  const reject=(message:string)=>{publish({...initial,visible:true,title,message});return true;};
  if(!host.canStart())return reject('Hay una operación en curso. Espera a que termine y vuelve a revisar las descargas.');
  const seen=new Set<string>(),snapshot:DownloadRemovalEntry[]=[];
  if(!entries.length||entries.length>10000)return reject('La selección no se puede revisar. Vuelve a abrir las descargas.');
  for(const entry of entries){const asset=copySourceAsset(entry.asset);if(!asset||!uuid(entry.trackId)||!Number.isSafeInteger(entry.trackRevision)||entry.trackRevision<1)return reject('La selección cambió. Vuelve a abrir las descargas.');if(seen.has(asset.id))continue;seen.add(asset.id);snapshot.push(Object.freeze({trackId:entry.trackId,trackRevision:entry.trackRevision,asset:Object.freeze(asset)}));}
  run={raw:host.captureRaw(),abort:new AbortController(),entries:Object.freeze(snapshot),token:null,settlement:null,settling:false,released:false};host.gate(true);
  publish({...initial,visible:true,state:'ready',title,copies:snapshot.length,bytes:snapshot.reduce((sum,e)=>sum+e.asset.bytes,0)});return true;
 }
 async function confirm(expected:DownloadRemovalView){
  const r=run;if(view!==expected||!r||!live(r)||r.settling||view.state!=='ready'||!view.accepted)return;
  r.settling=true;publish({state:'working',accepted:false});
  const work=(async()=>{
   let removed=0,skipped=0,processed=0,freedBytes=0,reason:string|null=null,uncertain=false;
   try{
    for(const entry of r.entries){
     if(!live(r)){reason='cancelled';break;}
     r.token=host.activity.begin();if(!r.token){reason='admission-unavailable';break;}
     const found=await core.discoverCopyRemoval({namespace:'local',trackId:entry.trackId,expectedTrackRevision:entry.trackRevision},{signal:r.abort.signal,current:()=>live(r)&&!!r.token?.current()});
     r.token.end();r.token=null;
     if(!live(r)){reason='cancelled';break;}
     if(found.kind==='blocked'||!sameSourceAsset(found.target,entry.asset)){skipped++;processed++;publish({processed});continue;}
     const reserved=host.reserve(found.target);
     if(reserved.kind==='blocked'){skipped++;processed++;publish({processed});continue;}
     let runtime:Awaited<ReturnType<typeof prepareRuntime>>|null=null,plan:removal.RemovalPlan|null=null;
     try{
      const fresh=host.captureRaw(),current=()=>live(r)&&safe(fresh)&&reserved.reservation.current();
      runtime=await prepareRuntime(found.target,current);
      if(runtime.kind==='blocked'||!current()){skipped++;processed++;publish({processed});continue;}
      const readyRuntime=runtime.runtime;
      const context:removal.RemovalContext={signal:r.abort.signal,current,runtimeProtectionCurrent:asset=>current()&&readyRuntime.current(asset)};
      const preview=await core.planCopyRemoval(found.candidate,context);
      if(preview.kind==='blocked'){skipped++;processed++;publish({processed});continue;}
      plan=preview.plan;
      if(!current()){reason='cancelled';break;}
      if(!tracking.persist(preview.tracking)){reason='tracking-unavailable';uncertain=true;break;}
      const outcome=await core.confirmCopyRemoval(plan,{planRevision:preview.planRevision,declaration:'accept-possible-only-original-loss',confirmRemoveThisCopy:true},context);
      if(outcome.preparation==='not-dispatched'||outcome.preparation==='aborted'){
       if(!safe(r.raw)||!tracking.clear(preview.tracking)){reason='tracking-uncertain';uncertain=true;break;}
       skipped++;processed++;publish({processed});continue;
      }
      if(outcome.recoveryRequired||!['removed','not-committed'].includes(outcome.state)){reason='receipt-uncertain';uncertain=true;break;}
      if(outcome.state==='removed'){removed++;freedBytes+=entry.asset.bytes;}else skipped++;
      processed++;publish({processed});
      // Clear the pointer while the terminal journal still exists. If pruning
      // fails, restore discovery only after a fresh read proves it is retained.
      if(!safe(r.raw)||!tracking.clear(preview.tracking)){reason='tracking-uncertain';uncertain=true;break;}
      if(!await core.acknowledgeCopyRemoval(outcome,context)){
       const retained=await core.readCopyRemovalTarget(preview.tracking,{signal:new AbortController().signal,current:()=>safe(r.raw)&&reserved.reservation.current()});
       if(retained&&sameSourceAsset(retained,entry.asset)&&safe(r.raw))tracking.persist(preview.tracking);
       reason='acknowledgement-uncertain';uncertain=true;break;
      }
     }finally{if(plan)core.releaseCopyRemovalPlan(plan);if(runtime?.kind==='ready')runtime.runtime.release();reserved.reservation.release();}
    }
   }catch{reason='operation-uncertain';uncertain=true;}
   finally{
    r.token?.end();r.token=null;
    if(safe(r.raw)){
     try{await host.refresh();}catch{reason='refresh-failed';uncertain=true;}
     if(uncertain){try{const snapshot=await tracking.scan({signal:new AbortController().signal,current:r.raw},core);if(safe(r.raw))host.adopt(reason==='refresh-failed'?{...snapshot,unknown:true}:snapshot);}catch{if(safe(r.raw))host.adopt({pending:[],unknown:true,storageUnavailable:false});}}
    }
    if(!disposed&&run===r)publish({state:uncertain?'uncertain':'done',result:{removed,skipped,remaining:r.entries.length-processed,freedBytes,reason},message:uncertain?'La retirada se detuvo. Revisa cualquier operación pendiente antes de continuar.':reason==='cancelled'?'La retirada se detuvo. Las descargas restantes se conservan.':null});
    r.settling=false;if(!live(r))release(r);
   }
  })();r.settlement=work;await work;
 }
 async function cancel(expected:DownloadRemovalView){const r=run;if(view!==expected||!r)return;r.abort.abort();await r.settlement;if(run===r){if(!disposed&&view.state==='ready')publish({state:'blocked',accepted:false,message:'No se retiró ninguna descarga.'});release(r);}}
 function callbacks(expected:DownloadRemovalView){const valid=()=>!disposed&&view===expected;return {
  current:()=>valid()&&(!run||live(run)),
  accepted(value:boolean){if(valid()&&run&&live(run)&&view.state==='ready')publish({accepted:value});},
  confirm:()=>confirm(expected),cancel:()=>cancel(expected),
  close(){if(!valid()||run?.settling)return false;if(run)release(run);publish({visible:false,accepted:false});return true;},
 };}
 return {getView:()=>view,start,callbacks,async dispose(){if(disposed)return;disposed=true;const r=run;if(!r)return;r.abort.abort();await r.settlement;release(r);}};
}
