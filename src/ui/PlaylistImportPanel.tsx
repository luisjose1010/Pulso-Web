import React from 'react';
import type {AlbumDetail} from '../library/album-catalog';
import {searchArtwork} from '../library/catalog-artwork';
import {PLAYLIST_IMPORT_MAX,parsePlaylistText,playlistDetail,resolvePlaylist,type PlaylistMatch} from '../library/playlist-import';
import {loadYoutubePlaylist,youtubeFailureText,youtubeItemsToLines} from '../library/youtube-playlist';
import './playlist-import.css';

interface Props {visible:boolean;onOpen:(detail:AlbumDetail)=>void}
interface Resolved {name:string;matches:readonly PlaylistMatch[];rest:string}

const reasonText:Record<string,string>={'no-artist':'sin artista (usa «Artista - Título»)',invalid:'texto demasiado corto',duplicate:'repetida'};
// The panel unmounts while the batch page is open; keep the draft so the next batch is waiting on return.
const draft={text:'',name:'Mi playlist',link:''};

/** Paste a YouTube link or "Artist - Title" lines, resolve them, then hand them to the album batch page. */
export function PlaylistImportPanel({visible,onOpen}:Props){
 const [text,setTextState]=React.useState(draft.text),[name,setNameState]=React.useState(draft.name),[link,setLinkState]=React.useState(draft.link);
 const setText=(value:string)=>{draft.text=value;setTextState(value);};
 const setName=(value:string)=>{draft.name=value;setNameState(value);};
 const setLink=(value:string)=>{draft.link=value;setLinkState(value);};
 const [busy,setBusy]=React.useState(false),[progress,setProgress]=React.useState<[number,number]|null>(null);
 const [reading,setReading]=React.useState(false),[linkMessage,setLinkMessage]=React.useState('');
 const [resolved,setResolved]=React.useState<Resolved|null>(null),[message,setMessage]=React.useState('');
 const abort=React.useRef<AbortController|null>(null),alive=React.useRef(true);
 React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
 React.useEffect(()=>{if(!visible)abort.current?.abort();},[visible]);
 const parsed=React.useMemo(()=>parsePlaylistText(text),[text]);

 const readLink=async()=>{
  if(reading||busy||!link.trim())return;
  const controller=new AbortController();abort.current=controller;
  setReading(true);setLinkMessage('Leyendo la playlist…');setResolved(null);setMessage('');
  const result=await loadYoutubePlaylist(link,{signal:controller.signal});
  if(!alive.current)return;
  setReading(false);
  if(!result.ok){setLinkMessage(result.reason==='cancelled'?'Lectura cancelada.':youtubeFailureText[result.reason]);return;}
  const {lines,ignored}=youtubeItemsToLines(result.value.items);
  if(result.value.name)setName(result.value.name);
  setText(lines.join('\n'));
  setLinkMessage(`${lines.length} canciones leídas${ignored?` (${ignored} ignoradas por no parecer canciones)`:''}${result.value.truncated?`; la playlist tiene ${result.value.total??'más'} y solo se leen las primeras 1500`:''}. Se buscan de ${PLAYLIST_IMPORT_MAX} en ${PLAYLIST_IMPORT_MAX}.`);
 };
 const resolve=async()=>{
  if(busy||reading||!parsed.entries.length)return;
  const controller=new AbortController();abort.current=controller;
  setBusy(true);setResolved(null);setMessage('');setProgress([0,parsed.entries.length]);
  const rest=parsed.remaining;
  const result=await resolvePlaylist(parsed.entries,{search:searchArtwork,signal:controller.signal,current:()=>alive.current&&!controller.signal.aborted,progress:(done,total)=>{if(alive.current)setProgress([done,total]);}});
  if(!alive.current)return;
  setBusy(false);setProgress(null);
  if(!result.complete){setMessage('Búsqueda detenida. No se guardó nada.');return;}
  setResolved({name,matches:result.matches,rest});
 };
 const usable=resolved?.matches.filter(m=>m.status==='catalog'||m.status==='direct').length??0;
 const lost=resolved?.matches.filter(m=>m.status==='unresolved'||m.status==='duplicate')??[];
 const direct=resolved?.matches.filter(m=>m.status==='direct').length??0;
 const remainingCount=parsed.truncated;

 return <details className="playlist-import">
  <summary>Importar lista de canciones</summary>
  <label htmlFor="playlist-import-link">Enlace de una playlist de YouTube (opcional)</label>
  <div className="playlist-import-actions">
   <input id="playlist-import-link" type="url" inputMode="url" value={link} maxLength={300} onChange={event=>setLink(event.target.value)} disabled={busy||reading} placeholder="https://www.youtube.com/playlist?list=…"/>
   <button type="button" onClick={()=>void readLink()} disabled={busy||reading||!link.trim()}>{reading?'Leyendo…':'Cargar títulos'}</button>
   {reading&&<button type="button" onClick={()=>abort.current?.abort()}>Cancelar</button>}
  </div>
  {linkMessage&&<p role="status">{linkMessage}</p>}
  <p>O pega canciones, una por línea, como <code>Artista - Título</code>. Máximo {PLAYLIST_IMPORT_MAX} por tanda. Se buscan en el catálogo y, si no aparecen, directamente en tu bot.</p>
  <label htmlFor="playlist-import-name">Nombre de la lista</label>
  <input id="playlist-import-name" value={name} maxLength={120} onChange={event=>setName(event.target.value)} disabled={busy}/>
  <label htmlFor="playlist-import-text">Canciones</label>
  <textarea id="playlist-import-text" rows={8} value={text} onChange={event=>{setText(event.target.value.slice(0,200000));setResolved(null);}} disabled={busy||reading} spellCheck={false} placeholder={'Lana Del Rey - Say Yes To Heaven\nNight Tapes - Swordsman'}/>
  <p role="status">{parsed.entries.length} lista{parsed.entries.length===1?'':'s'} para buscar en esta tanda{parsed.skipped?` · ${parsed.skipped} repetidas o inválidas ignoradas`:''}{remainingCount?` · ${remainingCount} quedan para la siguiente tanda`:''}.</p>
  <div className="playlist-import-actions">
   <button type="button" onClick={()=>void resolve()} disabled={busy||reading||!parsed.entries.length}>{busy?'Buscando…':'Buscar canciones'}</button>
   {busy&&<button type="button" onClick={()=>abort.current?.abort()}>Cancelar</button>}
  </div>
  {progress&&<p role="status">Buscando {progress[0]}/{progress[1]}… (el catálogo limita el ritmo, tarda un poco)</p>}
  {message&&<p role="status">{message}</p>}
  {resolved&&<div role="status" className="playlist-import-result">
   <p>{usable} lista{usable===1?'':'s'} para descargar{direct?` (${direct} sin ficha del catálogo: se buscarán directo en el bot, con verificación más floja)`:''}. {lost.length} no se pudieron preparar.</p>
   {lost.length>0&&<ul>{lost.map((m,i)=><li key={i}><bdi dir="auto">{m.entry.raw}</bdi> — {m.status==='unresolved'?reasonText[m.reason]:reasonText.duplicate}</li>)}</ul>}
   <button type="button" disabled={!usable} onClick={()=>{draft.text=resolved.rest;onOpen(playlistDetail(resolved.name,resolved.matches));}}>Abrir lote ({usable}){resolved.rest?' · el resto queda preparado':''}</button>
  </div>}
 </details>;
}
