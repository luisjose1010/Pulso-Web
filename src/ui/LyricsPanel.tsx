import {formatStorageMB} from '../library/storage-format';
import type {Activity} from '../playback/ownership';
import {useEffect, useRef, useState} from 'react';
import {LYRICS_LIMITS, LyricsError, lyricsDraft, parseLyrics, readLyrics, setManualLyrics, type LyricsFormat, type LyricsRead} from '../library/lyrics';
import type {ImportLyricsWarning} from '../imports/import-file';
import './lyrics.css';
import {RemoteLyricsPanel,type RemoteLyricsPanelProps} from './RemoteLyricsPanel';

export interface LyricsPanelProps {
  activity: Activity;
  trackId: string;
  title: string;
  timeSeconds: number;
  canEdit: boolean;
  /** Root admission captured during render; retained callbacks keep that epoch. */
  captureWriteCurrent?: () => () => boolean;
  onStatus: (message: string) => void;
  external?: Pick<RemoteLyricsPanelProps,'artist'|'album'|'durationSeconds'|'available'|'canRequest'|'captureCurrent'>;
}

const errorText = (error: unknown) => error instanceof LyricsError ? error.message : 'No se pudo completar la operación de letras. Vuelve a intentarlo.';

export function lyricsImportWarningText(code: ImportLyricsWarning): string {
  const audio = 'El audio se guardó correctamente. ';
  switch (code) {
    case 'payload-size': case 'walk-limit': case 'lyrics-limit':
    case 'size': case 'lines': case 'line-size': case 'cues':
      return audio + 'Se omitió parte de la lectura de letras por los límites de tamaño o contenido. Puedes añadir una letra manualmente o importar un LRC.';
    case 'tag-unsupported': case 'encoding-unsupported': case 'sylt-frames':
      return audio + 'Parte de la letra incluida usa un formato no admitido. Puedes añadirla manualmente o importar un LRC.';
    case 'format-not-inspected':
      return audio + 'No se inspeccionó el audio en busca de letras. Puedes añadir una letra manualmente o importar un LRC.';
    case 'tag-invalid': case 'lyrics-invalid':
      return audio + 'Falló la lectura de la letra incluida. Puedes añadirla manualmente o importar un LRC.';
    case 'quota':
      return audio + 'No se pudo guardar la letra por falta de espacio. Libera espacio y vuelve a intentarlo.';
    case 'storage':
      return audio + 'No se pudo guardar la letra. Reabre la aplicación y vuelve a intentarlo.';
    case 'conflict':
      return audio + 'La letra cambió durante la importación. Revisa la letra guardada antes de editarla.';
    case 'unicode': case 'format': case 'timestamp': case 'offset':
      return audio + 'No se pudo utilizar la letra incluida. Puedes corregirla y añadirla manualmente o importar un LRC.';
    case 'track': case 'corrupt': case 'locks':
      return audio + 'No se pudo guardar la letra. Revisa la pista y vuelve a intentarlo.';
    default:
      return audio + 'No se pudo completar la operación de letras. Revisa la letra e inténtalo de nuevo.';
  }
}

export function LyricsPanel({activity, trackId, title, timeSeconds, canEdit, captureWriteCurrent, onStatus, external}: LyricsPanelProps) {
  const generation = useRef(0);
  const identity = useRef(trackId);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const statusRef = useRef(onStatus);
  const editableRef = useRef(canEdit);
  editableRef.current = canEdit;
  statusRef.current = onStatus;
  if (identity.current !== trackId) { identity.current = trackId; generation.current++; busyRef.current = false; }
  let writeGuard: () => boolean;
  try { writeGuard = captureWriteCurrent?.() ?? (() => true); }
  catch { writeGuard = () => false; }
  const writeCurrent = () => {
    try { return mounted.current && identity.current === trackId && editableRef.current && writeGuard(); }
    catch { return false; }
  };
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<LyricsRead | null>(null);
  const [draft, setDraft] = useState('');
  const [format, setFormat] = useState<LyricsFormat>('plain');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => {
    const current = ++generation.current;const scope=activity.scope();
    busyRef.current = false;
    setBusy(false); setResult(null); setDraft(''); setFormat('plain'); setMessage('');
    if (!open) return;
    const operation=activity.begin();
    busyRef.current = true; setBusy(true);
    void readLyrics(trackId).then(value => {
      if (!scope() || !mounted.current || generation.current !== current) return;
      setResult(value);
      if (value.state === 'ready') { const next = lyricsDraft(value.lyrics); setDraft(next.text); setFormat(next.format); }
    }).catch(error => {
      if (scope() && mounted.current && generation.current === current) setMessage(errorText(error));
    }).finally(() => {
      operation?.end();
      if (mounted.current && generation.current === current) { busyRef.current = false; setBusy(false); }
    });
    return () => { generation.current++; };
  }, [trackId, open, reload]);

  async function importFile(file: File) {
    if (!writeCurrent() || busyRef.current) return;
    const operation = activity.begin(); if (!operation) return;
    const current = generation.current;
    busyRef.current = true; setBusy(true); setMessage('');
    try {
      if (file.size > LYRICS_LIMITS.bytes) throw new LyricsError('size');
      if (!/\.(txt|lrc)$/i.test(file.name)) { setMessage('Elige un archivo .txt o .lrc.'); return; }
      let text: string;
      try { text = new TextDecoder('utf-8', {fatal: true}).decode(await file.arrayBuffer()); }
      catch { throw new LyricsError('unicode'); }
      if (!operation.current() || !writeCurrent() || generation.current !== current) return;
      if (text.length > LYRICS_LIMITS.bytes) throw new LyricsError('size');
      setDraft(text); setMessage('Archivo cargado como borrador. Elige el formato y guarda para aplicarlo.');
    } catch (error) {
      if (writeCurrent() && generation.current === current) setMessage(errorText(error));
    } finally {
      operation.end();
      if (operation.current() && mounted.current && generation.current === current) { busyRef.current = false; setBusy(false); }
    }
  }

  async function save(text: string | null) {
    if (!writeCurrent() || busyRef.current || !result || (result.state === 'unavailable' && !result.repairToken)) return;
    const operation = activity.begin(); if (!operation) return;
    const current = generation.current;
    busyRef.current = true; setBusy(true); setMessage('');
    try {
      if (text !== null && parseLyrics(text, format).kind === 'absent') {
        setMessage('Para guardar la ausencia, usa «Sin letras».'); return;
      }
      if (!operation.current() || !writeCurrent()) return;
      const value = await setManualLyrics(trackId, text, format, result.revision, result.state === 'unavailable' ? result.repairToken : undefined);
      if (!operation.current() || !writeCurrent() || generation.current !== current) return;
      setResult(value);
      if (value.state === 'ready') setDraft(value.lyrics.text);
      else if (value.state === 'absent') setDraft('');
      const notice = text === null ? 'Elección «Sin letras» guardada.' : 'Letras guardadas.';
      setMessage(notice); statusRef.current(notice);
    } catch (error) {
      if (!operation.current() || !writeCurrent() || generation.current !== current) return;
      const notice = errorText(error); setMessage(notice); statusRef.current(notice);
      if (error instanceof LyricsError && error.code === 'conflict') setResult(null);
    } finally {
      operation.end();
      if (operation.current() && mounted.current && generation.current === current) { busyRef.current = false; setBusy(false); }
    }
  }

  const editable = canEdit && !busy && !!result && (result.state !== 'unavailable' || !!result.repairToken);
  const timed = result?.state === 'ready' && result.lyrics.kind === 'timed' ? result.lyrics : null;
  const timeMs = timeSeconds * 1000;
  let activeTime: number | null = null;
  if (timed && Number.isFinite(timeMs) && timeMs >= 0) {
    for (const cue of timed.cues) { if (cue.timeMs > timeMs) break; activeTime = cue.timeMs; }
  }

  return <details className="lyrics-panel" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Letras locales</summary>
    {open && <>
      <p>{external?.available?'Las letras locales tienen prioridad. La consulta en línea es opcional.':'Aquí puedes editar las letras guardadas en este navegador.'}</p>
      {busy && !result && <p>Cargando letras…</p>}
      {result?.state === 'absent' && <p>Sin letras para {title}.{result.origin?.provenance === 'manual' && ' Elección «Sin letras» guardada por ti.'}</p>}
      {result?.state === 'unavailable' && <p>Letras no disponibles. {new LyricsError(result.failureCode).message} {result.repairToken ? 'Puedes reparar el registro guardando una nueva elección.' : 'No se puede guardar hasta volver a leer el estado.'}</p>}
      {result?.state === 'ready' && result.origin?.provenance === 'embedded' && <p>Letra incluida en el audio</p>}
      {result?.state === 'ready' && result.origin?.provenance === 'manual' && <p>Letra añadida o editada por ti</p>}
      {result?.state === 'ready' && result.lyrics.kind === 'plain' && <><p>Letra sin sincronización</p><p className="lyrics-text">{result.lyrics.text}</p></>}
      {timed && <><p>Letra sincronizada</p><ol className="lyrics-cues">{timed.cues.map((cue, index) => <li key={index} aria-current={activeTime !== null && cue.timeMs === activeTime ? 'true' : undefined} className={activeTime !== null && cue.timeMs === activeTime ? 'lyrics-current' : undefined}>{activeTime !== null && cue.timeMs === activeTime && <span>Actual: </span>}{cue.text}</li>)}</ol></>}
      {external && result?.state === 'absent' && result.origin?.provenance !== 'manual' && <RemoteLyricsPanel {...external} activity={activity} trackId={trackId} title={title} timeSeconds={timeSeconds} onStatus={onStatus}/>}
      <fieldset disabled={!editable}>
        <legend>Editar letras de {title}</legend>
        {result?.state === 'ready' && lyricsDraft(result.lyrics).warning && <p>{lyricsDraft(result.lyrics).warning}</p>}
        <p>El texto es un borrador y no se aplica hasta que pulses Guardar. Usa solo archivos propios o autorizados.</p>
        <label>Formato <select aria-label="Formato de letras" value={format} onChange={event => setFormat(event.currentTarget.value as LyricsFormat)}><option value="plain">Texto sin sincronización</option><option value="lrc">LRC sincronizado</option></select></label>
        <label>Importar archivo .txt o .lrc (máximo {formatStorageMB(LYRICS_LIMITS.bytes)}) <input type="file" accept=".txt,.lrc" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void importFile(file); }} /></label>
        <label>Texto del borrador <textarea aria-label="Texto del borrador" maxLength={LYRICS_LIMITS.bytes} value={draft} onChange={event => setDraft(event.currentTarget.value)} /></label>
        <button type="button" onClick={() => void save(draft)}>Guardar letras</button>{' '}
        <button type="button" onClick={() => void save(null)}>Sin letras</button>
      </fieldset>
      {!canEdit && <p>La edición no está disponible ahora.</p>}
      {(!result || result.state === 'unavailable') && !busy && <button type="button" onClick={() => setReload(value => value + 1)}>Volver a leer letras</button>}
      {message && <p role="status">{message}</p>}
    </>}
  </details>;
}
