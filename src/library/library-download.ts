import type {Track} from './library';
import type {AlbumRow} from './album-acquisition';
import type {SongPlaybackAttempt,SongChoice} from './selected-song';
import {acquireFromOrderedBots,acquisitionFailureText,type OrderedProvider} from './ordered-bot-acquisition';
import type {TelegramSessionClient} from '../telegram/session-client';
import {parseBotSearchTarget} from '../telegram/bot-search-protocol';
export interface LibraryDownloadRequest {id:string;trackIds:readonly string[];title:string;play:boolean}
const listeners=new Set<(request:LibraryDownloadRequest)=>void>();
const uncertainTracks=new Set<string>();
export function requestLibraryDownload(trackIds:readonly string[],title:string,play=false){if(trackIds.length>5000||!trackIds.length)return;const request={id:crypto.randomUUID(),trackIds:[...new Set(trackIds)],title,play:play&&trackIds.length===1};for(const fn of listeners)fn(request);}
export function subscribeLibraryDownloads(fn:(request:LibraryDownloadRequest)=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export async function downloadLibrarySelection(p:{tracks:readonly Track[];attempt:SongPlaybackAttempt;client:TelegramSessionClient;providers:readonly OrderedProvider[];revision:number;signal:AbortSignal;current:()=>boolean;update:(rows:AlbumRow[],message:string)=>void}){
 const rows:AlbumRow[]=p.tracks.map(()=>({state:'unattempted',trackId:null,confirmed:false,message:'En espera'}));
 const live=()=>p.current()&&p.attempt.current()&&!p.signal.aborted,networkCurrent=p.client.captureBotsCurrent(),remoteClock={settledAt:0};
 const update=(message:string)=>p.update(rows.map(row=>({...row})),message);
 try{for(let i=0;i<p.tracks.length;i++){
  if(!live())break;const track=p.tracks[i],row=rows[i];const choice:SongChoice={source:'local',id:'local:'+track.id,title:track.catalogChoice?.title??track.title,artist:track.catalogChoice?.artist??track.artist,album:track.catalogChoice?.album??track.album,duration:track.catalogChoice?.duration??track.duration};
  let id=await p.attempt.lookup(choice,p.signal);if(!live())break;
  if(id){uncertainTracks.delete(track.id);row.state='reused';row.trackId=id;row.confirmed=true;row.message='Ya descargada en este dispositivo.';update('Copia local reutilizada.');continue;}
  if(uncertainTracks.has(track.id)){row.state='uncertain';row.message='Requiere revisión antes de repetir la entrega.';update(row.message);continue;}
  const target=parseBotSearchTarget({title:choice.title,artist:choice.artist,album:choice.album,durationSeconds:choice.duration});if(!target){row.state='failed';row.message='Metadatos insuficientes para buscarla.';update(row.message);continue;}
  row.message='Buscando canción…';update(row.message);
  const result=await acquireFromOrderedBots({client:p.client,providers:p.providers,revision:p.revision,target,signal:p.signal,current:live,networkCurrent,remoteClock,progress:()=>{}});
  if(!live()||result.state==='uncertain'){uncertainTracks.add(track.id);row.state='uncertain';row.message='Entrega sin confirmar; revisa antes de repetir.';update(row.message);return;}
  if(result.state==='known-failure'){row.state='failed';row.message=acquisitionFailureText(result.reasons);update(row.message);continue;}
  const saved=await p.attempt.save(result.audio,choice,p.signal,()=>{});row.trackId=saved.trackId;
  if(saved.state!=='saved'){if(saved.state==='uncertain')uncertainTracks.add(track.id);row.state=saved.state==='uncertain'?'uncertain':'failed';row.message='No se pudo confirmar la copia. Revisa Almacenamiento.';update(row.message);return;}
  row.state='downloaded';row.confirmed=true;row.message='Descargada en este dispositivo.';update(row.message);
 }
 update(!live()?'Descarga detenida. Las copias confirmadas se conservan.':rows.every(row=>row.confirmed)?'Selección descargada en este dispositivo.':'Descarga parcial: revisa las canciones pendientes.');
 }catch{update('Descarga interrumpida. Comprueba las copias antes de repetir.');}
}
