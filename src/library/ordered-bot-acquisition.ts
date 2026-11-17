import {formatStorageMB} from './storage-format';
import {AUDIO_FILE_MAX_BYTES} from '../storage/audio-limits';
import {matchingSongRows} from './selected-song';
import type {BotSearchTarget,BotDownloadedAudio} from '../telegram/bot-search-protocol';
import type {BotsSnapshot,TelegramSessionClient} from '../telegram/session-client';

export type OrderedProvider={providerRef:string;label:string};
export function orderedProviders(bots:BotsSnapshot|null):OrderedProvider[] {
 const seen=new Set<string>(),usernames=new Set<string>();
 return (bots?.providers??[]).filter(p=>{const username=p.username.toLowerCase();if(!['ivkmbot','lydbot','ansmusicbot','kdmusic_bot','deezermusicbot'].includes(username)||seen.has(p.providerRef)||usernames.has(username))return false;seen.add(p.providerRef);usernames.add(username);return true;}).slice(0,5).map(p=>({providerRef:p.providerRef,label:p.label}));
}
export type AcquisitionFailureReason='no-compatible-row'|'returned-audio-mismatch'|'file-too-large'|'file-invalid'|'selection-changed';
/** Closed explanations shared by individual and album acquisition. Never assert
 * catalogue absence from a local validation failure. */
export function acquisitionFailureText(reasons:readonly AcquisitionFailureReason[]):string {
 const messages:Record<AcquisitionFailureReason,string>={
  'no-compatible-row':'Las opciones del bot no pudieron vincularse con el título y artista elegidos. [D01]',
  'returned-audio-mismatch':'Se recibió audio, pero sus metadatos no coinciden con la canción elegida (título, artista, versión o duración). [D02]',
  'file-too-large':`El bot entregó un archivo que supera el límite actual de ${formatStorageMB(AUDIO_FILE_MAX_BYTES)} de Pulso. No se descargó. [D03]`,
  'file-invalid':'El archivo recibido está incompleto o su formato no es compatible. No se guardó. [D04]',
  'selection-changed':'La opción del bot cambió antes de confirmar la descarga. [D05]',
 };
 return [...new Set(reasons)].map(reason=>messages[reason]).join(' ')||'No se pudo confirmar una coincidencia musical.';
}
type Result={state:'audio';audio:BotDownloadedAudio}|{state:'known-failure';reasons:readonly AcquisitionFailureReason[]}|{state:'uncertain'};
/** One gesture, one sequential attempt per captured provider. Never releases the client's lane. */
export async function acquireFromOrderedBots(p:{client:TelegramSessionClient;providers:readonly OrderedProvider[];revision:number;target:BotSearchTarget;signal:AbortSignal;current:()=>boolean;networkCurrent:()=>boolean;remoteClock?:{settledAt:number};progress:(provider:OrderedProvider,index:number,queryId:string|null)=>void}):Promise<Result> {
 const {client}=p,target={...p.target},network=p.networkCurrent,current=p.current,revision=p.revision,deadline=Date.now()+180000;
 const seen=new Set<string>(),providers=p.providers.filter(provider=>{if(seen.has(provider.providerRef))return false;seen.add(provider.providerRef);return true;}).slice(0,5).map(provider=>({...provider}));
 const reasons:AcquisitionFailureReason[]=[];
 let expired=false;
 let ownedCancel:(()=>void)|undefined;
 const cancel=()=>{try{ownedCancel?.();}catch{/* Cancellation cannot grant a new lane. */}};
 const timer=setTimeout(()=>{expired=true;cancel();},180000);
 p.signal.addEventListener('abort',cancel);
 const live=()=>!expired&&!p.signal.aborted&&Date.now()<deadline&&current()&&network()&&client.botsSnapshot().revision===revision;
 const wait=async()=>{const ms=p.remoteClock?Math.max(0,p.remoteClock.settledAt+1000-Date.now()):0;if(ms)await new Promise<void>(resolve=>{const t=setTimeout(done,ms);function done(){clearTimeout(t);p.signal.removeEventListener('abort',done);resolve();}p.signal.addEventListener('abort',done,{once:true});if(p.signal.aborted)done();});};
 const settled=()=>{if(p.remoteClock)p.remoteClock.settledAt=Date.now();};
 const same=(s:ReturnType<TelegramSessionClient['searchSnapshot']>,provider:string,q:string|null)=>!!q&&s.queryId===q&&s.providerRef===provider&&s.providerRevision===revision&&JSON.stringify(s.expectedTarget)===JSON.stringify(target)&&!s.pending&&s.available&&!s.retryBlocked&&(s.retryAt===null||s.retryAt<=Date.now());
 try {
  for(let i=0;i<providers.length;i++){
   const provider=providers[i];await wait();if(!live())return {state:'uncertain'};
   const before=client.searchSnapshot();if(before.pending||!before.available||before.retryBlocked||before.retryAt!==null&&before.retryAt>Date.now()||before.error==='uncertain')return {state:'uncertain'};
   p.progress(provider,i,null);
   let queryId:string|null=null;
   const terminal=new Promise<void>(resolve=>{
    const unsubscribe=client.subscribeSearch(s=>{if(queryId&&(!s.pending||!s.available)){unsubscribe();resolve();}});
    const allowed=client.captureSearchActionCurrent();if(live()&&allowed())client.searchBot({providerRef:provider.providerRef,query:target.title,target,consent:true},allowed,admission=>{queryId=admission.queryId;ownedCancel=admission.cancel;if(expired||p.signal.aborted)cancel();});
    const now=client.searchSnapshot();
    if(!queryId||!now.pending){unsubscribe();resolve();}
   });
   p.progress(provider,i,queryId);await terminal;ownedCancel=undefined;settled();
   const found=client.searchSnapshot();if(!live()||!same(found,provider.providerRef,queryId)||found.error||found.delivery!=='acknowledged')return {state:'uncertain'};
   const matches=matchingSongRows(found.rows,target);if(!matches.length){reasons.push('no-compatible-row');continue;}
   await wait();if(!live())return {state:'uncertain'};
   const prior=client.searchSnapshot();if(!same(prior,provider.providerRef,queryId)||prior.error||prior.delivery!=='acknowledged'||!prior.rows.some(r=>r.rowRef===matches[0].rowRef))return {state:'uncertain'};
   const allowed=client.captureSearchActionCurrent();if(!allowed())return {state:'uncertain'};
   let admittedDownload=false;
   const downloading=client.downloadBot(matches[0].rowRef,allowed,admission=>{if(admission.queryId===queryId){admittedDownload=true;ownedCancel=admission.cancel;if(expired||p.signal.aborted)cancel();}});
   const audio=await downloading;ownedCancel=undefined;settled();
   if(!admittedDownload)return {state:'uncertain'};
   if(!live())return {state:'uncertain'};
   const after=client.searchSnapshot();if(!same(after,provider.providerRef,queryId))return {state:'uncertain'};
   if(audio)return JSON.stringify(audio.target)===JSON.stringify(target)?{state:'audio',audio}:{state:'uncertain'};
   // The exact-menu/file revalidation failed before any callback was sent.
   // The original lane has settled; keep its strict validation and try only the
   // next captured provider. An acknowledged/uncertain callback still stops.
   if(after.error==='conflict'&&after.delivery==='not-dispatched'){reasons.push('selection-changed');continue;}
   if(after.error==='file-too-large'&&after.delivery!=='uncertain'){reasons.push('file-too-large');continue;}
   if(after.delivery==='acknowledged'&&after.error==='file-invalid'){reasons.push('file-invalid');continue;}
   if(after.delivery==='acknowledged'&&after.error===null&&after.rows.some(r=>r.kind==='audio')&&!matchingSongRows(after.rows,target).length){reasons.push('returned-audio-mismatch');continue;}
   return {state:'uncertain'};
  }
  return {state:'known-failure',reasons};
 }catch{cancel();return {state:'uncertain'};}finally{clearTimeout(timer);p.signal.removeEventListener('abort',cancel);}
}
