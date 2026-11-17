import {formatStorageProgress} from '../library/storage-format';
import {fromKnownError,copyFailureV1} from '../errors/app-failure';
import type {BeginPanelDiagnostic,PanelDiagnosticAttempt,PanelOperation} from '../diagnostics/panel-mapping';
import type {Activity,ActivityToken} from '../playback/ownership';
import {useEffect, useRef, useState} from 'react';
import type {Playlist} from '../library/library';
import {createLocalBatch, listLocalBatches, localBatchProgress, readLocalBatch, recoverLocalBatch, retryLocalBatch, runLocalBatch, LocalBatchError, batchErrorObservation, type LocalBatch, type LocalBatchProgress, type LocalBatchState} from '../library/local-batches';

export interface LocalBatchPanelProps {
  activity: Activity;
  beginDiagnostic?: BeginPanelDiagnostic;
  playlist: Playlist | null;
  canStart: boolean;
  captureWriteCurrent?:()=>()=>boolean;
  onStatus: (msg: string) => void;
}

const stateLabels: Record<LocalBatchState, string> = {
  queued: 'En espera', verifying: 'Verificando', complete: 'Completada',
  incomplete: 'Incompleta', cancelled: 'Cancelada', interrupted: 'Interrumpida', failed: 'Fallida',
};

function errorMessage(error: unknown): string {
  if (!(error instanceof LocalBatchError)) return 'No se pudo consultar o verificar el lote. Conserva tus copias y revisa el lote.';
  switch (error.code) {
    case 'conflict': return 'El lote o la playlist cambió. Actualiza su estado y vuelve a intentarlo.';
    case 'empty': return 'La playlist está vacía. Añade entradas antes de verificar.';
    case 'busy': return 'Hay otra verificación activa. Espera a que termine antes de revisar este lote.';
    case 'invalid-relation': case 'not-found': return 'Faltan datos o archivos de la playlist. Reimporta los originales que falten y revisa la lista.';
    case 'retry-required': return 'El estado del lote cambió. Actualiza el historial y vuelve a intentarlo.';
    case 'storage': case 'worker': return 'No se pudo terminar la verificación. Conserva tus copias y revisa el lote para recuperarlo.';
    case 'invalid-input': return 'No se pudo iniciar el lote. Actualiza la playlist y vuelve a intentarlo.';
  }
}
// Domain rejections complete their abort before returning. Storage/worker failures
// may have lost the durable outcome and still require explicit reconciliation.
function uncertain(error: unknown): boolean {
  return !(error instanceof LocalBatchError) || error.code === 'storage' || error.code === 'worker';
}

export function LocalBatchPanel({activity, playlist, canStart, captureWriteCurrent, onStatus, beginDiagnostic}: LocalBatchPanelProps) {
  const [jobs, setJobs] = useState<LocalBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState<LocalBatchProgress | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [running, setRunning] = useState(false);
  const mounted = useRef(false);
  const active = useRef<{id: string; attempt: number; controller: AbortController} | null>(null);
  const busy = useRef(false);
  const loadSequence = useRef(0);
  const status = useRef(onStatus);
  status.current = onStatus;
  const allowed=useRef(canStart);allowed.current=canStart;
  let writeGuard:()=>boolean;
  try{writeGuard=captureWriteCurrent?.()??(()=>true);}catch{writeGuard=()=>false;}
  const writeCurrent=()=>{try{return mounted.current&&allowed.current&&writeGuard();}catch{return false;}};
  const actionSequence=useRef(0);
  function begin(operation:PanelOperation,current:()=>boolean):PanelDiagnosticAttempt|null {
    try{const d=beginDiagnostic?.(operation,current);if(!d)return null;
      return {complete:value=>{try{d.complete(value);}catch{/* isolated observer */}},refreshFailed:failure=>{try{d.refreshFailed(failure);}catch{/* isolated observer */}},finish:()=>{try{d.finish();}catch{/* isolated observer */}}};
    }catch{return null;}
  }

  function put(job: LocalBatch) {
    if (!mounted.current) return;
    setJobs(previous => [job, ...previous.filter(item => item.id !== job.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10));
  }
  async function refresh(diagnostic:PanelDiagnosticAttempt|null=null,current:()=>boolean=()=>true) {
    const sequence = ++loadSequence.current,scope=activity.scope();
    activity.block('batch-scan',true);
    try {
      const result = await listLocalBatches();
      if(!scope()||!current())return;
      activity.block('batch-scan',false);
      activity.block('batch-records', result.some(job => job.state === 'verifying'));
      if (mounted.current && sequence === loadSequence.current) {
        setJobs(result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10));
        setError('');
      }
    } catch (cause) {
      if(!scope()||!current())return;
      const r=batchErrorObservation(cause).primary;
      diagnostic?.refreshFailed(copyFailureV1({version:1,phase:'refresh',family:r.family,code:r.code,backend:r.backend})??fromKnownError(cause,{phase:'refresh',backend:'idb'}));
      if (mounted.current && sequence === loadSequence.current) setError(errorMessage(cause));
    } finally {
      if (scope() && current() && mounted.current && sequence === loadSequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; ++loadSequence.current; active.current?.controller.abort(); active.current = null; };
  }, []);

  function report(cause: unknown) {
    if (!mounted.current) return;
    const message = errorMessage(cause);
    setError(message);
    status.current(message);
  }
  async function execute(job: LocalBatch, operation: ActivityToken, setDiagnostic:(d:PanelDiagnosticAttempt|null)=>void) {
    const run = {id: job.id, attempt: job.attempt + 1, controller: new AbortController()};
    active.current = run;
    const current=()=>operation.current()&&mounted.current&&active.current===run;
    const diagnostic=begin('verify-batch',current);setDiagnostic(diagnostic);
    if (mounted.current) { setActiveId(job.id); setProgress(null); setCancelling(false); setRunning(true); }
    try {
      const result = await runLocalBatch(job.id, run.controller.signal, value => {
        if (operation.current() && mounted.current && active.current === run && value.jobId === run.id && value.attempt === run.attempt) setProgress(value);
      },diagnostic?.complete);
      if(!current())return;
      activity.block('batch-uncertain', result.state === 'verifying');
      if (operation.current() && mounted.current && active.current === run) {
        put(result);
        setProgress(null);
        status.current(`Verificación ${stateLabels[result.state].toLowerCase()}.`);
      }
    } catch (cause) {
      if (operation.current() && mounted.current && active.current === run) {
        if (uncertain(cause)) activity.block('batch-uncertain', true);
        report(cause);
        try { const current = await readLocalBatch(job.id); if (operation.current() && mounted.current && active.current === run && current) put(current); } catch { /* El historial conserva su último estado conocido. */ }
      }
    }
  }
  async function action(kind: 'create' | 'run' | 'recover' | 'retry', job?: LocalBatch) {
    if (!writeCurrent() || busy.current || active.current || (kind==='create'?!playlist:!job)) return;
    const operation = activity.begin(); if (!operation) return;
    busy.current = true;
    const sequence=++actionSequence.current;
    const current=()=>operation.current()&&mounted.current&&actionSequence.current===sequence;
    let diagnostic:PanelDiagnosticAttempt|null=null;
    if(kind!=='run')diagnostic=begin(kind==='recover'?'recover-batch':'verify-batch',current);
    setActiveId(job?.id ?? 'creating');
    setError('');
    try {
      let next: LocalBatch;
      if (kind === 'create') {
        if (!playlist) return;
        next = await createLocalBatch(playlist.id, playlist.revision,diagnostic?.complete);
      } else {
        if (!job) return;
        next = kind === 'recover' ? await recoverLocalBatch(job.id, job.revision,diagnostic?.complete)
          : kind === 'retry' ? await retryLocalBatch(job.id, job.revision,diagnostic?.complete) : job;
      }
      if (!operation.current() || !mounted.current) return;
      activity.block('batch-uncertain', false);
      put(next);
      if (kind !== 'recover') {diagnostic?.finish();diagnostic=null;await execute(next,operation,d=>{diagnostic=d;});}
      else status.current('Estado del lote revisado. Puedes volver a verificarlo desde cero.');
      if(current())await refresh(diagnostic,current);
    } catch (cause) {
      if(!current())return;
      if (uncertain(cause)) activity.block('batch-uncertain', true);
      report(cause);
      if (current()) await refresh(diagnostic,current);
    } finally {
      if(current()){
        active.current=null;busy.current=false;
        setActiveId(null);setProgress(null);setCancelling(false);setRunning(false);
      }
      operation.end();
      diagnostic?.finish();
    }
  }

  return <section aria-labelledby="local-batch-heading">
    <h2 id="local-batch-heading">Verificar copias de la playlist completa</h2>
    <p>Reutiliza tus archivos importados; no se duplican ni se descargan de Telegram</p>
    <p>{playlist ? `La playlist seleccionada contiene ${playlist.entries.length} entradas en total. La verificación captura toda la playlist, independientemente del filtro visual.` : 'Selecciona una playlist para crear una verificación.'}</p>
    <button type="button" disabled={!canStart || !!activeId || !playlist} onClick={() => void action('create')}>Verificar copias</button>
    {running && <button type="button" disabled={cancelling} onClick={() => { if (active.current) { setCancelling(true); active.current.controller.abort(); } }}>Cancelar verificación</button>}
    {cancelling && <p role="status">Solicitando cancelación; esperando el resultado guardado.</p>}
    {error && <p role="alert">{error}</p>}
    <h3>Últimas verificaciones</h3>
    <button type="button" disabled={loading || !!activeId} onClick={() => void refresh()}>Actualizar historial</button>
    <p>Los resultados reflejan la última comprobación; el almacenamiento del navegador puede sufrir purgas. Volver a verificar reinicia la comprobación desde cero.</p>
    {loading ? <p role="status">Cargando historial…</p> : jobs.length === 0 ? <p>No hay verificaciones guardadas.</p> : <ul>
      {jobs.map(job => {
        const current = progress?.jobId === job.id && active.current?.attempt === progress.attempt ? progress : localBatchProgress(job);
        const total = job.entries.length;
        const bytes = Math.max(0, Math.min(current.bytesRead, current.totalBytes));
        const disabled = !canStart || !!activeId;
        return <li key={job.id}>
          <strong>{job.playlistName}</strong> — {stateLabels[current.state]}
          <p>{current.counts.ready} de {total} verificadas en la última comprobación.</p>
          <p>Verificadas: {current.counts.ready}; faltantes: {current.counts.missing}; inválidas: {current.counts.invalid}; cambiadas: {current.counts.changed}; fallidas: {current.counts.failed}; pendientes: {current.counts.pending}; en comprobación: {current.counts.verifying}.</p>
          {(current.counts.missing > 0 || current.counts.invalid > 0) && <p>Reimporta los originales que falten o estén dañados. Tu organización y las demás copias se conservan.</p>}
          {current.counts.changed > 0 && <p>Hay copias diferentes de las capturadas. Crea una verificación nueva de la playlist para comprobar su selección actual.</p>}
          <label htmlFor={`batch-progress-${job.id}`}>Leído: {formatStorageProgress(current.bytesRead,current.totalBytes)}</label>
          <progress id={`batch-progress-${job.id}`} value={bytes} max={Math.max(1, current.totalBytes)} />
          {job.state === 'queued' && <button type="button" disabled={disabled} onClick={() => void action('run', job)}>Iniciar verificación</button>}
          {job.state === 'verifying' && activeId !== job.id && <button type="button" disabled={disabled} onClick={() => void action('recover', job)}>Revisar interrupción</button>}
          {job.state !== 'queued' && job.state !== 'verifying' && <button type="button" disabled={disabled} onClick={() => void action('retry', job)}>Volver a verificar</button>}
        </li>;
      })}
    </ul>}
  </section>;
}
