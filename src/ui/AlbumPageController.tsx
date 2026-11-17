import {catalogTransportMode} from '../library/catalog-fetch';
import type {OrderedProvider} from '../library/ordered-bot-acquisition';
import React from 'react';
import {AlbumCatalog,albumHintsFromSongs,type AlbumDetail,type AlbumEdition,type AlbumFailure,type AlbumStage} from '../library/album-catalog';
import {musicCatalogKey} from '../library/music-search-catalog';
import {acquireAlbum,albumTrackChoice,type AlbumRow,type AlbumProgress} from '../library/album-acquisition';
import {resolveAlbum} from '../library/album-resolution';
import type {SongChoice,SongPlaybackAttempt,SongManagement,SongCopyInspection} from '../library/selected-song';
import type {TelegramSessionClient} from '../telegram/session-client';
import './album-page.css';
import {CatalogArtwork} from './CatalogArtwork';
const catalog=new AlbumCatalog((...args)=>fetch(...args));
const detailKey=(detail:AlbumDetail)=>JSON.stringify(detail.tracks.map(track=>albumTrackChoice(track,detail.edition.title))); 
export interface AlbumCoordinator {running:boolean;uncertainTracks:Set<number>;remoteClock:{settledAt:number};rows:Map<number,{key:string;rows:AlbumRow[]}>;listeners:Set<()=>void>}
interface Props {coordinator:AlbumCoordinator;captureInspection?:()=>SongCopyInspection|null;selectedKey:string|null;libraryTrackIds?:ReadonlySet<string>;title:string;artist:string|null;editionId?:number;/** Playlist import: a ready-made edition, no catalogue lookup. */preloaded?:AlbumDetail;artworkUrl?:string;searchBatch?:{data:unknown;pending:boolean};backLabel?:string;scope:string;visible:boolean;client:TelegramSessionClient|null;revision:number|undefined;provider:string|null;providers:readonly OrderedProvider[];capture:()=>SongPlaybackAttempt|null;management:(id:string)=>SongManagement|null;onBack:()=>void;onChoose:(choice:SongChoice)=>void;songActions:React.ReactNode}
const metadataIdentity=(props:Props)=>JSON.stringify([props.title,props.artist,props.editionId??null,props.scope]);
const catalogError=(reason:AlbumFailure,detail:boolean,stage?:AlbumStage,httpStatus?:number)=>{
 const prefix=detail?'No se pudo verificar la lista completa de pistas.':'No se pudo consultar el catálogo de álbumes.';
 const message=reason==='rate-limited'?'El catálogo ha limitado temporalmente las consultas.':reason==='timeout'?'La consulta tardó demasiado.':reason==='network'||reason==='http'?'Comprueba la conexión e inténtalo de nuevo.':'La respuesta del catálogo no se pudo verificar.';
 const entry=location.pathname.match(/\/releases\/([a-f0-9]{16})\.html$/)?.[1]??'local';
 const diagnostic=[detail?'album-detail':stage??'album-search',catalogTransportMode(),reason,...(Number.isInteger(httpStatus)&&httpStatus!>=400&&httpStatus!<=599?[String(httpStatus)]:[]),entry].join(' · ');
 return `${prefix} ${message} Diagnóstico: ${diagnostic}.`;
};
export function AlbumPageController(props:Props){
 const relevantBatch=props.editionId?undefined:props.searchBatch;
 const [inspectionRevision,bumpInspection]=React.useReducer(n=>n+1,0);
 const [inspecting,setInspecting]=React.useState(false),[copies,setCopies]=React.useState<Record<string,{state:'available'|'missing'|'unknown';trackId:string|null;inLibrary:boolean|null}>>({});
 const inspectionTail=React.useRef<Promise<void>>(Promise.resolve()),inspectedEdition=React.useRef<AlbumDetail|null>(null);
 const loadedMetadata=React.useRef<string|null>(null);
 const [progress,setProgress]=React.useState<AlbumProgress|null>(null),[busy,setBusy]=React.useState(false);
 const [,refreshCoordinator]=React.useReducer(n=>n+1,0);
 const rows=React.useRef<AlbumRow[]>([]),flight=React.useRef<{attempt:SongPlaybackAttempt}|null>(null);
 const [editions,setEditions]=React.useState<AlbumEdition[]>([]),[detail,setDetail]=React.useState<AlbumDetail|null>(null),[status,setStatus]=React.useState('Buscando ediciones…');
 const [retryVersion,retryMetadata]=React.useReducer(n=>n+1,0),[retryTarget,setRetryTarget]=React.useState<AlbumEdition|null|undefined>(undefined);
 React.useEffect(()=>{const listener=()=>{refreshCoordinator();if(!props.coordinator.running&&!flight.current&&detail){const saved=props.coordinator.rows.get(detail.edition.id);if(saved&&saved.key===detailKey(detail)){rows.current=saved.rows.map(r=>({...r}));setProgress({rows:rows.current,message:'Comprueba las copias antes de continuar.'});}}};props.coordinator.listeners.add(listener);return()=>{props.coordinator.listeners.delete(listener);};},[props.coordinator,detail]);
 const latest=React.useRef(props),committed=React.useRef<object|null>(null),mounted=React.useRef(false),op=React.useRef<AbortController|null>(null),metadata=React.useRef<AbortController|null>(null),heading=React.useRef<HTMLHeadingElement>(null);
 React.useLayoutEffect(()=>{latest.current=props;mounted.current=true;heading.current?.focus();return()=>{mounted.current=false;};},[]);
 const renderToken={};
 React.useLayoutEffect(()=>{latest.current=props;committed.current=renderToken;return()=>{if(committed.current===renderToken)committed.current=null;};});
 const active=()=>mounted.current&&committed.current===renderToken&&props.visible;
 const stop=()=>{op.current?.abort();};
 React.useEffect(()=>()=>{metadata.current?.abort();op.current?.abort();},[props.scope,props.client,props.revision,props.visible]);
 React.useEffect(()=>{
  if(!props.visible)return;
  const identity=metadataIdentity(props);
  if(detail&&loadedMetadata.current===identity)return;
  if(props.preloaded){const ready=props.preloaded;loadedMetadata.current=identity;setEditions([]);setRetryTarget(undefined);setDetail(ready);setCopies({});inspectedEdition.current=null;const saved=props.coordinator.rows.get(ready.edition.id),compatible=saved?.key===detailKey(ready);rows.current=compatible?saved.rows.map(r=>({...r})):ready.tracks.map(()=>({state:'unattempted' as const,trackId:null,confirmed:false,message:''}));setProgress(compatible?{rows:rows.current,message:'Comprueba las copias antes de continuar.'}:null);setStatus('');return;}
  const abort=new AbortController();metadata.current=abort;setDetail(null);setEditions([]);setRetryTarget(undefined);setStatus('Buscando ediciones…');
  const live=()=>mounted.current&&metadata.current===abort&&!abort.signal.aborted&&latest.current.visible&&metadataIdentity(latest.current)===identity;
  if(props.editionId){void load({id:props.editionId,title:props.title,artist:props.artist??'',trackCount:0,releaseDate:null},abort,live);return()=>abort.abort();}
  if(relevantBatch?.pending)return()=>abort.abort();
  // Hints identify candidates only; the complete track list always comes from
  // the authoritative edition lookup. Never infer a full album from the batch.
  const hints=props.artist?albumHintsFromSongs(relevantBatch?.data).filter(h=>h.artist&&musicCatalogKey(h.title)===musicCatalogKey(props.title)&&musicCatalogKey(h.artist)===musicCatalogKey(props.artist!)):[];
  if(hints.length){const candidates:AlbumEdition[]=hints.map(h=>({id:h.id,title:h.title,artist:h.artist!,trackCount:0,releaseDate:null,...(h.artworkUrl?{artworkUrl:h.artworkUrl}:{})}));setEditions(candidates);if(candidates.length===1)void load(candidates[0],abort,live);else setStatus('Elige una edición para ver sus pistas.');return()=>abort.abort();}
  void resolveAlbum(catalog,props.title,props.artist,{signal:abort.signal,current:live}).then(async result=>{
   if(!live())return;if(!result.ok){if(result.reason!=='cancelled'){setStatus(catalogError(result.reason,false,result.stage,result.httpStatus));setRetryTarget(null);}return;}
   const candidates=result.value;
   setEditions(candidates);if(candidates.length===1&&props.artist){await load(candidates[0],abort,live);return;}
   setStatus(candidates.length?'Elige una edición para ver sus pistas.':'No se encontraron ediciones compatibles en los resultados disponibles.');
  });
  return()=>abort.abort();
 },[props.title,props.artist,props.editionId,props.scope,props.visible,relevantBatch?.pending,relevantBatch?.data,retryVersion,props.preloaded]);
 async function load(edition:AlbumEdition,abort:AbortController,live:()=>boolean){
  setRetryTarget(undefined);setStatus('Cargando pistas…');const result=await catalog.load(edition.id,{signal:abort.signal,current:live});if(!live())return;
  if(!result.ok){if(result.reason!=='cancelled'){setStatus(catalogError(result.reason,true,undefined,result.httpStatus));setRetryTarget(edition);}return;}loadedMetadata.current=metadataIdentity(props);setDetail(result.value);setCopies({});inspectedEdition.current=null;const saved=props.coordinator.rows.get(result.value.edition.id),compatible=saved?.key===detailKey(result.value);rows.current=compatible?saved.rows.map(r=>({...r})):result.value.tracks.map(()=>({state:'unattempted',trackId:null,confirmed:false,message:''}));setProgress(compatible?{rows:rows.current,message:'Comprueba las copias antes de continuar.'}:null);setStatus('');
 }
 const chooseEdition=(edition:AlbumEdition)=>{if(!active())return;stop();metadata.current?.abort();const abort=new AbortController();metadata.current=abort;setDetail(null);const identity=metadataIdentity(props);const live=()=>mounted.current&&metadata.current===abort&&!abort.signal.aborted&&latest.current.visible&&metadataIdentity(latest.current)===identity;void load(edition,abort,live);};
 React.useEffect(()=>{if(op.current&&!op.current.signal.aborted&&!props.visible)stop();});
 React.useEffect(()=>{
  if(!detail||!props.visible){inspectedEdition.current=null;setInspecting(false);return;}
  const abort=new AbortController(),first=inspectedEdition.current!==detail;inspectedEdition.current=detail;
  if(first)setCopies({});
  const targets=first?detail.tracks:detail.tracks.filter(t=>albumTrackChoice(t,detail.edition.title).id===props.selectedKey);
  setInspecting(true);
  const run=async()=>{
   if(abort.signal.aborted)return;
   const inspector=latest.current.captureInspection?.();if(!inspector)return;
   for(const track of targets){
    if(abort.signal.aborted||!mounted.current||!latest.current.visible)break;
    const choice=albumTrackChoice(track,detail.edition.title);
    let value:{state:'available'|'missing'|'unknown';trackId:string|null;inLibrary:boolean|null}={state:'unknown',trackId:null,inLibrary:null};
    try{if(inspector.current())value=await inspector.inspect(choice,abort.signal);}catch{/* Unknown is not a verified copy. */}
    if(abort.signal.aborted||!mounted.current)break;
    setCopies(previous=>({...previous,[choice.id]:value}));
   }
  };
  const task=inspectionTail.current.catch(()=>{}).then(run);inspectionTail.current=task;
  void task.finally(()=>{if(!abort.signal.aborted&&mounted.current)setInspecting(false);});
  return()=>abort.abort();
 },[detail,props.scope,props.visible,props.selectedKey,inspectionRevision]);
 const addAlbum=()=>{
  if(!active()||flight.current||props.coordinator.running||inspecting||!detail)return;
  const attempt=props.capture();if(!attempt){setProgress({rows:rows.current,message:'La biblioteca está ocupada o requiere revisión en Almacenamiento.'});return;}
  const abort=new AbortController(),identity={attempt};op.current=abort;flight.current=identity;props.coordinator.running=true;for(const notify of props.coordinator.listeners)notify();setBusy(true);
  const scope=props.scope,client=props.client,revision=props.revision,provider=props.provider,providers=props.providers.map(p=>({...p})), snapshot=detail;
  const current=()=>mounted.current&&flight.current===identity&&latest.current.visible&&latest.current.scope===scope&&latest.current.client===client&&latest.current.revision===revision&&latest.current.provider===provider;
  void acquireAlbum({resilient:!!props.preloaded,detail:snapshot,attempt,client,provider,providers,revision,management:props.management,signal:abort.signal,current,rows:rows.current,remoteClock:props.coordinator.remoteClock,uncertainTracks:props.coordinator.uncertainTracks,update:value=>{if(flight.current!==identity)return;rows.current=value.rows;props.coordinator.rows.set(snapshot.edition.id,{key:detailKey(snapshot),rows:value.rows.map(r=>({...r}))});if(mounted.current)setProgress(value);}}).finally(()=>{if(flight.current===identity){op.current=null;props.coordinator.running=false;for(const notify of props.coordinator.listeners)notify();flight.current=null;if(mounted.current){setBusy(false);inspectedEdition.current=null;bumpInspection();}}});
 };
 React.useEffect(()=>{if(!op.current||op.current.signal.aborted||!flight.current)return;let valid=false;try{valid=props.visible&&flight.current.attempt.current();}catch{/* fail closed */}if(!valid)stop();});
 const renderedOperation=op.current;
 return <section className="album-page" aria-labelledby="album-page-heading">
  <button type="button" onClick={()=>{if(active()&&op.current===renderedOperation){renderedOperation?.abort();props.onBack();}}}>{props.backLabel??'Volver a búsqueda'}</button>
  <div className="album-hero"><CatalogArtwork className="album-art" url={detail?.edition.artworkUrl??props.artworkUrl??(editions.length===1?editions[0].artworkUrl:undefined)} enabled={props.visible}/><div><p className="catalog-eyebrow">ÁLBUM</p><h2 id="album-page-heading" ref={heading} tabIndex={-1}>{detail?.edition.title??props.title}</h2><p className="album-artist">{detail?.edition.artist??props.artist}</p>{detail&&<p>{detail.tracks.length} pistas · {new Set(detail.tracks.map(t=>t.disc)).size} discos</p>}</div></div>

  {status&&<p role="status">{status}</p>}
  {retryTarget!==undefined&&<button type="button" onClick={()=>{if(!active())return;if(retryTarget)chooseEdition(retryTarget);else retryMetadata();}}>Reintentar consulta</button>}
  {editions.length>0&&(!detail||editions.length>1)&&<section aria-label="Ediciones"><h3>Ediciones</h3><ul>{editions.map(e=><li key={e.id}><button type="button" disabled={busy||inspecting||props.coordinator.running} onClick={()=>chooseEdition(e)}>{e.title} · {e.artist} · {e.releaseDate?.slice(0,10)??'fecha desconocida'}{e.trackCount?` · ${e.trackCount} pistas`:''}</button></li>)}</ul></section>}
  {detail&&<><div className="album-actions"><button type="button" disabled={busy||inspecting||props.coordinator.running} onClick={addAlbum}>{progress?'Continuar álbum':'Añadir álbum'}</button>{busy&&<button type="button" onClick={()=>{if(active()&&op.current===renderedOperation)renderedOperation?.abort();}}>Cancelar incorporación</button>}</div>
   {progress&&<div role="status"><p>{progress.message}</p><p>{progress.rows.filter(r=>r.confirmed).length}/{progress.rows.length} en Biblioteca · {progress.rows.filter(r=>r.state==='reused').length} reutilizadas · {progress.rows.filter(r=>r.state==='downloaded').length} descargadas · {progress.rows.filter(r=>r.state==='failed').length} fallidas · {progress.rows.filter(r=>r.state==='unattempted').length} sin intentar · {progress.rows.filter(r=>r.state==='uncertain').length} requieren revisión</p></div>}
   {inspecting&&<p role="status">Comprobando copias locales…</p>}{props.songActions}<h3 className="album-tracks-heading">Canciones</h3><ol className="album-tracks">{detail.tracks.map(t=><li key={`${t.disc}:${t.position}:${t.trackId}`}><button type="button" disabled={busy||inspecting||props.coordinator.running} onClick={()=>{if(active()&&!flight.current&&!props.coordinator.running&&!inspecting){props.onChoose(albumTrackChoice(t,detail.edition.title));}}}><span className="album-track-number" aria-label={`Disco ${t.disc}, pista ${t.position}`}>{t.position}</span><span className="album-track-copy"><strong><bdi dir="auto">{t.title}</bdi></strong><span><bdi dir="auto">{t.artist}</bdi></span></span></button>{(()=>{const copy=copies[albumTrackChoice(t,detail.edition.title).id],row=progress?.rows[detail.tracks.indexOf(t)],trackId=row?.trackId??copy?.trackId,member=trackId&&props.libraryTrackIds?props.libraryTrackIds.has(trackId):copy?.inLibrary===true;return <span className="album-track-badges">{busy&&row?.confirmed||copy?.state==='available'?'Descargada':copy?.state==='missing'?'Sin descarga':'Copia sin comprobar'}{member?' · En Biblioteca':''}</span>;})()}{progress&&<span className="album-track-message">{progress.rows[detail.tracks.indexOf(t)]?.message||'Sin intentar'}</span>}</li>)}</ol></>}

   <details className="catalog-sources"><summary>Fuente de los metadatos</summary><p>Catálogo <a href="https://www.apple.com/itunes/" target="_blank" rel="noopener noreferrer">iTunes US</a>.</p></details>
 </section>;
}
