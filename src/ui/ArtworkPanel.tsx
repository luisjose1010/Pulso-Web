import {formatStorageMB} from '../library/storage-format';
import type {Activity} from '../playback/ownership';
import {useEffect, useRef, useState} from 'react';
import './artwork.css';
import type {ArtworkFailure} from '../imports/artwork';
import {readArtwork, type ArtworkRead} from '../library/artwork';

export function artworkFailureText(code: ArtworkFailure): string {
  switch (code) {
    case 'image-size': return `La imagen debe ocupar como máximo ${formatStorageMB(2*1024*1024)} y no estar vacía.`;
    case 'image-format': return 'Elige una imagen PNG, JPEG o WebP válida.';
    case 'image-structure': return 'La imagen está dañada o usa una estructura no admitida. Prueba otra.';
    case 'image-dimensions': return 'La imagen supera 4096 píxeles por lado o 4 megapíxeles.';
    case 'decode-unavailable': return 'Este navegador no permite comprobar la imagen. Prueba otro navegador.';
    case 'decode-failed': return 'No se pudo abrir la imagen. Prueba otra.';
    case 'tag-size': return 'La portada incrustada se omitió por su tamaño.';
    case 'tag-invalid': return 'Los datos de la portada incrustada no son válidos.';
    case 'tag-unsupported': return 'No se pudo inspeccionar este tipo de portada incrustada.';
    case 'format-not-inspected': return 'No se inspeccionó la portada de este formato de audio.';
    case 'storage-failed': return 'No se pudo acceder a la portada guardada. Vuelve a intentarlo.';
    case 'conflict': return 'La portada o la pista cambió. Recarga el estado antes de volver a intentarlo.';
  }
}

export function artworkStateText(artwork: ArtworkRead): string {
  switch (artwork.state) {
    case 'ready': return artwork.manual ? 'Portada elegida manualmente' : 'Portada incrustada en el audio';
    case 'absent': return artwork.manual ? 'Portada ocultada manualmente' : 'Sin portada incrustada';
    case 'unrecorded': return 'Portada aún no registrada';
    case 'unavailable': return `Portada no disponible. ${artworkFailureText(artwork.failureCode)}`;
    case 'not-inspected': return `Portada no inspeccionada${artwork.failureCode ? `. ${artworkFailureText(artwork.failureCode)}` : '.'}`;
    case 'invalid': return `Portada inválida${artwork.failureCode ? `. ${artworkFailureText(artwork.failureCode)}` : '.'}`;
    case 'omitted': return `Portada omitida${artwork.failureCode ? `. ${artworkFailureText(artwork.failureCode)}` : '.'}`;
  }
}

export interface ArtworkPanelProps {
  activity: Activity;
  trackId: string;
  title: string;
  refreshToken: number;
}

export function ArtworkPanel({activity, trackId, title, refreshToken}: ArtworkPanelProps) {
  const container = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const [visible, setVisible] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [artwork, setArtwork] = useState<ArtworkRead | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') { setFallback(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const current = ++generation.current;const scope=activity.scope();
    setArtwork(null);
    setUrl(null);
    setMessage('');
    let objectUrl: string | null = null;
    if (visible) {
      const operation=activity.begin();
      void readArtwork(trackId).then(result => {
        if (!scope() || generation.current !== current) return;
        if (result.state === 'ready') {
          try { objectUrl = URL.createObjectURL(result.blob); setUrl(objectUrl); }
          catch { setMessage('No se pudo mostrar la portada. Vuelve a intentarlo.'); }
        }
        setArtwork(result);
      }).catch(() => {
        if (scope() && generation.current === current) setMessage('No se pudo leer la portada. Vuelve a intentarlo.');
      }).finally(()=>operation?.end());
    }
    return () => { generation.current++; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [trackId, refreshToken, visible, reload]);

  return <div ref={container} className="artwork-panel">
    {url ? <img src={url} width={88} height={88} alt={`Portada de ${title}`} className="artwork-image" onError={() => { URL.revokeObjectURL(url); setUrl(null); setMessage('No se pudo mostrar la portada. Vuelve a intentarlo.'); }} /> :
      <div aria-hidden="true" className="artwork-placeholder">♪</div>}
    <p>{artwork ? artworkStateText(artwork) : visible ? (message || 'Cargando portada…') : 'Portada sin cargar'}</p>
    {fallback && !visible && <button type="button" onClick={() => setVisible(true)}>Cargar portada</button>}
    {visible && (message || artwork?.state === 'unavailable') && <button type="button" onClick={() => setReload(value => value + 1)}>Volver a cargar portada</button>}
    {message && <p role="status">{message}</p>}
  </div>;
}
