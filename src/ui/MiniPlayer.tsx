import type { ReactNode } from 'react';

/** The catalogue hint belongs to one queue entry and never changes stored credits. */
export function miniPlayerArtist(track: {artist:string|null;manualOverrides:Partial<{artist:string|null}>}|undefined, entryId:string, hint:{entryId:string;artist:string}|null):string|null {
  if (track && Object.hasOwn(track.manualOverrides, 'artist')) return track.artist;
  return hint?.entryId===entryId ? hint.artist : track?.artist??null;
}

export interface MiniPlayerProps {
  title: string;
  artist: string | null;
  stateText: string;
  playing: boolean;
  canPlay: boolean;
  canPause: boolean;
  onPlay: () => void;
  onPause: () => void;
  onOpenPlayer: (opener: HTMLButtonElement) => void;
  artwork?: ReactNode;
  onPrevious?: () => void; onNext?: () => void; canPrevious?: boolean; canNext?: boolean;
  position?: number; duration?: number; onSeek?: (value:number)=>void;
  volume?: number; onVolume?: (value:number)=>void;
}

export function MiniPlayer(props: MiniPlayerProps) {
  const duration=typeof props.duration==='number'&&Number.isFinite(props.duration)&&props.duration>0?props.duration:0;
  const position=Math.max(0,Math.min(typeof props.position==='number'&&Number.isFinite(props.position)?props.position:0,duration));
  const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
  return (
    <section className="mini-player" aria-label="Mini reproductor">
      <button type="button" className="mini-player__details" title={[props.title,props.artist].filter(Boolean).join(' · ')} aria-label="Abrir reproductor desde título" onClick={event=>props.onOpenPlayer(event.currentTarget)}>
        {props.artwork&&<span className="mini-player__cover">{props.artwork}</span>}
        <span className="mini-player__copy"><span className="mini-player__title">{props.title}</span>
        {props.artist&&<span className="mini-player__artist">{props.artist}</span>}</span>
      </button>
      <div className="mini-player__actions">
        {props.onPrevious&&<button className="desktop-transport" type="button" aria-label="Anterior" disabled={!props.canPrevious} onClick={props.onPrevious}><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="m19 4-12 8 12 8ZM4 4h2v16H4Z"/></svg></button>}
        {props.playing ? (
          <button type="button" className="mini-player__toggle" aria-label="Pausar desde minirreproductor" disabled={!props.canPause} onClick={props.onPause}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" fill="none" stroke="currentColor" strokeWidth="4"/></svg></button>
        ) : (
          <button type="button" className="mini-player__toggle" aria-label="Reproducir desde minirreproductor" disabled={!props.canPlay} onClick={props.onPlay}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 4 12 8-12 8Z" fill="currentColor"/></svg></button>
        )}
        {props.onNext&&<button className="desktop-transport" type="button" aria-label="Siguiente" disabled={!props.canNext} onClick={props.onNext}><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="m5 4 12 8-12 8ZM18 4h2v16h-2Z"/></svg></button>}
      </div>
      {props.onSeek&&<label className="desktop-seek"><span className="mini-player__time" aria-hidden="true">{clock(position)}</span><span className="mini-player__range"><progress aria-hidden="true" max={duration||1} value={position}/><input aria-label="Posición desde barra" aria-valuetext={`${clock(position)} de ${clock(duration)}`} type="range" min="0" max={duration} step="0.1" value={position} disabled={!duration} onChange={event=>props.onSeek?.(Number(event.target.value))}/></span><span className="mini-player__time" aria-hidden="true">{clock(duration)}</span></label>}
      <div className="mini-player__utilities">
        {props.onVolume&&<label className="desktop-volume"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m11 5-6 4H2v6h3l6 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg><span className="mini-player__range"><progress aria-hidden="true" max="1" value={props.volume??1}/><input aria-label="Volumen" type="range" min="0" max="1" step="0.01" value={props.volume??1} onChange={event=>props.onVolume?.(Number(event.target.value))}/></span></label>}
        <button type="button" className="mini-player__expand" aria-label="Abrir reproductor desde minirreproductor" onClick={(event) => props.onOpenPlayer(event.currentTarget)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
      </div>
      {duration>0&&<progress className="mini-player__mobile-progress" aria-hidden="true" max={duration} value={position}/>}
    </section>
  );
}
