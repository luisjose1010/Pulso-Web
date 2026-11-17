import {formatStorageMB} from '../library/storage-format';
import type {BeginPanelDiagnostic,PanelDiagnosticAttempt,PanelOperation} from '../diagnostics/panel-mapping';
import type {Activity} from '../playback/ownership';
import {useEffect, useRef, useState} from 'react';
import {applyOrganization, exportOrganization, inspectOrganizationApply, startOrganizationRecovery, OrganizationBackupError, previewOrganization, type OrganizationChoice, type OrganizationPreview} from '../library/organization-backup';

export interface OrganizationPanelProps {
  activity: Activity;
  canWrite: boolean;
  /** Capture root admission during render; a retained callback keeps that epoch. */
  captureWriteCurrent?: () => () => boolean;
  beginDiagnostic?: BeginPanelDiagnostic;
  onStatus: (message: string) => void;
  onCommitted: (attempt?:PanelDiagnosticAttempt) => Promise<void>;
}

const operationKey = 'pulso-web:organization:pending-operation';
const historyKey = 'pulso-web:organization:unknown-history';
function storedHistory(): string[] {
  try { const value: unknown = JSON.parse(sessionStorage.getItem(historyKey) ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; } catch { return []; }
}
const maxBytes = 8 * 1024 * 1024;
function storedOperation(): string | null {
  try { return sessionStorage.getItem(operationKey); } catch { return null; }
}
function storeOperation(id: string | null) {
  try { if (id) sessionStorage.setItem(operationKey, id); else sessionStorage.removeItem(operationKey); } catch { /* La consulta sigue disponible mientras el panel permanezca abierto. */ }
}
function messageFor(error: unknown): string {
  if (!(error instanceof OrganizationBackupError)) return 'No se pudo completar la operación de organización.';
  switch (error.code) {
    case 'format': return 'El archivo de organización no tiene un formato válido.';
    case 'version': return 'La versión del archivo no es compatible.';
    case 'limits': return 'El archivo o la organización supera los límites permitidos.';
    case 'relations': return 'El archivo contiene relaciones inválidas.';
    case 'local-corrupt': return 'La organización local contiene datos dañados. Repáralos antes de continuar.';
    case 'busy': return 'Hay otra operación de escritura activa. Espera y vuelve a intentarlo.';
    case 'imports-unresolved': return 'Hay importaciones pendientes de resolver. Resuélvelas antes de restaurar.';
    case 'stale-preview': return 'La organización cambió. Solicita una nueva vista previa.';
    case 'plan-expired': return 'La vista previa caducó. Solicita una nueva vista previa.';
    case 'invalid-choice': return 'No se pudieron validar las decisiones. Solicita una nueva vista previa.';
    case 'fingerprint-conflict': return 'Hay canciones con archivos incompatibles. Revisa los conflictos antes de continuar.';
    case 'export-reused': return 'El archivo no coincide con una copia previamente identificada.';
    case 'cancelled': return 'La restauración se canceló sin aplicar cambios.';
    case 'quota': return 'No hay espacio suficiente para guardar la organización.';
    case 'storage': return 'No se pudo acceder al almacenamiento de organización.';
    case 'uncertain': return 'El resultado de la restauración aún no se conoce. Compruébalo antes de continuar.';
  }
}

export function OrganizationPanel({activity, canWrite, captureWriteCurrent, onStatus, onCommitted, beginDiagnostic}: OrganizationPanelProps) {
  const [phase, setPhase] = useState<'draft' | 'preview' | 'confirm' | 'apply'>('draft');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<OrganizationPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, OrganizationChoice>>({});
  const [pending, setPending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [download, setDownload] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [operation, setOperation] = useState<string | null>(storedOperation);
  const [history, setHistory] = useState<string[]>(storedHistory);
  const [canRecover, setCanRecover] = useState(false);
  const [confirmRecovery, setConfirmRecovery] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const currentFile = useRef<File | null>(null);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const url = useRef<string | null>(null);
  const callbacks = useRef({onStatus, onCommitted});
  callbacks.current = {onStatus, onCommitted};
  const allowed=useRef(canWrite),admission=useRef(0);
  if(allowed.current!==canWrite){allowed.current=canWrite;++admission.current;}
  const admissionRevision=admission.current,activityScope=activity.scope();
  let writeGuard:()=>boolean;
  try{writeGuard=captureWriteCurrent?.()??(()=>true);}catch{writeGuard=()=>false;}
  const writeCurrent=()=>{try{return mounted.current&&canWrite&&allowed.current&&admissionRevision===admission.current&&activity.admitted&&activityScope()&&writeGuard();}catch{return false;}};
  const action=useRef(0);
  function begin(operation:PanelOperation,current:()=>boolean):PanelDiagnosticAttempt|null {
    // Keep the exact capability: main owns its identity in a private WeakMap.
    try{return beginDiagnostic?.(operation,current)??null;}catch{return null;}
  }
  function finish(attempt:PanelDiagnosticAttempt|null){try{attempt?.finish();}catch{/* isolated diagnostics */}}
  function observe(attempt:PanelDiagnosticAttempt|null){return attempt?((value:Parameters<PanelDiagnosticAttempt['complete']>[0])=>{try{attempt.complete(value);}catch{/* isolated diagnostics */}}):undefined;}
  const confirmRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; controller.current?.abort(); if (url.current) URL.revokeObjectURL(url.current); };
  }, []);
  useEffect(() => { if (phase === 'confirm') confirmRef.current?.focus(); }, [phase]);
  const report = (value: string) => { if (mounted.current) { setError(value); callbacks.current.onStatus(value); } };
  async function committed(attempt:PanelDiagnosticAttempt|null,current:()=>boolean) {
    activity.block('backup-uncertain', false);
    storeOperation(null);
    if (!current()) return;
    setOperation(null); setPreview(null); setPhase('draft');
    callbacks.current.onStatus('Organización restaurada.');
    // The parent records refresh failures on this same attempt. Do not emit a
    // duplicate failure here or reinterpret a confirmed commit as uncertain.
    try { await callbacks.current.onCommitted(attempt??undefined); } catch { if(current())report('La organización se restauró, pero no se pudo actualizar la vista.'); }
  }
  async function makePreview(selected: File, nextChoices: Record<string, OrganizationChoice>) {
    if (!writeCurrent() || busy.current) return;
    const operationToken = activity.begin(); if (!operationToken) return;
    const token = ++generation.current,sequence=++action.current;
    const ownsState=()=>mounted.current&&token===generation.current&&sequence===action.current&&currentFile.current===selected;
    const current=()=>writeCurrent()&&operationToken.current()&&ownsState();
    const attempt=begin('preview-organization',current);
    setPreview(null); setPhase('draft'); setError(''); setPending(true);
    try {
      const result = await previewOrganization(selected, nextChoices, observe(attempt));
      if (!current()) return;
      setPreview(result); setChoices(Object.fromEntries(result.conflicts.map(c => [c.key, c.choice]))); setPhase('preview');
    } catch (cause) { if (current()) report(messageFor(cause)); }
    finally { finish(attempt); if(ownsState())setPending(false); operationToken.end(); }
  }
  async function exportFile() {
    if (!writeCurrent() || busy.current || pending || operation) return;
    const operationToken = activity.begin(); if (!operationToken) return;
    const sequence=++action.current,gen=generation.current,selected=currentFile.current;
    const current=()=>writeCurrent()&&operationToken.current()&&mounted.current&&sequence===action.current&&gen===generation.current&&selected===currentFile.current;
    const attempt=begin('export-organization',current);
    busy.current = true; setPending(true); setError('');
    try {
      const blob = await exportOrganization(observe(attempt));
      if (!current()) return;
      const next = URL.createObjectURL(blob);
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = next; setDownload(next);
    } catch (cause) { if(current())report(messageFor(cause)); }
    finally { finish(attempt); operationToken.end(); busy.current = false; if (mounted.current) setPending(false); }
  }
  async function apply() {
    if (!writeCurrent() || !preview || !preview.canApply || busy.current || pending || operation) return;
    const operationToken = activity.begin(); if (!operationToken) return;
    const sequence=++action.current,gen=generation.current,selected=currentFile.current;
    const current=()=>writeCurrent()&&operationToken.current()&&mounted.current&&sequence===action.current&&gen===generation.current&&selected===currentFile.current;
    const attempt=begin('apply-organization',current);
    busy.current = true; const active = new AbortController(); controller.current = active;
    activity.block('backup-uncertain', true);
    const id = preview.operationId; storeOperation(id); setOperation(id); setPhase('apply'); setPending(true); setError('');
    try { await applyOrganization(preview.planId, active.signal, observe(attempt)); if(current())await committed(attempt,current);else activity.block('backup-uncertain',false); }
    catch (cause) {
      if(!current())return;
      if (cause instanceof OrganizationBackupError && cause.code === 'uncertain') {
        const uncertainId = cause.operationId ?? id; storeOperation(uncertainId); activity.block('backup-uncertain', true);
        if (mounted.current) { setOperation(uncertainId); setPhase('draft'); report(messageFor(cause)); }
      } else {
        activity.block('backup-uncertain', false);
        storeOperation(null);
        if (mounted.current) { setOperation(null); setPreview(null); setPhase('draft'); report(messageFor(cause)); }
      }
    } finally { finish(attempt); operationToken.end(); controller.current = null; busy.current = false; if (mounted.current) { setPending(false); setCancelling(false); } }
  }
  async function inspect() {
    if (!writeCurrent() || !operation || busy.current || pending) return;
    const operationToken = activity.begin(); if (!operationToken) return;
    const sequence=++action.current,gen=generation.current,selected=currentFile.current;
    const current=()=>writeCurrent()&&operationToken.current()&&mounted.current&&sequence===action.current&&gen===generation.current&&selected===currentFile.current;
    const attempt=begin('inspect-organization',current);
    busy.current = true; setPending(true); setError(''); setCanRecover(false); setConfirmRecovery(false);
    try {
      const result = await inspectOrganizationApply(operation, observe(attempt));
      if(!current())return;
      if (result.state === 'committed') await committed(attempt,current);
      else if (mounted.current && result.state === 'not-committed') {
        activity.block('backup-uncertain', false);
        storeOperation(null); setOperation(null); setPreview(null); setPhase('draft');
        report('La restauración no se aplicó. Solicita una nueva vista previa para continuar.');
      } else if (mounted.current) {
        setCanRecover(result.reason === 'original-library-unavailable');
        report(result.reason === 'original-library-unavailable' ? 'La biblioteca original ya no está disponible en este almacenamiento. El resultado anterior sigue siendo desconocido.' : 'El resultado sigue sin conocerse. Vuelve a comprobarlo antes de continuar.');
      }
    } catch { if(current())report('No se pudo comprobar el resultado. Vuelve a intentarlo.'); }
    finally { finish(attempt); operationToken.end(); busy.current = false; if (mounted.current) setPending(false); }
  }
  async function recover() {
    if (!operation || !canRecover || !confirmRecovery || busy.current || pending || !writeCurrent()) return;
    const operationToken = activity.begin(); if (!operationToken) return;
    const sequence=++action.current,gen=generation.current,selected=currentFile.current;
    const current=()=>writeCurrent()&&operationToken.current()&&mounted.current&&sequence===action.current&&gen===generation.current&&selected===currentFile.current;
    const attempt=begin('recover-organization',current);
    busy.current = true; setPending(true);
    try {
      await startOrganizationRecovery(operation, observe(attempt));
      if(!current())return;
      const next = [...new Set([...history, operation])];
      // Persist history before releasing the gate; failure keeps the old tracking.
      sessionStorage.setItem(historyKey, JSON.stringify(next));
      activity.block('backup-uncertain', false);
      storeOperation(null);
      if (!mounted.current) return;
      ++generation.current; currentFile.current = null;
      setHistory(next); setOperation(null); setCanRecover(false); setConfirmRecovery(false);
      setPreview(null); setFile(null); setChoices({}); setPhase('draft');
      report('Seguimiento anterior abandonado con resultado desconocido. Selecciona la copia y crea una nueva vista previa para restaurar aquí.');
    } catch (cause) { if(!current())return;setCanRecover(false); setConfirmRecovery(false); report(messageFor(cause)); }
    finally { finish(attempt); operationToken.end(); busy.current = false; if (mounted.current) setPending(false); }
  }
  useEffect(() => { activity.block('backup-uncertain', !!operation); }, [activity, operation]);
  useEffect(() => { activity.block('backup-confirm', phase === 'confirm' || confirmRecovery); return () => activity.block('backup-confirm', false); }, [activity, phase, confirmRecovery]);
  const blocked = pending || !!operation;
  const fingerprintWarnings = preview?.warnings.filter(w => w.startsWith('fingerprint-conflict:')).length ?? 0;
  const audioWarnings = preview?.warnings.filter(w => w.startsWith('audio-unavailable:')).length ?? 0;
  const otherWarnings = (preview?.warnings.length ?? 0) - fingerprintWarnings - audioWarnings;
  return <details>
    <summary>Exportar e importar organización</summary>
    <p>La copia contiene metadatos, favoritos y listas. No incluye audio, portadas, letras ni cuentas. El almacenamiento del navegador puede sufrir purgas; conserva una copia externa.</p>
    <button type="button" disabled={!canWrite || blocked} onClick={() => void exportFile()}>Preparar exportación</button>
    {download && <p><a href={download} download="pulso-organizacion.json">Descargar organización</a></p>}
    <label>Importar organización <input type="file" accept="application/json,.json" disabled={!canWrite || blocked} onChange={event => {
      if(!writeCurrent()||busy.current||pending||operation)return;
      const selected = event.currentTarget.files?.[0] ?? null; currentFile.current = selected; ++generation.current;
      setFile(selected); setPreview(null); setChoices({}); setPhase('draft'); setError('');
      if (!selected) return;
      if (selected.size > maxBytes) { report(`El archivo supera el límite de ${formatStorageMB(maxBytes)}.`); return; }
      void makePreview(selected, {});
    }} /></label>
    {file && !preview && !blocked && file.size <= maxBytes && <button type="button" disabled={!canWrite} onClick={() => void makePreview(file, {})}>Crear nueva vista previa</button>}
    {pending && <p role="status">{phase === 'apply' ? (cancelling ? 'Solicitando cancelación; esperando el resultado guardado…' : 'Aplicando organización…') : 'Preparando…'}</p>}
    {phase === 'apply' && <button type="button" disabled={cancelling} onClick={() => { setCancelling(true); controller.current?.abort(); }}>Cancelar restauración</button>}
    {operation && phase !== 'apply' && <div><p>El resultado de una restauración está pendiente de comprobación.</p><button type="button" disabled={pending} onClick={() => void inspect()}>Comprobar resultado</button></div>}
    {canRecover && operation && <div>
      <p>El seguimiento anterior puede abandonarse para restaurar en este almacenamiento. Su resultado seguirá desconocido; no se repetirá el plan anterior ni se borrarán canciones.</p>
      {!confirmRecovery ? <button type="button" disabled={pending || !canWrite} onClick={() => {if(!writeCurrent()||busy.current||pending)return;activity.block('backup-confirm',true);setConfirmRecovery(true);}}>Restaurar en este almacenamiento</button> : <div>
        <p>Confirma que quieres abandonar el seguimiento anterior y preparar una restauración nueva.</p>
        <button type="button" disabled={pending || !canWrite} onClick={() => void recover()}>Confirmar abandono del seguimiento</button>
        <button type="button" disabled={pending} onClick={() => setConfirmRecovery(false)}>Volver al seguimiento</button>
      </div>}
    </div>}
    {history.length > 0 && <div><p>Restauraciones anteriores con resultado desconocido:</p><ul>{history.map(id => <li key={id}>Resultado desconocido · Operación {id}</li>)}</ul></div>}
    {error && <p role="alert">{error}</p>}
    {preview && (phase === 'preview' || phase === 'confirm') && <div>
      <p>Resultado total: {preview.counts.tracks} canciones, {preview.counts.playlists} listas, {preview.counts.favorites} favoritos y {preview.counts.entries} entradas. Nuevas: {preview.counts.newTracks} canciones y {preview.counts.newPlaylists} listas.</p>
      {fingerprintWarnings > 0 && <p>{fingerprintWarnings} canciones tienen archivos incompatibles; no se puede aplicar esta vista previa.</p>}
      {audioWarnings > 0 && <p>{audioWarnings} canciones no tienen información suficiente de audio. La copia no incluye los archivos de audio.</p>}
      {otherWarnings > 0 && <p>Hay {otherWarnings} advertencias adicionales sobre la organización.</p>}
      {preview.conflicts.length > 0 && <ul>{preview.conflicts.map((conflict, index) => <li key={conflict.key}>
        <p>{conflict.entity === 'track' ? 'Canción' : 'Lista'}: local «{conflict.localLabel}»; copia «{conflict.backupLabel}».</p>
        {conflict.losesLocalAlbum&&<p>{conflict.choice==='use-backup'?'Esta decisión retirará':'Elegir «Usar copia» retirará'} los datos de disco, pista y artista del álbum conservados localmente, porque esta copia no los contiene. «Conservar local» los mantiene.</p>}
        <select aria-label={`Decisión para ${conflict.entity === 'track' ? 'canción' : 'lista'} ${index + 1}: ${conflict.localLabel}`} value={conflict.choice} disabled={!canWrite || blocked || phase === 'confirm'} onChange={event => {
          if (!writeCurrent()||busy.current||pending||operation||phase==='confirm'||!file) return;
          const next = {...choices, [conflict.key]: event.currentTarget.value as OrganizationChoice};
          setChoices(next); void makePreview(file, next);
        }}><option value="keep-local">Conservar local</option><option value="use-backup">Usar copia</option></select>
      </li>)}</ul>}
      {phase === 'preview' && <button type="button" disabled={!canWrite || blocked || !preview.canApply} onClick={() => {if(!writeCurrent()||busy.current||pending||operation||!preview.canApply)return;activity.block('backup-confirm',true);setPhase('confirm');}}>Aplicar organización</button>}
      {phase === 'confirm' && <div onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setPhase('preview'); } }}>
        <p ref={confirmRef} tabIndex={-1}>Confirma la restauración con las decisiones mostradas. Los datos locales ajenos a la copia se conservan.</p>
        <button type="button" disabled={!canWrite || blocked} onClick={() => void apply()}>Confirmar restauración</button>
        <button type="button" onClick={() => setPhase('preview')}>Volver</button>
      </div>}
    </div>}
  </details>;
}
