import {formatStorageProgress} from '../library/storage-format';
import React from 'react';
import './selected-song-actions.css';

export interface SelectedSongActionsProps {
 title:string; artist:string|null; status:string|null; error:string|null;
 pending:boolean; progress?:{bytes:number;total:number}|null;
 inLibrary:boolean; canAdd:boolean; canPlay:boolean;
 playlists:readonly {id:string;name:string}[]; canAddToPlaylist:boolean;
 onAdd:()=>void; onPlay:()=>void; onAddToPlaylist:(id:string)=>void;
 onCancel:()=>void; current:()=>boolean;
}

/** Product state and side effects belong to the caller. */
export function SelectedSongActions(props:SelectedSongActionsProps){
 const committed=React.useRef<SelectedSongActionsProps|null>(null);
 const [open,setOpen]=React.useState(false),[chosen,setChosen]=React.useState('');
 const select=React.useRef<HTMLInputElement>(null);
 const trigger=React.useRef<HTMLButtonElement>(null);
 const id=React.useId();
 React.useLayoutEffect(()=>{committed.current=props;return()=>{committed.current=null;};});
 React.useLayoutEffect(()=>{if(open) select.current?.focus();},[open]);
 let expired=false;
 const active=()=>{if(expired)return false;if(committed.current!==props||!props.current()){expired=true;return false;}return true;};
 const close=()=>{setOpen(false);trigger.current?.focus();};
 const progress=props.progress;
 const validProgress=progress&&Number.isFinite(progress.bytes)&&Number.isFinite(progress.total)&&progress.total>0&&progress.bytes>=0;
 const feedback=[props.status,validProgress?formatStorageProgress(progress.bytes,progress.total):null].filter((value,index,all)=>!!value&&all.indexOf(value)===index).join('. ');
 return <section className="selected-song-actions" aria-labelledby={`${id}-title`}>
  <h3 id={`${id}-title`}><bdi dir="auto">{props.title}</bdi></h3>
  {props.artist&&<p><bdi dir="auto">{props.artist}</bdi></p>}
  <div className="selected-song-feedback" role="status" aria-live="polite" aria-atomic="true">{feedback}</div>
  {props.error&&<p role="alert">{props.error}</p>}
  {validProgress&&<progress aria-label="Progreso de la canción" value={Math.min(progress.bytes,progress.total)} max={progress.total}/>}
  <div className="selected-song-buttons">
   <button type="button" disabled={props.inLibrary||!props.canAdd} onClick={()=>{if(active()&&!props.inLibrary&&props.canAdd)props.onAdd();}}>{props.inLibrary?'En tu biblioteca':'Agregar canción'}</button>
   {props.canPlay&&<button type="button" onClick={()=>{if(active()&&props.canPlay)props.onPlay();}}>Reproducir</button>}
   <button ref={trigger} type="button" disabled={!props.canAddToPlaylist} aria-expanded={open} aria-controls={open?`${id}-playlist`:undefined} onClick={()=>{if(active()&&props.canAddToPlaylist){if(open)close();else{setChosen('');setOpen(true);}}}}>Añadir a playlist</button>
   {props.pending&&<button type="button" onClick={()=>{if(active()&&props.pending)props.onCancel();}}>Cancelar</button>}
  </div>
  {open&&<div id={`${id}-playlist`} className="selected-song-playlist" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close();}}}>
   {props.playlists.length===0?<p>No hay playlists disponibles.</p>:<form onSubmit={event=>{event.preventDefault();if(active()&&props.canAddToPlaylist&&chosen&&props.playlists.some(list=>list.id===chosen)){props.onAddToPlaylist(chosen);close();}}}>
    <fieldset><legend>Elige una playlist</legend>{props.playlists.map((list,index)=><label key={list.id}><input ref={index===0?select:undefined} type="radio" name={`${id}-playlist-choice`} value={list.id} checked={chosen===list.id} disabled={!props.canAddToPlaylist} onChange={()=>{if(active()&&props.canAddToPlaylist)setChosen(list.id);}}/>{list.name}</label>)}</fieldset>
    <button type="submit" disabled={!props.canAddToPlaylist||!props.playlists.some(list=>list.id===chosen)}>Confirmar</button>
   </form>}
   <button type="button" onClick={close}>Cerrar</button>
  </div>}
 </section>;
}
