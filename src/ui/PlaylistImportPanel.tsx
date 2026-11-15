import React from 'react';
import type {AlbumDetail} from '../library/album-catalog';
import {searchArtwork} from '../library/catalog-artwork';
import {PLAYLIST_IMPORT_MAX,parsePlaylistText,playlistDetail,resolvePlaylist,type PlaylistMatch} from '../library/playlist-import';
import './playlist-import.css';

interface Props {visible:boolean;onOpen:(detail:AlbumDetail)=>void}
interface Resolved {name:string;matches:readonly PlaylistMatch[];skipped:number;truncated:number}

const reasonText:Record<string,string>={'no-artist':'sin artista (usa «Artista - Título»)',invalid:'texto demasiado corto',duplicate:'repetida'};

/** Paste "Artist - Title" lines, resolve them, then hand the result to the album batch page. */
export function PlaylistImportPanel({visible,onOpen}:Props){
 const [text,setText]=React.useState(''),[name,setName]=React.useState('Mi playlist');
 const [busy,setBusy]=React.useState(false),[progress,setProgress]=React.useState<[number,number]|null>(null);
 const [resolved,setResolved]=React.useState<Resolved|null>(null),[message,setMessage]=React.useState('');
 const abort=React.useRef<AbortController|null>(null),alive=React.useRef(true);
 React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
 React.useEffect(()=>{if(!visible)abort.current?.abort();},[visible]);
 const parsed=React.useMemo(()=>parsePlaylistText(text),[text]);

 const resolve=async()=>{
  if(busy||!parsed.entries.length)return;
  const controller=new AbortController();abort.current=controller;
  setBusy(true);setResolved(null);setMessage('');setProgress([0,parsed.entries.length]);
  const result=await resolvePlaylist(parsed.entries,{search:searchArtwork,signal:controller.signal,current:()=>alive.current&&!controller.signal.aborted,progress:(done,total)=>{if(alive.current)setProgress([done,total]);}});
  if(!alive.current)return;
  setBusy(false);setProgress(null);
  if(!result.complete){setMessage('Búsqueda detenida. No se guardó nada.');return;}
  setResolved({name,matches:result.matches,skipped:parsed.skipped,truncated:parsed.truncated});
 };
 const usable=resolved?.matches.filter(m=>m.status==='catalog'||m.status==='direct').length??0;
 const lost=resolved?.matches.filter(m=>m.status==='unresolved'||m.status==='duplicate')??[];
 const direct=resolved?.matches.filter(m=>m.status==='direct').length??0;

 return <details className="playlist-import">
  <summary>Importar lista de canciones</summary>
  <p>Una por línea, como <code>Artista - Título</code>. Máximo {PLAYLIST_IMPORT_MAX} por tanda. Se buscan en el catálogo y, si no aparecen, directamente en tu bot.</p>
  <label htmlFor="playlist-import-name">Nombre de la lista</label>
  <input id="playlist-import-name" value={name} maxLength={120} onChange={event=>setName(event.target.value)} disabled={busy}/>
  <label htmlFor="playlist-import-text">Canciones</label>
  <textarea id="playlist-import-text" rows={8} value={text} onChange={event=>{setText(event.target.value.slice(0,20000));setResolved(null);}} disabled={busy} spellCheck={false} placeholder={'Lana Del Rey - Say Yes To Heaven\nNight Tapes - Swordsman'}/>
  <p role="status">{parsed.entries.length} lista{parsed.entries.length===1?'':'s'} para buscar{parsed.skipped?` · ${parsed.skipped} repetidas o inválidas ignoradas`:''}{parsed.truncated?` · ${parsed.truncated} no caben en esta tanda`:''}.</p>
  <div className="playlist-import-actions">
   <button type="button" onClick={()=>void resolve()} disabled={busy||!parsed.entries.length}>{busy?'Buscando…':'Buscar canciones'}</button>
   {busy&&<button type="button" onClick={()=>abort.current?.abort()}>Cancelar</button>}
  </div>
  {progress&&<p role="status">Buscando {progress[0]}/{progress[1]}… (el catálogo limita el ritmo, tarda un poco)</p>}
  {message&&<p role="status">{message}</p>}
  {resolved&&<div role="status" className="playlist-import-result">
   <p>{usable} lista{usable===1?'':'s'} para descargar{direct?` (${direct} sin ficha del catálogo: se buscarán directo en el bot, con verificación más floja)`:''}. {lost.length} no se pudieron preparar.</p>
   {lost.length>0&&<ul>{lost.map((m,i)=><li key={i}><bdi dir="auto">{m.entry.raw}</bdi> — {m.status==='unresolved'?reasonText[m.reason]:reasonText.duplicate}</li>)}</ul>}
   <button type="button" disabled={!usable} onClick={()=>onOpen(playlistDetail(resolved.name,resolved.matches))}>Abrir lote ({usable})</button>
  </div>}
 </details>;
}
