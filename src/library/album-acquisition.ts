import type {AlbumDetail,AlbumTrack} from './album-catalog';
import type {SongChoice,SongPlaybackAttempt,SongManagement} from './selected-song';
import {acquireFromOrderedBots,acquisitionFailureText,type OrderedProvider} from './ordered-bot-acquisition';
import {isBotSearchQuery,parseBotSearchTarget} from '../telegram/bot-search-protocol';
import type {TelegramSessionClient} from '../telegram/session-client';

export function albumTrackChoice(track:AlbumTrack,album:string):SongChoice {
 // Playlist import without a catalogue match: no album/duration, never an iTunes identity.
 if(track.direct)return {id:`lrclib:${track.trackId}`,source:'lrclib',title:track.title,artist:track.artist,album:null,duration:null};
 return {id:`itunes:${track.releaseId}:${track.disc}:${track.position}:${track.trackId}`,source:'itunes',title:track.title,artist:track.artist,searchArtist:track.primaryArtist??track.artist,album:track.album??album,duration:track.durationMs===null?null:track.durationMs/1000};
}
export type AlbumRowState='unattempted'|'ready'|'reused'|'downloaded'|'failed'|'uncertain';
export interface AlbumRow {state:AlbumRowState;trackId:string|null;confirmed:boolean;message:string}
export interface AlbumProgress {rows:AlbumRow[];message:string}
export interface AlbumAcquisition {
 detail:AlbumDetail;attempt:SongPlaybackAttempt;client:TelegramSessionClient|null;provider:string|null;providers?:readonly OrderedProvider[];revision:number|undefined;
 management:(id:string)=>SongManagement|null;signal:AbortSignal;current:()=>boolean;update:(value:AlbumProgress)=>void;rows:AlbumRow[];remoteClock?:{settledAt:number};uncertainTracks?:Set<number>;
}
export async function acquireAlbum(p:AlbumAcquisition):Promise<void> {
 const rows=p.rows.map(row=>row.confirmed?{...row,state:'ready' as const,confirmed:false,message:'Pendiente de verificar de nuevo.'}:{...row});
 const live=()=>{try{return !p.signal.aborted&&p.current()&&p.attempt.current();}catch{return false;}};
 const update=(message:string)=>{for(let i=0;i<rows.length;i++)if(rows[i].state==='uncertain')p.uncertainTracks?.add(p.detail.tracks[i].trackId);p.update({rows:rows.map(row=>({...row})),message});};
 const remoteClock=p.remoteClock??{settledAt:0},networkCurrent=p.client?.captureBotsCurrent();
 const uncertainTracks=new Set([...(p.uncertainTracks??[]),...p.detail.tracks.filter((_,i)=>rows[i].state==='uncertain').map(t=>t.trackId)]);
 update('Comprobando copias…');
 try {
  for(let i=0;i<p.detail.tracks.length;i++){
   if(!live())break;
   const row=rows[i],choice=albumTrackChoice(p.detail.tracks[i],p.detail.edition.title);
   let id=await p.attempt.lookup(choice,p.signal);if(!live())break;
   // A previous uncertain delivery must never be dispatched again without a verified copy.
   if(!id&&(row.state==='uncertain'||uncertainTracks.has(p.detail.tracks[i].trackId))){row.state='uncertain';row.message='Requiere revisión en Almacenamiento antes de repetir.';update(row.message);continue;}
   if(id){uncertainTracks.delete(p.detail.tracks[i].trackId);p.uncertainTracks?.delete(p.detail.tracks[i].trackId);}
   row.confirmed=false;
   let downloaded=false;
   if(!id){
    const client=p.client,providers=p.providers??(p.provider?[{providerRef:p.provider,label:'Bot'}]:[]);
    if(!client||!networkCurrent||!providers.length||p.revision===undefined){update('Conecta un bot compatible para continuar con las pistas pendientes.');return;}
    const target=parseBotSearchTarget({title:choice.title,artist:choice.artist,album:choice.album,durationSeconds:choice.duration});
    if(!target||!isBotSearchQuery(target.title)){row.state='failed';row.message='Metadatos insuficientes.';update(row.message);continue;}
    const result=await acquireFromOrderedBots({client,providers,revision:p.revision,target,signal:p.signal,current:live,networkCurrent,remoteClock,progress:(provider,index)=>{row.message=`Probando ${provider.label} (${index+1}/${providers.length})…`;update(row.message);}});
    if(!live()){if(result.state!=='known-failure'){row.state='uncertain';row.message='Operación interrumpida; revisa antes de repetir.';}break;}
    if(result.state==='uncertain'){row.state='uncertain';row.message='Operación sin confirmar; revisa Telegram.';update(row.message);return;}
    if(result.state==='known-failure'){row.state='failed';row.message=acquisitionFailureText(result.reasons);update(row.message);continue;}
    const audio=result.audio;
    const saved=await p.attempt.save(audio,choice,p.signal,()=>{});
    if(saved.state==='saved'&&saved.trackId){id=saved.trackId;row.trackId=id;row.state='ready';row.message='Copia guardada.';}
    else if(saved.state==='uncertain'){row.trackId=saved.trackId;row.state='uncertain';row.message='La copia requiere revisión en Almacenamiento.';update(row.message);return;}
    else {row.state='failed';row.message=live()?'No se pudo guardar la pista.':'Operación detenida sin confirmar la copia.';update(row.message);return;}
    if(!live())break;
    downloaded=true;
   }
   row.trackId=id;row.state='ready';row.message='Copia verificada.';
   if(!live())break;
   const added=await p.attempt.addToLibrary(id,live,p.signal);
   if(added){row.confirmed=true;row.state=downloaded?'downloaded':'reused';row.message='En Biblioteca.';}
   if(!live())break;
   if(!added){row.message='No se pudo confirmar Biblioteca.';update(row.message);return;}
   update('Pista incorporada a Biblioteca.');
  }
  if(!live())update('Operación detenida. Las copias ya confirmadas se conservan.');
  else update(rows.every(row=>row.confirmed)?'Álbum listo en Biblioteca.':'Álbum incompleto: revisa las pistas pendientes o fallidas.');
 }catch(error){update(error instanceof Error?error.message:'No se pudo comprobar la copia local.');}
}
