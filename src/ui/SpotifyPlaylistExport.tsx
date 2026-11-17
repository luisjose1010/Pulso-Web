import {useEffect,useRef,useState} from 'react';
import {playlistCSV,playlistTXT,spotifyPlaylistId,type SpotifyPlaylist} from '../playlists/spotify-export';
import './spotify-playlist-export.css';
export function SpotifyPlaylistExport(){
 const [input,setInput]=useState(''),[result,setResult]=useState<SpotifyPlaylist|null>(null),[status,setStatus]=useState(''),[loading,setLoading]=useState(false);
 const active=useRef<AbortController|null>(null);
 useEffect(()=>()=>{active.current?.abort();},[]);
 function invalidate(){active.current?.abort();active.current=null;setResult(null);setStatus('');setLoading(false);}
 async function read(){
  invalidate();const id=spotifyPlaylistId(input);if(!id){setStatus('Pega un enlace HTTPS de open.spotify.com/playlist/ con un identificador válido.');return;}
  const controller=new AbortController();active.current=controller;setLoading(true);setStatus('Leyendo playlist…');
  try{const response=await fetch(`/api/spotify-playlist/${id}`,{signal:controller.signal,credentials:'omit',cache:'no-store'});if(!response.ok)throw Error();const data=await response.json() as SpotifyPlaylist;if(controller.signal.aborted||active.current!==controller)return;setResult(data);setStatus('Lectura terminada.');}
  catch{if(!controller.signal.aborted&&active.current===controller)setStatus('No se pudo leer la playlist. Comprueba que el enlace sea público y vuelve a intentarlo.');}
  finally{if(active.current===controller)setLoading(false);}
 }
 function download(format:'csv'|'txt'){
  if(!result)return;const blob=new Blob([format==='csv'?playlistCSV(result):playlistTXT(result)],{type:format==='csv'?'text/csv;charset=utf-8':'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`playlist-spotify.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className="settings-group spotify-export" aria-labelledby="spotify-export-heading"><h3 id="spotify-export-heading">Exportar playlists</h3><div className="settings-group__body"><p>En Spotify abre la playlist y elige Compartir → Copiar enlace. Pégalo aquí y pulsa Leer playlist.</p><p>Lee el listado público sin conectar tu cuenta de Spotify. Exporta títulos, artistas, duración y enlaces; no importa canciones a Pulso ni descarga audio.</p><form onSubmit={event=>{event.preventDefault();void read();}}><label htmlFor="spotify-playlist-url">Enlace de la playlist de Spotify</label><input id="spotify-playlist-url" type="url" value={input} onChange={event=>{invalidate();setInput(event.target.value);}} placeholder="https://open.spotify.com/playlist/…" autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="go" required/><button type="submit" disabled={loading}>Leer playlist</button></form><p role="status" aria-live="polite">{status}</p>{result&&<div className="spotify-export__result"><h4>{result.name}</h4><p>{result.tracks.length} canciones exportables · {result.readCount} entradas leídas · {result.omitted} omitidas (episodios, pistas locales u otras entradas sin enlace de canción).</p><p>{result.complete?'Total confirmado por Spotify.':result.total===null?'Completitud desconocida: Spotify no aporta el total.':'Listado parcial: no se ha leído el total indicado por Spotify.'} {result.limited&&'Límite de lectura: 100 entradas; la respuesta podría estar truncada.'}</p><p>Las canciones no disponibles pueden incluirse como metadatos; esto no indica que se puedan reproducir.</p><div className="spotify-export__actions"><button type="button" disabled={!result.tracks.length} onClick={()=>download('csv')}>Descargar CSV</button><button type="button" disabled={!result.tracks.length} onClick={()=>download('txt')}>Descargar TXT</button></div></div>}<p>La lectura pública de Spotify puede cambiar o dejar de estar disponible.</p></div></section>;
}
