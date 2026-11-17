import {resolveSearchSingle} from '../library/music-search-single';
import type {CatalogId} from '../library/catalog-id';
import {formatStorageMB} from '../library/storage-format';
import {AUDIO_FILE_MAX_BYTES} from '../storage/audio-limits';
import {registerUpdateBlocker} from '../service-worker/update-blockers';
import {acquireFromOrderedBots,orderedProviders,acquisitionFailureText} from '../library/ordered-bot-acquisition';
import {SelectedSongActions} from './SelectedSongActions';
import type {BotDownloadedAudio} from '../telegram/bot-search-protocol';
import React from 'react';
import type {Track,Playlist} from '../library/library';
import {createMusicSuggestionsClient,normalizeMusicSuggestionsQuery,type MusicSuggestion} from '../library/music-suggestions';
import type {TelegramSessionClient,BotsSnapshot,BotSearchSnapshot} from '../telegram/session-client';
import type {SessionState} from '../telegram/session-protocol';
import {parseBotSearchTarget,BOT_SEARCH_LIMIT_DIAGNOSTICS,isBotSearchLimitError,type BotSearchLimitError,type BotSearchTarget,type BotSearchRow,type BotSearchError} from '../telegram/bot-search-protocol';
import {musicSearchCatalog} from '../library/music-search-catalog';
import {compatibleSongMetadata} from '../library/song-copy-status';
import {searchArtwork,songArtwork} from '../library/catalog-artwork';
import {samePendingSong,songChoiceKey,readSongAliasKeys,rememberSongAlias,type SongChoice,type SongPlaybackAttempt,type SongManagement,type SongCopyInspection} from '../library/selected-song';
import {MusicSearchPanel,type MusicSearchResultRow} from './MusicSearchPanel';
import {albumCoordinator} from '../library/album-download';
import {AlbumPageController} from './AlbumPageController';
import {ArtistPage} from './ArtistCatalogView';
import {AlbumCatalog,albumHintsFromSongs,catalogSongsFromBatch,type AlbumDetail,type AlbumEdition,type CatalogArtist} from '../library/album-catalog';
import {PlaylistImportPanel} from './PlaylistImportPanel';

// One RAM-only transport per document, including cooldown across account/scope changes.
// Construction performs no IO. Each mounted view owns only its request and AbortSignal.
const suggestionsClient=createMusicSuggestionsClient();
const metadataCatalog=new AlbumCatalog((...args)=>fetch(...args));
const pendingArtworkBatch={data:null,pending:true} as const;
// Retain unresolved album delivery across navigation and account/scope remounts.
interface Props {
 captureSongPlayback?:()=>SongPlaybackAttempt|null;captureSongDownload?:()=>SongPlaybackAttempt|null;captureSongCopyInspection?:()=>SongCopyInspection|null;
 libraryTrackIds?:ReadonlySet<string>;playlists?:readonly Playlist[];playerTrackId?:string|null;playerPlaying?:boolean;captureSongManagement?:(id:string)=>SongManagement|null;
 visible:boolean;scopeKey:string;client:TelegramSessionClient|null;phase:SessionState['phase'];
 captureDownloadSave?:()=>((audio:BotDownloadedAudio,signal:AbortSignal,onProgress:(bytes:number)=>void)=>Promise<'saved'|'failed'|'uncertain'>)|null;
 bots:BotsSnapshot|null;searchState:BotSearchSnapshot|null;canConnect:boolean;tracks:readonly Track[];
}
const fold=(s:string)=>s.normalize('NFC').trim().toLocaleLowerCase('es');
function resultView(row:BotSearchRow,target:BotSearchTarget|null):MusicSearchResultRow {
 let title:string,subtitle:string|null,match:MusicSearchResultRow['match']='unknown';
 if(row.kind==='audio'){
  title=row.title??'Audio sin título informado';subtitle=[row.performer,row.durationSeconds+' s',formatStorageMB(row.bytes)].filter(Boolean).join(' · ');
  if(target){const titleKnown=!!row.title,artistKnown=!!row.performer&&!!target.artist;
   if(titleKnown&&fold(row.title!)!==fold(target.title)||artistKnown&&fold(row.performer!)!==fold(target.artist!))match='conflict';
   else if(titleKnown&&artistKnown)match='compatible';
  }
 }else if(row.kind==='option'){title=row.label;subtitle='El bot no ha informado metadatos suficientes para confirmar la canción.';}
 else{title=row.text;subtitle=null;}
 return {id:row.rowRef,kind:row.kind,title,subtitle,correlation:row.correlation,match};
}
const searchErrors:Record<Exclude<BotSearchError,BotSearchLimitError>,string>={
 'file-too-large':`El archivo supera el límite de ${formatStorageMB(AUDIO_FILE_MAX_BYTES)} de Pulso. No se descargó.`, 'file-invalid':'El archivo está incompleto o no es un audio compatible.', conflict:'La opción, el documento o sus metadatos cambiaron. Busca y elige de nuevo.',
 cancelled:'Consulta detenida. Un mensaje ya enviado puede permanecer en tu chat.',timeout:'El bot no respondió dentro del plazo. No se repetirá la consulta automáticamente.',busy:'Hay otra operación de Telegram pendiente.',expired:'Estos resultados han caducado. Haz una consulta nueva si quieres continuar.',
 'session-expired':'La sesión de Telegram ha caducado. Vuelve a conectarla.',limit:'La consulta o la respuesta supera los límites admitidos.',unsupported:'Este bot o su respuesta todavía no son compatibles con este adaptador.','identity-changed':'El perfil del bot ha cambiado. Comprueba su identidad y vuelve a añadirlo.',
 'rate-limit':'Telegram ha limitado las consultas. Respeta la espera indicada antes de volver a buscar.',network:'No se pudo completar la consulta al bot.',uncertain:'No se pudo confirmar si el bot recibió o completó la consulta. Revisa su chat antes de repetirla.','needs-start':'Abre el chat del bot en Telegram e inícialo allí; después vuelve a buscar aquí.',
};
function searchErrorText(error:BotSearchError):string {
 const entry=location.pathname.match(/\/releases\/([a-f0-9]{16})\.html$/)?.[1]??'local';
 if(isBotSearchLimitError(error)||error==='limit'){
  const code=isBotSearchLimitError(error)?BOT_SEARCH_LIMIT_DIAGNOSTICS[error]:'L00';
  return `No se pudo leer la consulta o respuesta del bot. Código ${code} · entrada ${entry} · diagnóstico D1. No se repetirá automáticamente.`;
 }
 return searchErrors[error];
}
/** A song gesture owns one pipeline. Root retains local publication/playback authority. */
export function BotProviderNotice({text}:{text:string}) {return <p role="status">Mensaje del bot: <bdi dir="auto">{text}</bdi></p>;}
interface SongFlight {key:string;choice:SongChoice;target:BotSearchTarget;attempt:SongPlaybackAttempt;abort:AbortController;scope:string;client:TelegramSessionClient|null;networkCurrent:(()=>boolean)|null;revision:number|undefined;queryId:string|null;trackId?:string;phase:'lookup'|'query'|'choice'|'download'|'saving'|'play'|'done'|'error'}
export function MusicSearchController(props:Props){
 const [query,setQuery]=React.useState('');
 const [album,setAlbum]=React.useState<{title:string;artist:string|null;editionId?:CatalogId;artworkUrl?:string;preloaded?:AlbumDetail}|null>(null);
 const [artist,setArtist]=React.useState<CatalogArtist|null>(null);
 const [editions,setEditions]=React.useState<readonly AlbumEdition[]>([]),[artists,setArtists]=React.useState<readonly CatalogArtist[]>([]),[catalogQuery,setCatalogQuery]=React.useState<string|null>(null),[catalogPending,setCatalogPending]=React.useState(false),[catalogError,setCatalogError]=React.useState<string|null>(null);
 const artistOpener=React.useRef<HTMLButtonElement|null>(null),albumOpener=React.useRef<HTMLButtonElement|null>(null);
 const artistScroll=React.useRef<[number,number]>([0,0]),albumScroll=React.useRef<[number,number]>([0,0]);
 const navigationReturn=React.useRef<{scope:string;kind:'artist'|'search';opener:HTMLButtonElement|null;position:[number,number]|null}|null>(null);
 const searchContainer=React.useRef<HTMLDivElement>(null);
 React.useLayoutEffect(()=>{
  const point=navigationReturn.current;if(!point)return;navigationReturn.current=null;
  if(!props.visible||props.scopeKey!==point.scope||album||point.kind==='artist'&&!artist||point.kind==='search'&&artist)return;
  if(point.opener?.isConnected)point.opener.focus({preventScroll:true});
  else if(point.kind==='search')searchContainer.current?.querySelector<HTMLInputElement>('input[type=search]')?.focus();
  if(point.position)window.scrollTo(...point.position);
 },[album,artist,props.visible,props.scopeKey]);
 const [chosenId,setChosenId]=React.useState<string|null>(null);
 const [playingAliases,setPlayingAliases]=React.useState<{scope:string;trackId:string|null;keys:ReadonlySet<string>}>({scope:props.scopeKey,trackId:null,keys:new Set()});
 const [remote,setRemote]=React.useState<readonly MusicSuggestion[]>([]),[remoteQuery,setRemoteQuery]=React.useState<string|null>(null),[suggesting,setSuggesting]=React.useState(false),[suggestionError,setSuggestionError]=React.useState<string|null>(null),[suggestionNotice,setSuggestionNotice]=React.useState<string|null>(null);
 const [retry,setRetry]=React.useState(0),[notice,setNotice]=React.useState<string|null>(null),[displayedQuery,setDisplayedQuery]=React.useState<string|null>(null),[selectedResult,setSelectedResult]=React.useState<string|null>(null);
 const resolvedSingleChoice=React.useRef<((choice:SongChoice,attempt?:SongPlaybackAttempt)=>Promise<void>)|null>(null);
 React.useLayoutEffect(()=>{resolvedSingleChoice.current=chooseChoice;return()=>{resolvedSingleChoice.current=null;};});
 const singleAttempt=React.useRef<AbortController|null>(null);
 const [resolvingSingle,setResolvingSingle]=React.useState(false);
 React.useLayoutEffect(()=>{setResolvingSingle(false);return()=>{singleAttempt.current?.abort();singleAttempt.current=null;};},[props.scopeKey,props.client,props.phase,props.bots?.revision]);
 const downloadAbort=React.useRef<AbortController|null>(null),flight=React.useRef<SongFlight|null>(null);
 React.useLayoutEffect(()=>registerUpdateBlocker(()=>!!singleAttempt.current&&!singleAttempt.current.signal.aborted||albumCoordinator.running||!!flight.current&&!['done','error'].includes(flight.current.phase)),[]);
 const [download,setDownload]=React.useState<{phase:'network'|'saving'|'saved'|'failed'|'uncertain';bytes:number;total:number}|null>(null);
 const [organizing,setOrganizing]=React.useState(false),[songError,setSongError]=React.useState<string|null>(null);
 const actionArea=React.useRef<HTMLDivElement>(null);
 React.useLayoutEffect(()=>{if(chosenId&&props.visible)actionArea.current?.scrollIntoView({block:'nearest'});},[chosenId,props.visible]);
 const saving=download?.phase==='saving',localPending=['lookup','saving','play'].includes(flight.current?.phase??'');
 const [,pulse]=React.useReducer(n=>n+1,0);
 const latest=React.useRef(props),mounted=React.useRef(false),viewEpoch=React.useRef(0),committed=React.useRef<object|null>(null),metadataAttempt=React.useRef<{abort:AbortController}|null>(null),metadataEpoch=React.useRef(0);
 const chosenDraft=React.useRef<string|null>(null),catalogAbort=React.useRef<AbortController|null>(null);
 const suggestionKey=React.useRef<string|null>(null),catalogKey=React.useRef<string|null>(null);
 const renderToken={};const renderEpoch=viewEpoch.current;
 React.useLayoutEffect(()=>{latest.current=props;mounted.current=true;committed.current=renderToken;return()=>{committed.current=null;};});
 React.useEffect(()=>()=>{singleAttempt.current?.abort();mounted.current=false;metadataAttempt.current?.abort.abort();},[]);
 React.useEffect(()=>{let live=true;const trackId=props.playerTrackId??null,scope=props.scopeKey;setPlayingAliases({scope,trackId,keys:new Set()});const track=trackId?props.tracks.find(t=>t.id===trackId):undefined;if(!track)return()=>{live=false;};void readSongAliasKeys(track,()=>live&&props.visible).then(keys=>{if(live)setPlayingAliases({scope,trackId,keys});}).catch(()=>{if(live)setPlayingAliases({scope,trackId,keys:new Set()});});return()=>{live=false;};},[props.playerTrackId,props.scopeKey,props.visible,props.tracks]);
 const current=()=>mounted.current&&committed.current===renderToken&&viewEpoch.current===renderEpoch&&latest.current.visible&&latest.current.scopeKey===props.scopeKey&&latest.current.client===props.client;
 const [artworkBatch,setArtworkBatch]=React.useState<{query:string;scope:string;data:unknown;pending:boolean}|null>(null);
 // The album can be opened before this shared search batch finishes. Keep the
 // request alive across that navigation; editing, hiding or changing scope still
 // aborts it. It remains the same bounded request used for search artwork.
 React.useEffect(()=>{const abort=new AbortController(),q=normalizeMusicSuggestionsQuery(query),scope=props.scopeKey;if(!props.visible||artist||chosenDraft.current===query||!q)return()=>abort.abort();setArtworkBatch({query:q,scope,data:null,pending:true});const timer=setTimeout(()=>{void searchArtwork(q,abort.signal).then(data=>{if(!abort.signal.aborted)setArtworkBatch({query:q,scope,data,pending:false});});},700);return()=>{clearTimeout(timer);abort.abort();};},[query,props.visible,props.scopeKey,artist]);
 const client=props.client,state=client?.searchSnapshot()??props.searchState,action=client?.captureSearchActionCurrent(),cancel=client?.captureSearchCancel();
 const choices=React.useMemo(()=>musicSearchCatalog(query,props.tracks,remoteQuery===normalizeMusicSuggestionsQuery(query)?remote:[],catalogQuery===normalizeMusicSuggestionsQuery(query)?editions:[],catalogQuery===normalizeMusicSuggestionsQuery(query)?artists:[],artworkBatch?.scope===props.scopeKey&&artworkBatch.query===normalizeMusicSuggestionsQuery(query)?albumHintsFromSongs(artworkBatch.data):[],artworkBatch?.scope===props.scopeKey&&artworkBatch.query===normalizeMusicSuggestionsQuery(query)?catalogSongsFromBatch(artworkBatch.data):[]),[query,props.tracks,remote,remoteQuery,catalogQuery,editions,artists,artworkBatch,props.scopeKey]);
 const primary=props.bots?.providers[0]??null;
 const selectedProvider=primary?{id:primary.providerRef,username:primary.username,label:primary.label,supported:['ivkmbot','lydbot','ansmusicbot','kdmusic_bot','deezermusicbot'].includes(primary.username.toLowerCase())}:null;
 const provider=primary?.providerRef??null,ownPending=!!cancel||!!state?.cancelling;
 const limited=!!state?.retryBlocked||state?.retryAt!==null&&state?.retryAt!==undefined&&Date.now()<state.retryAt;
 const providers=orderedProviders(props.bots);
 const ready=props.canConnect&&props.phase==='connected'&&!!state?.available&&!state.pending&&!limited&&providers.length>0;
 const rateNotice=state?.retryBlocked?'Telegram ha limitado las consultas sin indicar un plazo utilizable. No se reintentará automáticamente.':limited&&state?.retryAt?'Telegram permite reintentar después de '+new Date(state.retryAt).toLocaleTimeString()+'.':null;
 const results=displayedQuery!==null&&state?.queryId===displayedQuery?state.rows.map(row=>resultView(row,state.expectedTarget)):[];
 const revokeMetadata=()=>{++metadataEpoch.current;const attempt=metadataAttempt.current;metadataAttempt.current=null;attempt?.abort.abort();setSuggesting(false);};
 const bump=()=>{++viewEpoch.current;pulse();};
 const edit=(queryChanged=false)=>{singleAttempt.current?.abort();singleAttempt.current=null;setResolvingSingle(false);catalogAbort.current?.abort();catalogAbort.current=null;setCatalogPending(false);flight.current?.abort.abort();flight.current=null;downloadAbort.current?.abort();setDownload(null);setSongError(null);bump();chosenDraft.current=null;if(queryChanged){revokeMetadata();setRemote([]);setRemoteQuery(null);}setChosenId(null);setDisplayedQuery(null);setSelectedResult(null);setNotice(null);if(action?.())client?.clearSearch(action);};
 React.useEffect(()=>{
  singleAttempt.current?.abort();singleAttempt.current=null;setResolvingSingle(false);
  const f=flight.current;if(f){f.abort.abort();f.networkCurrent=null;f.queryId=null;}bump();setDownload(null);setDisplayedQuery(null);setSelectedResult(null);
  // Revoking Telegram authority must stop work, not erase the user's outcome.
  // Keep only the chosen catalogue metadata; never retain chat rows/capabilities.
  if(f&&!['done','error'].includes(f.phase)){
   f.phase='error';setNotice(null);setSongError(props.phase==='connected'?'La configuración del bot cambió. La consulta se detuvo; elige la canción de nuevo.':'La conexión de Telegram se interrumpió al obtener la canción. No se pudo confirmar la descarga y no se iniciará música. Vuelve a conectar antes de intentarlo.');
  }
  if(!f)setChosenId(null);
 },[props.scopeKey,props.client,props.phase,props.bots?.revision,props.bots?.scopeKey]);
 React.useEffect(()=>()=>{downloadAbort.current?.abort();},[props.scopeKey,props.bots?.revision,client]);
 // Suggestions belong to the visible draft; an explicit selection owns its
 // metadata/query/import until completion or a real authority/intent revocation.
 React.useEffect(()=>{if(!props.visible)metadataAttempt.current?.abort.abort();},[props.visible]);
 React.useEffect(()=>{const until=state?.retryAt;if(!until||until<=Date.now())return;const timer=setTimeout(()=>{if(mounted.current)pulse();},until-Date.now()+1);return()=>clearTimeout(timer);},[state?.retryAt]);
 React.useEffect(()=>{
  const expires=state?.expiresAt;if(!expires||!client)return;
  const timer=setTimeout(()=>{if(latest.current.client===client){client.revalidate();pulse();}},Math.max(0,expires-Date.now()+1));return()=>clearTimeout(timer);
 },[state?.expiresAt,client]);
 React.useEffect(()=>{
  const abort=new AbortController(),attempt={abort};metadataAttempt.current?.abort.abort();metadataAttempt.current=attempt;
  const valid=normalizeMusicSuggestionsQuery(query);
  const key=JSON.stringify([valid,props.scopeKey,retry]);
  if(suggestionKey.current!==key){suggestionKey.current=key;setRemote([]);setRemoteQuery(null);setSuggestionError(null);}
  setSuggesting(false);
  if(chosenDraft.current!==null&&query===chosenDraft.current){setSuggestionNotice('Canción elegida para consultar al bot principal.');return()=>abort.abort();}
  if(!props.visible||album||artist||!valid){setSuggestionNotice(query&&!valid?'Escribe entre 3 y 160 caracteres para obtener sugerencias.':null);return()=>abort.abort();}
  const scope=props.scopeKey,epoch=metadataEpoch.current,waitUntil=Date.now()+15000;
  const live=()=>epoch===metadataEpoch.current&&mounted.current&&!abort.signal.aborted&&metadataAttempt.current===attempt&&latest.current.visible&&latest.current.scopeKey===scope;
  let timer:ReturnType<typeof setTimeout>|undefined;
  setSuggesting(true);setSuggestionNotice(null);setSuggestionError(null);
  const run=()=>{
   if(!live())return;
   const rate=suggestionsClient.getRateState(),wait=rate.retryAt===null?0:Math.max(0,rate.retryAt-Date.now());
   // Wait for original cancellation/body cleanup, never overlap or release its slot by a clock.
   // This is dispatch of the latest draft, not retry of a failed remote request.
   if(rate.state==='busy'){
    if(Date.now()<waitUntil){timer=setTimeout(run,100);return;}
    clearTimeout(deadline);setSuggesting(false);setSuggestionError('La consulta anterior sigue cerrándose. Vuelve a intentar las sugerencias.');return;
   }
   if(rate.state==='blocked'||wait>2000){clearTimeout(deadline);setSuggesting(false);setSuggestionError('LRCLIB ha limitado las consultas. Espera antes de reintentar.');return;}
   if(wait>0){timer=setTimeout(run,wait+1);return;}
   void suggestionsClient.search(valid,{signal:abort.signal,current:live}).then(result=>{
    if(!live())return;
    clearTimeout(deadline);setSuggesting(false);
    if(result.state==='ready'){setRemoteQuery(valid);setRemote(result.tracks);setSuggestionNotice(result.tracks.length?null:'No hay sugerencias para este nombre. Prueba con otro nombre de canción o álbum.');}
    else if(result.state==='rate-limited')setSuggestionError(result.retryAt===null?'LRCLIB ha limitado las consultas y no indicó una espera utilizable.':'LRCLIB ha limitado las consultas. Podrás reintentar después de '+new Date(result.retryAt).toLocaleTimeString()+'.');
    else if(result.state==='busy')setSuggestionError('La consulta anterior sigue cerrándose. Vuelve a intentar las sugerencias.');
    else if(result.state==='unavailable')setSuggestionError('No se pudieron obtener sugerencias. Puedes reintentarlo o ver las coincidencias de tu biblioteca.');
   }).catch(()=>{if(live()){clearTimeout(deadline);setSuggesting(false);setSuggestionError('No se pudieron obtener sugerencias.');}});
  };
  timer=setTimeout(run,450);
  const deadline=setTimeout(()=>{if(live()){abort.abort();setSuggesting(false);setSuggestionError('La consulta de sugerencias agotó el plazo.');}},15000);
  return()=>{if(timer!==undefined)clearTimeout(timer);clearTimeout(deadline);abort.abort();};
 },[query,props.visible,props.scopeKey,retry,!!album,!!artist]);
 React.useEffect(()=>{
  const abort=new AbortController(),valid=normalizeMusicSuggestionsQuery(query),scope=props.scopeKey;
  catalogAbort.current?.abort();catalogAbort.current=abort;
  const key=JSON.stringify([valid,scope,retry]);
  if(catalogKey.current!==key){catalogKey.current=key;setEditions([]);setArtists([]);setCatalogQuery(null);setCatalogError(null);}
  setCatalogPending(false);
  if(!props.visible||album||artist||!valid||chosenDraft.current===query)return()=>abort.abort();
  let active=true;
  const live=()=>active&&!abort.signal.aborted&&catalogAbort.current===abort&&mounted.current&&latest.current.visible&&latest.current.scopeKey===scope;
  setCatalogPending(true);setCatalogError(null);
  const timer=setTimeout(()=>{void (async()=>{
   const albums=await metadataCatalog.search(valid,null,{signal:abort.signal,current:live});
   if(!live())return;
   setCatalogQuery(valid);
   if(albums.ok)setEditions(albums.value);else if(albums.reason!=='cancelled')setCatalogError('No se pudieron consultar algunos álbumes o artistas.');
   const performers=await metadataCatalog.searchArtists(valid,{signal:abort.signal,current:live});
   if(!live())return;
   if(performers.ok)setArtists(performers.value);else if(performers.reason!=='cancelled')setCatalogError('No se pudieron consultar algunos álbumes o artistas.');
   setCatalogPending(false);
  })();},450);
  return()=>{active=false;clearTimeout(timer);abort.abort();};
 },[query,props.visible,props.scopeKey,retry,!!album,!!artist]);
 const flightCurrent=(f:SongFlight)=>mounted.current&&flight.current===f&&!f.abort.signal.aborted&&latest.current.scopeKey===f.scope&&latest.current.client===f.client;
 const live=(f:SongFlight)=>flightCurrent(f)&&f.attempt.current()&&(!f.networkCurrent||f.networkCurrent()&&latest.current.bots?.revision===f.revision);
 const finishPlay=async(f:SongFlight,id:string)=>{
  if(!live(f))return;f.trackId=id;f.phase='play';setNotice('Preparando la canción para reproducir…');pulse();
  const outcome=await f.attempt.play(id,()=>live(f),f.abort.signal);
  if(!flightCurrent(f))return;f.phase='done';setDownload(null);setNotice(outcome==='playing'?'Reproduciendo la canción desde la copia de este navegador.':outcome==='gesture-required'?'Canción disponible. Toca Reproducir para continuar; el navegador necesita ese gesto.':'La canción se conserva. No se pudo iniciar la reproducción; comprueba el reproductor.');pulse();
 };
 // A newer explicit playback action (including Pause/media keys) revokes the
 // original song intent. Abort still waits for the original transport/import receipt.
 React.useEffect(()=>{
  const f=flight.current;if(!f||f.abort.signal.aborted||['done','error'].includes(f.phase))return;
  let valid=false;try{valid=f.attempt.current();}catch{/* Fail closed. */}
  if(valid)return;f.abort.abort();
  if(f.phase!=='saving'){f.phase='error';setDownload(null);}
  setNotice('Se conserva tu última acción del reproductor. No se iniciará la canción pendiente.');pulse();
 });
 function showResults(){/* The debounced metadata searches already follow the current query. */}
 async function choose(id:string,opener:HTMLButtonElement){
  if(!current()||resolvingSingle||singleAttempt.current)return;const choice=choices.find(c=>c.id===id);if(!choice)return;
  if(choice.kind==='artist'){if(ownPending||localPending)return;catalogAbort.current?.abort();setCatalogPending(false);revokeMetadata();artistOpener.current=opener;artistScroll.current=[window.scrollX,window.scrollY];setArtist({id:choice.artistId,name:choice.title});return;}
  if(choice.kind==='album'){if(ownPending||localPending)return;revokeMetadata();albumOpener.current=opener;albumScroll.current=[window.scrollX,window.scrollY];edit();setAlbum({title:choice.title,artist:choice.artist,editionId:choice.editionId,artworkUrl:choice.artworkUrl});return;}
  if(choice.pendingEditionId!==undefined){
   if(ownPending||localPending)return;
   edit();revokeMetadata();
   const playbackAttempt=props.captureSongPlayback?.();
   if(!playbackAttempt?.current()){setNotice('La biblioteca está ocupada o requiere revisión. Comprueba Almacenamiento.');return;}
   const abort=new AbortController(),scope=props.scopeKey,epoch=viewEpoch.current;
   singleAttempt.current=abort;setResolvingSingle(true);setChosenId(id);setNotice(null);
   const valid=()=>playbackAttempt.current()&&mounted.current&&!abort.signal.aborted&&singleAttempt.current===abort&&viewEpoch.current===epoch&&latest.current.scopeKey===scope&&latest.current.client===client;
   try{
    const result=await resolveSearchSingle(metadataCatalog,choice.pendingEditionId,{signal:abort.signal,current:valid});
    if(!valid())return;
    if(result.state!=='song'){
     if(result.state==='changed')setEditions(rows=>rows.map(e=>e.id===result.edition.id?result.edition:e));
     setNotice('No se pudo confirmar una única canción. Actualiza las sugerencias para comprobar la edición.');return;
    }
    singleAttempt.current=null;setResolvingSingle(false);
    await resolvedSingleChoice.current?.(result.choice,playbackAttempt);
   }finally{if(singleAttempt.current===abort){singleAttempt.current=null;if(mounted.current)setResolvingSingle(false);}}
   return;
  }
  // LRCLIB sometimes puts a video label or a repeated artist in the title.
  // The displayed song is also the explicit search target. Local copies retain
  // their original metadata/ID; live/remix/version qualifiers are never removed.
  await chooseChoice(choice.source==='lrclib'&&choice.displayTitle?{...choice,title:choice.displayTitle}:choice);
 }
 async function chooseChoice(choice:SongChoice,capturedAttempt?:SongPlaybackAttempt){
  // Only the already admitted single resolution may enter while hidden.
  // New gestures still require the current visible render.
  if(capturedAttempt?!(mounted.current&&latest.current.scopeKey===props.scopeKey&&latest.current.client===client&&capturedAttempt.current()):!current())return;
  const id=choice.id;
  const key=songChoiceKey(choice)??JSON.stringify([choice.source,choice.id,choice.title,choice.artist]);
  const old=flight.current;
  const sameRecording=old&&samePendingSong(old.choice,choice);
  if((old?.key===key||sameRecording)&&old?.scope===props.scopeKey&&old.client===client&&!old.abort.signal.aborted&&!['done','error'].includes(old.phase)&&(old.phase!=='choice'||old.client?.searchSnapshot().queryId===old.queryId&&old.client?.searchSnapshot().expiresAt!==null)){setNotice('Esta canción ya está en proceso. Se usará la misma copia.');setChosenId(id);return;}
  if(ownPending||localPending)return;
  const chosen=parseBotSearchTarget({title:choice.title.normalize('NFC').trim(),artist:choice.artist?.normalize('NFC').trim()||null,album:choice.album?.normalize('NFC').trim()||null,durationSeconds:choice.duration});
  if(!chosen){setNotice('Los metadatos de esta sugerencia no permiten identificar la canción.');return;}
  const attempt=capturedAttempt??props.captureSongPlayback?.();if(!attempt?.current()){setNotice('La biblioteca está ocupada o requiere revisión. Comprueba Almacenamiento.');return;}
  const capturedProviders=providers.map(p=>({...p})),networkCurrent=client?.captureBotsCurrent();
  old?.abort.abort();const abort=new AbortController();downloadAbort.current=abort;
  const f:SongFlight={key,choice,target:chosen,attempt,abort,scope:props.scopeKey,client,networkCurrent:null,revision:props.bots?.revision,queryId:null,phase:'lookup'};flight.current=f;
  catalogAbort.current?.abort();setCatalogPending(false);revokeMetadata();bump();chosenDraft.current=query;setChosenId(id);setDownload(null);setSongError(null);setSelectedResult(null);setNotice('Comprobando si ya tienes esta canción…');
  try{
   const local=await attempt.lookup(choice,abort.signal);if(!live(f))return;
   if(local){
    const cached=props.tracks.find(track=>track.id===local);
    if(cached?.audioFingerprint)await rememberSongAlias(choice,local,cached.audioFingerprint.sha256,cached.audioFingerprint.bytes,()=>live(f));
    if(!live(f))return;
    const player=latest.current;
    if(player.scopeKey===f.scope&&player.client===f.client&&f.attempt.current()&&player.playerPlaying&&player.playerTrackId===local){f.trackId=local;f.phase='done';setDownload(null);setNotice('Esta canción ya se está reproduciendo. Se conserva la reproducción actual.');pulse();return;}
    await finishPlay(f,local);return;
   }
   if(!ready||!capturedProviders.length||!client||f.revision===undefined){f.phase='error';setNotice(!capturedProviders.length?'Añade un bot compatible en «Bots de música» para conseguir esta canción.':'Conecta Telegram para conseguir esta canción. Las copias ya descargadas no necesitan conexión.');pulse();return;}
   f.networkCurrent=networkCurrent??null;if(!f.networkCurrent||!live(f))return;
   f.phase='query';setDownload({phase:'network',bytes:0,total:0});
   const result=await acquireFromOrderedBots({client,providers:capturedProviders,revision:f.revision,target:chosen,signal:abort.signal,current:()=>live(f),networkCurrent:f.networkCurrent,progress:(bot,index,queryId)=>{if(!live(f))return;f.queryId=queryId;setDisplayedQuery(queryId);setNotice(`Probando ${bot.label} (${index+1}/${capturedProviders.length})…`);pulse();}});
   if(!flightCurrent(f))return;
   if(!live(f)){f.phase='error';setDownload(null);setSongError('La conexión o el permiso se interrumpió. No se iniciará música.');pulse();return;}
   if(result.state!=='audio'){f.phase='error';setDownload(null);setNotice(result.state==='known-failure'?acquisitionFailureText(result.reasons):'No se pudo confirmar la operación. Revisa Telegram antes de repetirla.');pulse();return;}
   const audio=result.audio;f.phase='saving';setDownload({phase:'saving',bytes:0,total:audio.bytes});setNotice('Verificando la única copia local…');
   const saved=await f.attempt.save(audio,f.choice,abort.signal,bytes=>{if(live(f))setDownload({phase:'saving',bytes,total:audio.bytes});});
   if(saved.state==='saved'&&saved.trackId)f.trackId=saved.trackId;
   if(mounted.current&&flight.current===f&&abort.signal.aborted){f.phase=saved.state==='uncertain'?'error':'done';setDownload(null);setSongError(null);setNotice(saved.state==='saved'?'La copia ya estaba confirmada y se conserva. No se iniciará la reproducción.':saved.state==='uncertain'?'La copia requiere revisión. No repitas la descarga hasta comprobar Almacenamiento.':'Operación detenida sin publicar otra copia ni iniciar música.');pulse();return;}
   if(!mounted.current||flight.current!==f)return;
   if(!live(f)){f.phase=saved.state==='uncertain'?'error':'done';setDownload(null);setSongError(null);setNotice(saved.state==='uncertain'?'La copia requiere revisión. No repitas la descarga hasta comprobar Almacenamiento.':'Se conserva tu última acción del reproductor. No se iniciará la canción pendiente.');pulse();return;}
   if(saved.state==='saved'&&saved.trackId){await finishPlay(f,saved.trackId);return;}
   f.phase='error';setDownload({phase:saved.state==='uncertain'?'uncertain':'failed',bytes:0,total:audio.bytes});setNotice(saved.state==='uncertain'?'La copia requiere revisión. No repitas la descarga hasta comprobar Almacenamiento.':'No se pudo guardar la canción.');pulse();
  }catch(error){if(flightCurrent(f)){f.phase='error';setDownload(null);setNotice(error instanceof Error?error.message:'No se pudo comprobar la copia local.');pulse();}}
 }
 function cancelSong(){if(!current())return;if(singleAttempt.current){singleAttempt.current.abort();singleAttempt.current=null;setResolvingSingle(false);setNotice('Comprobación detenida.');return;}const f=flight.current;if(!f||f!==selected||['done','error'].includes(f.phase))return;f.abort.abort();if(f.phase!=='saving'){f.phase='error';setDownload(null);}setNotice('Operación detenida. Una copia ya confirmada se conserva; no se iniciará música.');pulse();}
 const selected=flight.current,management=selected?.trackId?props.captureSongManagement?.(selected.trackId):null;
 const manage=async(kind:'add'|'playlist'|'play',id?:string)=>{
  if(!current()||organizing||!selected?.trackId||!management?.current())return;
  const epoch=viewEpoch.current;setOrganizing(true);
  try{const result=kind==='add'?await management.add():kind==='playlist'?await management.addToPlaylist(id!):await management.play();
   if(!mounted.current||flight.current!==selected||viewEpoch.current!==epoch||!latest.current.visible)return;
   setNotice(kind==='play'?(result==='playing'?'Reproduciendo la canción.':result==='gesture-required'?'El navegador requiere pulsar Reproducir de nuevo.':'No se pudo iniciar el audio. Revisa el reproductor.'):(result?(kind==='add'?'Canción agregada a tu biblioteca.':'Canción añadida a la playlist.'):'No se pudo confirmar el cambio. Comprueba el estado antes de repetirlo.'));
  }finally{if(mounted.current)setOrganizing(false);}
 };
 const songActions=selected&&<div ref={actionArea} className="music-search-selection">{!['done','error'].includes(selected.phase)&&state?.queryId===selected.queryId&&state?.providerNotice&&<BotProviderNotice text={state.providerNotice}/>}<SelectedSongActions key={selected.key} title={selected.choice.displayTitle??selected.choice.title} artist={selected.choice.artist}
  status={notice??(ownPending?'Obteniendo la canción…':null)} error={songError??(state?.error?searchErrorText(state.error):null)}
  pending={ownPending||saving||localPending||organizing} progress={ownPending||saving?(download?.total?download:state?.downloadProgress):null}
  inLibrary={!!selected.trackId&&!!props.libraryTrackIds?.has(selected.trackId)}
  canAdd={!!selected.trackId&&!!management?.current()&&!ownPending&&!localPending&&!saving&&!organizing}
  canPlay={!!management?.playReady&&!!management.current()&&!ownPending&&!localPending&&!saving&&!organizing}
  playlists={props.playlists??[]} canAddToPlaylist={!!selected.trackId&&!!management?.current()&&!ownPending&&!localPending&&!saving&&!organizing}
  onAdd={()=>void manage('add')} onAddToPlaylist={id=>void manage('playlist',id)} onPlay={()=>void manage('play')} onCancel={cancelSong} current={current}/></div>;
 return <><div ref={searchContainer} hidden={!!album||!!artist}><MusicSearchPanel songActions={album?null:songActions} query={query} onQueryChange={value=>{if(!current())return;edit(true);setQuery(value.slice(0,640));}}
  suggestions={choices.map(c=>{const aliasesCurrent=playingAliases.scope===props.scopeKey&&playingAliases.trackId===props.playerTrackId;const exact=c.kind==='track'&&c.pendingEditionId===undefined&&aliasesCurrent&&playingAliases.keys.has(songChoiceKey(c as SongChoice)??'')?props.playerTrackId:undefined;const matches=c.kind==='track'&&c.pendingEditionId===undefined&&!exact?props.tracks.filter(t=>c.source==='local'?t.id===c.id.slice(6):compatibleSongMetadata(t,c)):[];const trackId=exact??(matches.length===1?matches[0].id:undefined);return {id:c.id,kind:c.kind,title:c.displayTitle??c.title,subtitle:(c.kind==='track'?[c.artist,c.album]:[c.artist]).filter(Boolean).join(' · ')||null,source:c.source,trackId,artworkUrl:c.artworkUrl??(c.kind==='track'&&c.artist&&c.duration&&artworkBatch?.scope===props.scopeKey&&artworkBatch.query===normalizeMusicSuggestionsQuery(query)?songArtwork(artworkBatch.data,{title:c.displayTitle??c.title,artist:c.artist,album:c.album,durationSeconds:c.duration}):null)}})} resultsVisible={!!query.trim()} selectedSuggestionId={chosenId} playingTrackIds={props.playerPlaying&&props.playerTrackId?new Set([props.playerTrackId]):undefined} suggestionsPending={suggesting||catalogPending} suggestionsError={[suggestionError,catalogError].filter(Boolean).join(' ')||null} suggestionsNotice={suggestionNotice}
  onRetrySuggestions={()=>{if(current()&&!ownPending){edit();setRetry(n=>n+1);}}}
  primaryProvider={selectedProvider}
  hasSupportedProvider={providers.length>0}
  sessionReady={props.phase==='connected'} canSearch={ready} searchPending={ownPending||saving||localPending||resolvingSingle} searchPendingLabel={resolvingSingle?'Comprobando los metadatos de la canción…':undefined}
  onSearch={showResults} onChooseSuggestion={choose}
  onCancel={cancelSong}
  downloadStatus={download?.phase==='saving'?'Guardando copia verificada…':null} downloadProgress={saving?download:state?.downloadProgress??null} onCancelDownload={saving?cancelSong:undefined}
  automaticSelection results={results} selectedResultId={selectedResult} onSelectResult={()=>{}}
  status={rateNotice??notice??(displayedQuery&&state?.queryId===displayedQuery&&!state.error&&results.length?'Respuesta del bot recibida. Revisa las opciones; la identidad musical sigue sin confirmar.':null)} error={state?.error?searchErrorText(state.error):null} uncertain={state?.delivery==='uncertain'} current={current}/></div>
  {!album&&!artist&&<PlaylistImportPanel visible={props.visible} onOpen={detail=>{if(!current())return;revokeMetadata();albumOpener.current=null;albumScroll.current=[window.scrollX,window.scrollY];edit();setAlbum({title:detail.edition.title,artist:detail.edition.artist,preloaded:detail});}}/>}{artist&&<div hidden={!!album}><ArtistPage artist={artist} scope={props.scopeKey} visible={props.visible&&!album} onBack={()=>{if(!current())return;navigationReturn.current={scope:props.scopeKey,kind:'search',opener:artistOpener.current,position:artistScroll.current};setArtist(null);}} onAlbum={(row,opener)=>{if(!current()||ownPending||localPending)return;albumOpener.current=opener;albumScroll.current=[window.scrollX,window.scrollY];setAlbum({title:row.title,artist:row.artist,editionId:row.id,artworkUrl:row.artworkUrl});}}/></div>}
  {album&&<AlbumPageController coordinator={albumCoordinator} title={album.title} artist={album.artist} editionId={album.editionId} preloaded={album.preloaded} artworkUrl={album.artworkUrl} playerTrackId={props.playerPlaying?props.playerTrackId??null:null} searchBatch={artist?undefined:artworkBatch?.scope===props.scopeKey&&artworkBatch.query===normalizeMusicSuggestionsQuery(query)?artworkBatch:normalizeMusicSuggestionsQuery(query)?pendingArtworkBatch:undefined} backLabel={artist?'Volver al artista':undefined} scope={props.scopeKey} visible={props.visible} captureInspection={props.captureSongCopyInspection} selectedKey={selected?.phase==='done'&&selected.trackId?selected.choice.id:null} libraryTrackIds={props.libraryTrackIds} client={client} revision={props.bots?.revision} provider={selectedProvider?.supported?provider:null} providers={providers} capture={()=>current()?(props.captureSongDownload??props.captureSongPlayback)?.()??null:null} management={id=>props.captureSongManagement?.(id)??null} songActions={songActions} onChoose={choice=>{if(current())void chooseChoice(choice);}} onBack={()=>{if(!current())return;edit();navigationReturn.current={scope:props.scopeKey,kind:artist?'artist':'search',opener:albumOpener.current,position:albumScroll.current};setAlbum(null);}}/>}</>;
}
