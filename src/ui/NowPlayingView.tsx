import {BackButton} from './BackButton';
import {useLayoutEffect, useRef, useState, type ReactNode, type Ref} from 'react';
import './now-playing.css';

type View = 'player' | 'lyrics' | 'queue';
type Repeat = 'off' | 'one' | 'all';

/** All musical state and operations belong to the caller; this component owns only its view. */
export interface NowPlayingViewProps {
  open: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  title: string;
  artist: string;
  album?: string | null;
  artwork: ReactNode;
  lyrics: ReactNode;
  queue: ReactNode;
  lyricsPreview?: ReactNode;
  status?: ReactNode;
  trackId: string | null;
  favoritePending: boolean;
  favoriteStatus?: ReactNode;
  current: () => boolean;
  playing: boolean;
  favorite: boolean;
  shuffle: boolean;
  repeat: Repeat;
  position: number;
  duration: number;
  canPlay: boolean;
  canPause: boolean;
  canPrevious: boolean;
  canNext: boolean;
  canSeek: boolean;
  canOrganize: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onShuffle: () => void;
  onRepeat: () => void;
  onFavorite: () => void;
}

const paths = {
  shuffle:'M3 5h4c4 0 5 14 10 14h4m-4-4 4 4-4 4M3 19h4c1 0 2-1 3-3m4-8c1-2 2-3 4-3h3m-4-4 4 4-4 4',
  previous:'M19 4 7 12l12 8ZM4 4v16', next:'M5 4l12 8-12 8ZM20 4v16',
  repeat:'M18 2l4 4-4 4M2 10V8a2 2 0 0 1 2-2h18M6 22l-4-4 4-4m16 0v2a2 2 0 0 1-2 2H2',
  play:'M8 4l12 8-12 8Z', pause:'M8 5v14M16 5v14',
  lyrics:'M4 4h16v12H8l-4 4ZM8 8h8M8 12h6', queue:'M3 5h18M3 12h18M3 19h12',
  plus:'M12 5v14M5 12h14', check:'M5 12l5 5L20 7',
} as const;
type IconName = keyof typeof paths;
function Icon({name}:{name:IconName}) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} fill={name==='play'||name==='previous'||name==='next'?'currentColor':'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function clock(value:number) {
  const seconds = Number.isFinite(value) ? Math.max(0,Math.floor(value)) : 0;
  const hours = Math.floor(seconds/3600), minutes = Math.floor(seconds/60)%60;
  return hours ? `${hours}:${String(minutes).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}` : `${minutes}:${String(seconds%60).padStart(2,'0')}`;
}

export function NowPlayingView(props:NowPlayingViewProps) {
  const committed = useRef<NowPlayingViewProps|null>(null);
  useLayoutEffect(()=>{committed.current=props;return()=>{committed.current=null;};});
  let expired=false;
  const active=()=>{if(expired)return false;if(committed.current!==props||!props.current()){expired=true;return false;}return true;};
  const [view,setView] = useState<View>('player');
  const previousView = useRef<View>('player');
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement|null>(null);
  const savedScroll = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    if (!props.open) { previousView.current='player'; setView('player'); }
  },[props.open]);
  useLayoutEffect(()=>{
    if (!props.open) return;
    const surface = root.current?.closest<HTMLElement>('.player-surface');
    if (view!=='player') { if(surface) surface.scrollTop=0; detailHeading.current?.focus({preventScroll:true}); }
    else if (previousView.current!=='player') { if(surface) surface.scrollTop=savedScroll.current; if(opener.current?.isConnected) opener.current.focus({preventScroll:true}); }
    previousView.current=view;
  },[view,props.open]);
  function openView(next:Exclude<View,'player'>, source:HTMLButtonElement) {
    if (!active()) return;
    opener.current=source;
    savedScroll.current=root.current?.closest<HTMLElement>('.player-surface')?.scrollTop??0;
    setView(next);
  }
  const duration=Number.isFinite(props.duration)?Math.max(0,props.duration):0;
  const position=Number.isFinite(props.position)?Math.min(duration,Math.max(0,props.position)):0;
  function transport() {
    return <div className="np-transport" aria-label="Controles de reproducción">
      <button type="button" className="np-round" aria-label="Reproducción aleatoria" aria-pressed={props.shuffle} disabled={!props.canOrganize} onClick={props.onShuffle}><Icon name="shuffle"/></button>
      <button type="button" className="np-round" aria-label="Canción anterior" disabled={!props.canPrevious} onClick={props.onPrevious}><Icon name="previous"/></button>
      <button type="button" className="np-round np-play" aria-label={props.playing?'Pausar':'Reproducir'} disabled={props.playing?!props.canPause:!props.canPlay} onClick={props.playing?props.onPause:props.onPlay}><Icon name={props.playing?'pause':'play'}/></button>
      <button type="button" className="np-round" aria-label="Siguiente canción" disabled={!props.canNext} onClick={props.onNext}><Icon name="next"/></button>
      <button type="button" className="np-round np-repeat" aria-label={`Repetición: ${props.repeat==='off'?'desactivada':props.repeat==='one'?'una canción':'toda la cola'}`} aria-pressed={props.repeat!=='off'} disabled={!props.canOrganize} onClick={props.onRepeat}><Icon name="repeat"/>{props.repeat==='one'&&<span aria-hidden="true">1</span>}</button>
    </div>;
  }
  return <div ref={root} className="now-playing-view" data-view={view}>
    <div className="np-main" hidden={view!=='player'}>
      <div className="np-visual"><div className="np-context">{props.album&&<strong>{props.album}</strong>}</div><div className="np-art">{props.artwork}</div></div>
      <div className="np-body"><div className="np-info"><div><h2 ref={props.headingRef} tabIndex={-1}>{props.title}</h2><p>{props.artist}</p></div><button key={props.trackId} type="button" className="np-favorite" aria-label={props.favorite?'Quitar canción actual de Favoritos':'Añadir canción actual a Favoritos'} title={props.favorite?'Quitar de Favoritos':'Añadir a Favoritos'} aria-pressed={props.favorite} disabled={!props.trackId||!props.canOrganize||props.favoritePending} onClick={()=>{if(active()&&props.canOrganize&&!props.favoritePending)props.onFavorite();}}><span className="np-favorite__icon np-favorite__plus"><Icon name="plus"/></span><span className="np-favorite__icon np-favorite__check"><Icon name="check"/></span></button></div>
        {props.status&&<div className="np-status" role="status">{props.status}</div>}
        <div className="np-status" role="status" aria-live="polite">{props.favoriteStatus}</div>
        <div className="np-seek"><input type="range" aria-label="Posición de reproducción" min="0" max={duration} step="0.1" value={position} disabled={!props.canSeek||!duration} onChange={event=>props.onSeek(Number(event.target.value))}/><div><span>{clock(position)}</span><span>−{clock(duration-position)}</span></div></div>
        {transport()}
        <div className="np-secondary"><button type="button" onClick={event=>openView('lyrics',event.currentTarget)}><Icon name="lyrics"/>Letra</button><button type="button" onClick={event=>openView('queue',event.currentTarget)}><Icon name="queue"/>Cola</button></div>
        <div className="np-lyrics-card"><div className="np-lyrics-card__heading"><h3>Vista previa de la letra</h3></div><div className="np-lyrics-preview">{props.lyricsPreview??<p>Abre la letra para ver el contenido disponible de esta canción.</p>}</div><button type="button" onClick={event=>openView('lyrics',event.currentTarget)}>Mostrar letra</button></div>
      </div>
    </div>
    <div className="np-detail" hidden={view==='player'}><BackButton className="np-back" onClick={()=>setView('player')}>Volver al reproductor</BackButton><h2 ref={detailHeading} tabIndex={-1}>{view==='lyrics'?'Letra':'Cola de reproducción'}</h2><p className="np-detail-track">{props.title} · {props.artist}</p>
      <div hidden={view!=='lyrics'} className="np-lyrics-content">{props.lyrics}</div><div hidden={view!=='queue'} className="np-queue-content">{props.queue}</div>
      {(view==='lyrics'||view==='queue')&&transport()}
    </div>
  </div>;
}
