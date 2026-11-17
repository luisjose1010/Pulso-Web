import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './library-download.css';
import {subscribeLibraryDownloads,downloadLibrarySelection} from '../library/library-download';
import {albumCoordinator,notifyAlbumDownload} from '../library/album-download';
import {orderedProviders} from '../library/ordered-bot-acquisition';
import type {BotsSnapshot} from '../telegram/session-client';
import type {TelegramSessionClient} from '../telegram/session-client';
import type {Track} from '../library/library';
import type {SongPlaybackAttempt} from '../library/selected-song';
export function LibraryDownloadController(props:{tracks:readonly Track[];client:TelegramSessionClient|null;bots:BotsSnapshot|null;connected:boolean;capture?:()=>SongPlaybackAttempt|null;capturePlay?:()=>SongPlaybackAttempt|null}){
 const latest=useRef(props);latest.current=props;const flight=useRef<AbortController|null>(null);const [notice,setNotice]=useState('');
 useEffect(()=>{
  const remove=subscribeLibraryDownloads(request=>{
   const p=latest.current;if(flight.current||albumCoordinator.running){setNotice('Hay otra descarga en curso.');return;}
   const attempt=(request.play?p.capturePlay:p.capture)?.(),providers=orderedProviders(p.bots);if(!attempt?.current()||!p.client||!p.connected||!p.bots||!providers.length){setNotice('Conecta Telegram y configura un bot para descargar en este dispositivo.');return;}
   const tracks=request.trackIds.map(id=>p.tracks.find(t=>t.id===id));if(tracks.some(t=>!t)){setNotice('La selección cambió. Vuelve a elegirla.');return;}
   const abort=new AbortController();flight.current=abort;albumCoordinator.running=true;
   const run={scope:'library',editionId:0,key:request.id,title:request.title,abort};albumCoordinator.active=run;
   setNotice('');
   let readyId:string|null=null;
   void downloadLibrarySelection({tracks:tracks as Track[],attempt,client:p.client,providers,revision:p.bots.revision,signal:abort.signal,current:()=>flight.current===abort&&attempt.current(),update:(rows,message)=>{if(flight.current!==abort)return;readyId=rows.length===1&&rows[0].confirmed?rows[0].trackId:null;albumCoordinator.notice={title:request.title,titles:(tracks as Track[]).map(t=>t.title),progress:{rows,message}};notifyAlbumDownload(albumCoordinator);}}).then(async()=>{if(request.play&&readyId&&flight.current===abort&&!abort.signal.aborted&&attempt.current()){const result=await attempt.play(readyId,()=>flight.current===abort&&!abort.signal.aborted,abort.signal);if(result==='gesture-required')setNotice('Copia guardada. Pulsa Reproducir para escucharla.');}}).finally(()=>{if(flight.current===abort)flight.current=null;if(albumCoordinator.active===run){albumCoordinator.running=false;albumCoordinator.active=undefined;notifyAlbumDownload(albumCoordinator);}});
  });return()=>{remove();flight.current?.abort();};
 },[]);
 return notice?createPortal(<aside className="library-download-hint"><p role="status">{notice}</p><button type="button" onClick={()=>setNotice('')}>Cerrar aviso</button></aside>,document.body):null;
}
