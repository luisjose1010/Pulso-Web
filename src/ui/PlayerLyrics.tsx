import {useEffect,useRef,useState} from 'react';
import type {Activity} from '../playback/ownership';
import {readLyrics,type LyricsRead} from '../library/lyrics';
import {readPlayerOnlineLyrics,type OnlineLyrics} from '../library/player-lyrics-provider';
import './player-lyrics.css';

export type PlayerLyricsResult=LyricsRead|({origin:{provenance:'lrclib'}} & (Extract<OnlineLyrics,{state:'ready'}>|{state:'instrumental'|'not-found'}));
export interface PlayerLyricsMetadata {title:string;artist:string;album?:string|null;durationSeconds?:number|null;current:()=>boolean}

/** Local lyrics always win; external results remain in memory only. */
export function usePlayerLyrics(activity:Activity,trackId:string|null,scopeKey:string,enabled:boolean,metadata?:PlayerLyricsMetadata) {
 const [value,setValue]=useState<{trackId:string;result:PlayerLyricsResult}|null>(null);
 const [error,setError]=useState(false),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
 const epoch=useRef(0);
 const title=metadata?.title,artist=metadata?.artist,album=metadata?.album,durationSeconds=metadata?.durationSeconds;
 const currentRef=useRef(metadata?.current);currentRef.current=metadata?.current;
 useEffect(()=>{
  const generation=++epoch.current;let live=true;const controller=new AbortController();
  setValue(null);setError(false);setLoading(false);
  if(!enabled||!trackId)return;
  const scope=activity.scope(),operation=activity.begin();
  if(!operation){setError(true);return;}
  const current=()=>live&&epoch.current===generation&&scope()&&(!currentRef.current||currentRef.current());
  let operationEnded=false;
  const endOperation=()=>{if(!operationEnded){operationEnded=true;operation.end();}};
  setLoading(true);
  void (async()=>{
   let result:LyricsRead;
   try{result=await readLyrics(trackId);if(!operation.current())return;}finally{endOperation();}
   if(!current())return;
   if(result.state!=='absent'||result.origin?.provenance==='manual'||!currentRef.current||!title||!artist){setValue({trackId,result});return;}
   const remote=await readPlayerOnlineLyrics({title,artist,album,durationSeconds},controller.signal,current);
   if(!current())return;
   if(remote.state==='cancelled')return;
   if(remote.state==='unavailable'){setValue({trackId,result});setError(true);return;}
   setValue({trackId,result:{...remote,origin:{provenance:'lrclib'}}});
  })().catch(()=>{if(current())setError(true);}).finally(()=>{
   if(current())setLoading(false);
   endOperation();
  });
  return()=>{live=false;controller.abort();};
 },[activity,trackId,scopeKey,enabled,revision,title,artist,album,durationSeconds]);
 const showing=enabled&&(!currentRef.current||currentRef.current());
 return {result:showing&&value?.trackId===trackId?value.result:null,error:showing&&error,loading:showing&&loading,reload:()=>setRevision(n=>n+1)};
}

function activeCue(result:PlayerLyricsResult|null,seconds:number) {
 if(result?.state!=='ready'||result.lyrics.kind!=='timed')return -1;
 let active=-1;
 if(Number.isFinite(seconds))for(let i=0;i<result.lyrics.cues.length;i++){
  if(result.lyrics.cues[i].timeMs>seconds*1000)break;
  active=i;
 }
 return active;
}

interface LyricPlayback {canSeek?:boolean;durationSeconds?:number;onSeek?:(seconds:number)=>void}
function cueAvailable(timeMs:number,props:LyricPlayback){return !!props.canSeek&&!!props.onSeek&&(props.durationSeconds===undefined||Number.isFinite(props.durationSeconds)&&timeMs/1000<props.durationSeconds);}

export function PlayerLyricsPreview(props:{result:PlayerLyricsResult|null;timeSeconds:number;loading:boolean}&LyricPlayback) {
 const {result,timeSeconds,loading}=props;
 if(loading)return <p>Cargando letra…</p>;
 if(result?.state==='instrumental')return <div className="player-lyrics-empty"><strong>Versión instrumental</strong><p>LRCLIB identifica esta canción como instrumental.</p></div>;
 if(result?.state!=='ready')return <div className="player-lyrics-empty"><strong>Letra no disponible</strong><p>Puedes seguir escuchando esta canción.</p></div>;
 if(result.lyrics.kind==='timed'&&props.onSeek){const start=Math.max(0,activeCue(result,timeSeconds));return <div className="player-lyrics-preview">{result.lyrics.cues.slice(start,start+2).map((cue,index)=><button key={start+index} type="button" disabled={!cueAvailable(cue.timeMs,props)} aria-label={`Reproducir desde este verso: ${cue.text||'Pausa instrumental'}`} onClick={()=>props.onSeek?.(cue.timeMs/1000)}>{cue.text||'♪'}</button>)}</div>;}
 const lines=result.lyrics.kind==='timed'?result.lyrics.cues.slice(Math.max(0,activeCue(result,timeSeconds)),Math.max(0,activeCue(result,timeSeconds))+2).map(c=>c.text):result.lyrics.text.split(/\r?\n/).filter(line=>line.trim()).slice(0,2);
 return <div className="player-lyrics-preview">{lines.map((line,index)=><p key={index}>{line}</p>)}</div>;
}

export function PlayerLyricsReader(props:{result:PlayerLyricsResult|null;loading:boolean;error:boolean;timeSeconds:number;durationSeconds?:number;canSeek:boolean;onSeek:(seconds:number)=>void;onRetry:()=>void}) {
 const {result}=props,active=activeCue(result,props.timeSeconds);
 if(props.loading)return <p role="status">Cargando letra…</p>;
 if(props.error||result?.state==='unavailable')return <div className="player-lyrics-empty"><h3>No se pudo leer la letra</h3><p>La reproducción sigue disponible.</p><button type="button" onClick={props.onRetry}>Volver a leer letra</button></div>;
 if(result?.state==='instrumental')return <div className="player-lyrics-empty"><h3>Versión instrumental</h3><p>LRCLIB identifica esta canción como instrumental.</p></div>;
 if(result?.state!=='ready')return <div className="player-lyrics-empty"><h3>Letra no disponible</h3><p>No encontramos una letra para esta canción. Puedes seguir escuchando.</p></div>;
 return <div className="player-lyrics-reader"><p className="player-lyrics-source">{result.origin?.provenance==='lrclib'?'Letra de LRCLIB':result.origin?.provenance==='embedded'?'Letra incluida en el audio':'Letra guardada en este navegador'} · {result.lyrics.kind==='timed'?'Sincronizada':'Sin sincronización'}</p>
  <div className="player-lyrics-lines">{result.lyrics.kind==='timed'?result.lyrics.cues.map((cue,index)=><button key={index} type="button" aria-current={active===index?'true':undefined} disabled={!cueAvailable(cue.timeMs,props)} aria-label={`Reproducir desde este verso: ${cue.text||'Pausa instrumental'}`} onClick={()=>props.onSeek(cue.timeMs/1000)}>{cue.text||'♪'}</button>):result.lyrics.text.split(/\r?\n/).map((line,index)=><p key={index}>{line||'\u00a0'}</p>)}</div>
 </div>;
}
