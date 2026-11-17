import {useEffect,useReducer} from 'react';
import {albumCoordinator,notifyAlbumDownload} from '../library/album-download';
import './download-bubble.css';
export function AlbumDownloadNotice(){
 const [,refresh]=useReducer(n=>n+1,0);
 useEffect(()=>{const listener=()=>refresh();albumCoordinator.listeners.add(listener);return()=>{albumCoordinator.listeners.delete(listener);};},[]);
 const notice=albumCoordinator.notice,run=albumCoordinator.active;if(!notice)return null;
 const confirmed=notice.progress.rows.filter(r=>r.confirmed).length,total=notice.progress.rows.length;
 const state=albumCoordinator.running?'Descargando':confirmed===total?'Completada':'Detenida';
 return <details className="download-bubble" aria-label="Descargas">
  <summary><span aria-hidden="true">↓</span> Descargas<span className="pulso-visually-hidden"> · {state}</span></summary>
  <div className="download-bubble__panel"><header><strong>{notice.title}</strong><span role="status">{state} · {confirmed} de {total} guardadas</span></header>
   <progress aria-label="Canciones guardadas" value={confirmed} max={Math.max(1,total)}/>
   <p role="status">{notice.progress.message}</p>
   <ol>{notice.progress.rows.map((row,index)=><li key={index}><strong>{notice.titles?.[index]??`Canción ${index+1}`}</strong><span>{row.message||'En espera'}</span></li>)}</ol>
   {albumCoordinator.running&&run?<button type="button" onClick={()=>{if(albumCoordinator.active===run)run.abort.abort();}}>Detener descarga de álbum</button>:<button type="button" onClick={()=>{if(!albumCoordinator.running&&albumCoordinator.notice===notice){albumCoordinator.notice=undefined;notifyAlbumDownload(albumCoordinator);}}}>Cerrar aviso de descarga</button>}
  </div>
 </details>;
}
