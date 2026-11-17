import {useEffect,useReducer} from 'react';
import {albumCoordinator,notifyAlbumDownload} from '../library/album-download';
export function AlbumDownloadNotice(){
 const [,refresh]=useReducer(n=>n+1,0);
 useEffect(()=>{const listener=()=>refresh();albumCoordinator.listeners.add(listener);return()=>{albumCoordinator.listeners.delete(listener);};},[]);
 const notice=albumCoordinator.notice,run=albumCoordinator.active;if(!notice)return null;
 const confirmed=notice.progress.rows.filter(r=>r.confirmed).length,total=notice.progress.rows.length;
 return <section className="album-download-notice" aria-label="Descarga de álbum"><div role="status"><strong>{notice.title}</strong><p>{albumCoordinator.running?'Descargando álbum':confirmed===total?'Descarga completada':'Descarga detenida'} · {confirmed}/{total} en Biblioteca</p></div>{albumCoordinator.running&&run?<button type="button" onClick={()=>{if(albumCoordinator.active===run)run.abort.abort();}}>Detener descarga de álbum</button>:<button type="button" onClick={()=>{if(!albumCoordinator.running&&albumCoordinator.notice===notice){albumCoordinator.notice=undefined;notifyAlbumDownload(albumCoordinator);}}}>Cerrar aviso de descarga</button>}</section>;
}
