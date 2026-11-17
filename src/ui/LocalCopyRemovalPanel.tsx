import {formatStorageMB} from '../library/storage-format';
import type { Ref } from 'react';
import './local-copy-removal.css';

export type RemovalPanelState = 'preparing' | 'blocked' | 'ready' | 'working' | 'result' | 'uncertain';
export type RemovalPanelDeclaration = 'external-copy-declared' | 'accept-possible-only-original-loss';
export type RemovalPanelReason = 'player-current' | 'player-prepared' | 'queue-pending' | 'reader-active' | 'runtime-unknown' | 'transport-incompatible' | 'busy' | 'missing' | 'corrupt' | 'ownership-unknown' | 'shared-generation' | 'fingerprint-conflict' | 'references-incomplete' | 'limit' | 'changed' | 'database-unavailable' | 'confirmation-required';
export interface RemovalPanelSummary {
  readonly bytes: number | null;
  readonly tracks: number | null;
  readonly favorites: number | null;
  readonly playlists: number | null;
  readonly playlistEntries: number | null;
  readonly persistedQueueOccurrences: number | null;
}
export interface RemovalPanelOutcome {
  readonly state: 'prepared' | 'detached' | 'deleting' | 'removed' | 'not-committed' | 'unknown';
  readonly publication: 'linked' | 'unpublished' | 'unknown';
  readonly physical: 'present' | 'absent' | 'unknown';
  readonly recoveryRequired: boolean;
}
export interface RemovalPanelConsent {
  readonly planRevision: number;
  readonly declaration: RemovalPanelDeclaration;
  readonly confirmRemoveThisCopy: true;
}
export interface LocalCopyRemovalPanelProps {
  readonly state: RemovalPanelState;
  readonly title: string;
  readonly summary: RemovalPanelSummary | null;
  readonly reason: RemovalPanelReason | null;
  /** Textos seguros preparados por el padre; nunca errores raw ni identificadores. */
  readonly primaryMessage: string | null;
  readonly secondaryMessages: readonly string[];
  readonly outcome: RemovalPanelOutcome | null;
  readonly planRevision: number | null;
  /** El padre reinicia ambos campos por cada revisión de plan, también para continuar. */
  readonly declaration: RemovalPanelDeclaration | null;
  readonly confirmed: boolean;
  readonly onDeclarationChange: (value: RemovalPanelDeclaration) => void;
  readonly onConfirmedChange: (value: boolean) => void;
  readonly onConfirm: (consent: RemovalPanelConsent) => void;
  readonly onCancel: () => void;
  readonly onInspect: () => void;
  readonly onContinue: (consent: RemovalPanelConsent) => void;
  readonly onClose: () => void;
  readonly canUse: boolean;
  readonly canConfirm: boolean;
  readonly canInspect: boolean;
  readonly canContinue: boolean;
  readonly canClose: boolean;
  /** Own abort remains available while storage admission is revoked. */
  readonly canCancel?: boolean;
  readonly pending: boolean;
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

const reasons: Record<RemovalPanelReason, string> = {
  'player-current': 'Esta copia está en el reproductor. Prepara otra cola que no la use y vuelve a revisarla.',
  'player-prepared': 'Esta copia está en una cola preparada. Prepara otra cola que no la use y vuelve a revisarla.',
  'queue-pending': 'Hay una cola en preparación. Espera a que termine y revisa de nuevo.',
  'reader-active': 'Hay una lectura en curso. Vuelve a intentarlo cuando termine.',
  'runtime-unknown': 'No podemos comprobar el estado de esta copia. Revisa su estado.',
  'transport-incompatible': 'No podemos comprobar que esta copia sea apta para retirarla en esta sesión.',
  busy: 'Hay otra operación en curso. Vuelve a revisar la copia cuando termine.',
  missing: 'La copia ya no está disponible. Conservamos tus fichas y listas. Puedes buscarla de nuevo en Telegram si sigue disponible; no se descargará por sí sola.',
  corrupt: 'No podemos comprobar que esta copia sea apta para retirarla. Revisa su estado.',
  'ownership-unknown': 'No podemos comprobar que esta copia sea apta para retirarla. Revisa su estado.',
  'shared-generation': 'No podemos comprobar que esta copia sea apta para retirarla. Revisa su estado.',
  'fingerprint-conflict': 'No podemos comprobar que esta copia sea apta para retirarla. Revisa su estado.',
  'references-incomplete': 'No podemos comprobar todas las referencias. Revisa el estado de la copia.',
  limit: 'Esta copia supera los límites de esta revisión.',
  changed: 'La copia o sus referencias cambiaron. Revisa de nuevo antes de confirmar.',
  'database-unavailable': 'No podemos acceder al almacenamiento para revisar esta copia.',
  'confirmation-required': 'Revisa la copia y confirma tu decisión para continuar.',
};

function count(value: number | null): string {
  return value === null || !Number.isSafeInteger(value) || value < 0 ? 'Desconocido' : value.toLocaleString('es');
}

export function LocalCopyRemovalPanel(props: LocalCopyRemovalPanelProps) {
  const { state, outcome, summary } = props;
  const success = outcome?.state === 'removed' && outcome.publication === 'unpublished' && outcome.physical === 'absent' && !outcome.recoveryRequired;
  const reviewing = state === 'ready' || (state === 'result' && props.canContinue);
  const authorized = props.canUse && !props.pending && reviewing && props.planRevision !== null && props.declaration !== null && props.confirmed;
  const consent = (): RemovalPanelConsent | null => authorized && props.planRevision !== null && props.declaration !== null
    ? { planRevision: props.planRevision, declaration: props.declaration, confirmRemoveThisCopy: true } : null;
  const continuing = state === 'result' && props.canContinue;
  return <section className="copy-removal-panel" aria-labelledby="copy-removal-heading">
    <h2 id="copy-removal-heading" ref={props.headingRef} tabIndex={-1}>Quitar esta copia local</h2>
    <p className="copy-removal-panel__title">{props.title}</p>
    <p>Se quitará el audio de este navegador. Las fichas, favoritos y listas se conservan. Para volver a escucharla necesitarás conseguir una copia de nuevo; el bot podría dejar de ofrecerla.</p>
    <p>Este archivo puede ser tu único original. Preparar o descargar una exportación no demuestra que tengas otra copia fuera de este navegador.</p>
    <dl className="copy-removal-panel__summary">
      <div><dt>Tamaño</dt><dd>{formatStorageMB(summary?.bytes)}</dd></div>
      <div><dt>Fichas</dt><dd>{count(summary?.tracks ?? null)}</dd></div>
      <div><dt>Favoritos</dt><dd>{count(summary?.favorites ?? null)}</dd></div>
      <div><dt>Listas</dt><dd>{count(summary?.playlists ?? null)}</dd></div>
      <div><dt>Entradas de listas</dt><dd>{count(summary?.playlistEntries ?? null)}</dd></div>
      <div><dt>Ocurrencias en cola guardada</dt><dd>{count(summary?.persistedQueueOccurrences ?? null)}</dd></div>
    </dl>
    <p>La cola guardada se conserva; este resumen no determina si la copia está protegida por el reproductor o una cola activa.</p>
    {state === 'preparing' && <p role="status">Preparando la revisión…</p>}
    {state === 'working' && <p role="status">La operación está en curso. Cerrar esta revisión no deshace una fase ya confirmada ni cancela una operación de almacenamiento ya enviada.</p>}
    {state === 'blocked' && props.reason && <p role="status">{reasons[props.reason]}</p>}
    {state === 'uncertain' && <p role="status">No pudimos confirmar hasta dónde llegó la operación. Revisa el estado antes de tomar otra decisión.</p>}
    {outcome && <div role="status">
      {success ? <p>Copia local retirada. Fichas, favoritos y listas conservados. Puedes buscarla de nuevo en Telegram si sigue disponible; no se descargará por sí sola. El espacio que libere el navegador puede variar.</p> : <>
        {outcome.publication === 'unpublished' && <p>Las fichas ya no enlazan esta copia. La retirada del audio no está confirmada.</p>}
        {outcome.state === 'not-committed' && outcome.publication === 'linked' && <p>La retirada no se confirmó; la copia sigue enlazada.</p>}
        {(outcome.state === 'unknown' || outcome.publication === 'unknown' || outcome.physical === 'unknown' || outcome.recoveryRequired || outcome.state === 'removed') && <p>El resultado necesita revisión; no se puede confirmar la retirada completa.</p>}
      </>}
    </div>}
    {props.primaryMessage && <p>{props.primaryMessage}</p>}
    {props.secondaryMessages.length > 0 && <ul>{props.secondaryMessages.map((message, index) => <li key={index}>{message}</li>)}</ul>}
    {reviewing && <fieldset disabled={!props.canUse || props.pending}>
      <legend>Revisa y declara tu decisión para este plan</legend>
      <label><input type="radio" name="copy-removal-declaration" checked={props.declaration === 'external-copy-declared'} onChange={() => props.onDeclarationChange('external-copy-declared')} /> Declaro conservar una copia externa</label>
      <label><input type="radio" name="copy-removal-declaration" checked={props.declaration === 'accept-possible-only-original-loss'} onChange={() => props.onDeclarationChange('accept-possible-only-original-loss')} /> Acepto perder una posible única copia</label>
      <label><input type="checkbox" checked={props.confirmed} onChange={event => props.onConfirmedChange(event.currentTarget.checked)} /> Confirmo retirar esta copia del almacenamiento de Pulso</label>
    </fieldset>}
    <div className="copy-removal-panel__actions">
      {state === 'ready' && <button type="button" className="copy-removal-panel__confirm" disabled={!authorized || !props.canConfirm} onClick={() => { const value = consent(); if (value && props.canConfirm) props.onConfirm(value); }}>Quitar esta copia local</button>}
      {continuing && <button type="button" className="copy-removal-panel__confirm" disabled={!authorized || !props.canContinue} onClick={() => { const value = consent(); if (value && props.canContinue) props.onContinue(value); }}>Confirmar y continuar retirada</button>}
      {props.canInspect && <button type="button" disabled={!props.canUse || props.pending} onClick={() => { if (props.canUse && !props.pending && props.canInspect) props.onInspect(); }}>Revisar estado</button>}
      {(state === 'ready' || state === 'preparing' || state === 'working') && <button type="button" disabled={!(props.canCancel ?? (props.canUse && !props.pending))} onClick={() => { if (props.canCancel ?? (props.canUse && !props.pending)) props.onCancel(); }}>{state === 'working' ? 'Detener después de la fase actual' : 'Conservar copia'}</button>}
      {props.canClose && <button type="button" disabled={!props.canUse || props.pending} onClick={() => { if (props.canUse && !props.pending && props.canClose) props.onClose(); }}>Cerrar revisión</button>}
    </div>
  </section>;
}
