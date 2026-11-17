import {BackButton} from './BackButton';
import {useMemo,useRef,useState,type ReactNode} from 'react';
import type {StorageGroup} from '../library/storage-groups';
import {CollectionCover} from './CollectionCover';
import type {StorageSummary} from '../library/storage-summary';
import {formatStorageMB} from '../library/storage-format';

export interface DownloadItem {id:string;title:string;artist:string;bytes:number;protected:boolean;removable?:boolean;action:ReactNode}
export function StorageSettings({summary,items,groups=[],onRemove,cacheCopies,canClean,onClean,onCheck,canCheck}:{summary:StorageSummary;items:DownloadItem[];groups?:StorageGroup[];onRemove?:(ids:string[],title:string,button:HTMLButtonElement)=>void;cacheCopies:number;canClean:boolean;onClean:(button:HTMLButtonElement)=>void;onCheck:()=>void;canCheck:boolean}){
 const [managing,setManaging]=useState(false),[query,setQuery]=useState(''),[page,setPage]=useState(0),[groupId,setGroupId]=useState<string|null>(null),[selection,setSelection]=useState<Set<string>>(new Set());
 const opener=useRef<HTMLButtonElement>(null),heading=useRef<HTMLHeadingElement>(null);
 const group=groups.find(g=>g.id===groupId),term=query.trim().toLocaleLowerCase();
 const filtered=useMemo(()=>items.filter(item=>(group?.assetIds.includes(item.id)??false)&&`${item.title} ${item.artist}`.toLocaleLowerCase().includes(term)),[items,group,term]);
 const visibleGroups=groups.filter(g=>`${g.title} ${g.subtitle}`.toLocaleLowerCase().includes(term));
 const count=group?filtered.length:visibleGroups.length,pages=Math.max(1,Math.ceil(count/8)),current=Math.min(page,pages-1);
 const eligible=items.filter(i=>group?.assetIds.includes(i.id)&&i.removable&&!i.protected);
 const selected=eligible.filter(i=>selection.has(i.id));
 function focus(){requestAnimationFrame(()=>heading.current?.focus({preventScroll:true}));}
 function move(next:number){setPage(next);focus();}
 function openGroup(id:string|null){setGroupId(id);setQuery('');setPage(0);setSelection(new Set());focus();}
 return <section className="settings-storage settings-group" aria-label="Almacenamiento">
  {managing?<>
   <BackButton className="settings-back" onClick={()=>{if(groupId)openGroup(null);else{setManaging(false);setQuery('');setPage(0);requestAnimationFrame(()=>opener.current?.focus());}}}>{groupId?'Todas las descargas':'Volver al resumen'}</BackButton>
   <h3 ref={heading} tabIndex={-1}>{group?.title??'Tus descargas'}</h3>
   <p className="settings-note">{group?'Selecciona qué descargas quitar. Tu biblioteca y tus playlists se conservan.':'Organizadas por playlists y álbumes. Una canción puede aparecer en varios grupos, pero ocupa espacio una sola vez.'}</p>
   <label className="settings-download-search">{group?'Buscar en este grupo':'Buscar playlist o álbum'}<input type="search" value={query} placeholder={group?'Canción o artista':'Nombre de la colección'} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
   {group&&onRemove&&<div className="storage-selection"><button disabled={!eligible.length||!canClean} onClick={()=>setSelection(selected.length===eligible.length?new Set():new Set(eligible.map(i=>i.id)))}>{selected.length===eligible.length&&eligible.length?'Deseleccionar todas':'Seleccionar todas'}</button><button disabled={!selected.length||!canClean} onClick={e=>onRemove(selected.map(i=>i.id),group.title,e.currentTarget)}>Quitar seleccionadas{selected.length?` (${selected.length})`:''}</button><button disabled={!eligible.length||!canClean} onClick={e=>onRemove(eligible.map(i=>i.id),group.title,e.currentTarget)}>Quitar todas las descargas</button></div>}
   <p className="settings-note" role="status">{count} {group?'archivos':'colecciones'}{group?` · ${formatStorageMB(group.bytes)}`:''}{pages>1?` · Página ${current+1} de ${pages}`:''}</p>
   {group?<ul className="storage-downloads">{filtered.slice(current*8,current*8+8).map(item=><li key={item.id}>{onRemove&&<input type="checkbox" aria-label={`Seleccionar ${item.title}`} disabled={!item.removable||item.protected||!canClean} checked={selected.some(i=>i.id===item.id)} onChange={e=>setSelection(old=>{const next=new Set(old);if(e.target.checked)next.add(item.id);else next.delete(item.id);return next;})}/>}<div><strong>{item.title}</strong><span>{item.artist}</span><small>{formatStorageMB(item.bytes)}{item.protected?' · En uso':''}</small></div>{!onRemove&&item.action}</li>)}</ul>:<ul className="storage-groups">{visibleGroups.slice(current*8,current*8+8).map(g=><li key={g.id}><button onClick={()=>openGroup(g.id)}><span className="storage-group-cover"><CollectionCover trackIds={g.trackIds} favorite={g.favorite}/></span><span className="storage-group-label"><strong>{g.title}</strong><span>{g.subtitle}</span><small>{g.assetIds.length} {g.assetIds.length===1?'descarga':'descargas'} · {formatStorageMB(g.bytes)}</small></span><span aria-hidden="true">›</span></button></li>)}</ul>}
   {!count&&<p>{query?'No hay resultados que coincidan.':group?'Ya no hay descargas en este grupo.':'Todavía no hay música descargada en este navegador.'}</p>}
   {pages>1&&<nav className="settings-pagination" aria-label="Páginas de descargas"><button disabled={current===0} onClick={()=>move(current-1)}>Anterior</button><span>{current+1} / {pages}</span><button disabled={current===pages-1} onClick={()=>move(current+1)}>Siguiente</button></nav>}
  </>:<>
   <div className="settings-storage__heading"><div><p className="settings-eyebrow">EN ESTE DISPOSITIVO</p><h3>Almacenamiento</h3></div><span className="settings-storage__count">{items.length} archivos</span></div>
   <p className="settings-storage__total">{formatStorageMB(summary.knownAudioBytes)} <span>de audio</span></p>
   <div className="storage-summary" aria-label="Resumen del almacenamiento"><svg className="storage-summary__segments" viewBox="0 0 100 1" preserveAspectRatio="none" role="img" aria-label={`Descargas ${formatStorageMB(summary.savedAudioBytes)}; caché ${formatStorageMB(summary.cachedAudioBytes)}`}><rect className="storage-summary__saved" width={summary.knownAudioBytes?summary.savedAudioBytes/summary.knownAudioBytes*100:0} height="1"/><rect className="storage-summary__cache" x={summary.knownAudioBytes?summary.savedAudioBytes/summary.knownAudioBytes*100:0} width={summary.knownAudioBytes?summary.cachedAudioBytes/summary.knownAudioBytes*100:0} height="1"/></svg><dl className="settings-storage__metrics"><div><dt>Descargas conservadas</dt><dd>{formatStorageMB(summary.savedAudioBytes)}</dd></div><div><dt>Caché de escucha</dt><dd>{formatStorageMB(summary.cachedAudioBytes)}</dd></div></dl></div>
   <div className="settings-storage__actions"><button ref={opener} onClick={()=>{setManaging(true);requestAnimationFrame(()=>heading.current?.focus());}}>Gestionar descargas</button><button disabled={!canClean||cacheCopies===0} onClick={e=>onClean(e.currentTarget)}>Limpiar caché de escucha</button></div>
   <p className="settings-note">La caché contiene escuchas no guardadas. Se conservan tu biblioteca y los archivos en uso.</p>
   <details className="settings-storage__details"><summary>Espacio del navegador y revisión de archivos</summary><p>{summary.estimatedPercent===null?'El navegador no informa de su cuota disponible.':`${formatStorageMB(summary.estimatedUsage)} usados de ${formatStorageMB(summary.estimatedQuota)} de cuota estimada.`} Esta cuota incluye la app y otros datos; no equivale al espacio libre del teléfono.</p><p>Se cuenta cada archivo una sola vez. La caché de la aplicación Telegram se gestiona por separado.</p><button disabled={!canCheck} onClick={onCheck}>Comprobar archivos locales</button></details>
  </>}
 </section>;
}
