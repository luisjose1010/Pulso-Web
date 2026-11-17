import './playback-indicator.css';

/** Visible only for the live player snapshot; selection and paused state never set it. */
export function PlaybackIndicator(){return <span className="playback-indicator" role="img" aria-label="Reproduciendo" title="Reproduciendo"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6v4M7 3v10M11 5v6M15 2v12"/></svg></span>;}
