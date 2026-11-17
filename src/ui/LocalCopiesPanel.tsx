import {formatStorageMB} from '../library/storage-format';
import './local-copies.css';

export interface LocalCopyRowView {
  id: string;
  label: string;
  backend: 'idb' | 'opfs' | 'unknown';
  declaredBytes: number | null;
  observedBytes: number | null;
  availabilityText: string;
  integrityText: string;
  protectedReason: string;
  tracks: number | null;
  favorites: number | null;
  playlists: number | null;
  playlistEntries: number | null;
  queueOccurrences: number | null;
  canVerify: boolean;
  canExport: boolean;
}

export interface LocalCopiesPanelProps {
  rows: readonly LocalCopyRowView[];
  inventoryState: 'idle' | 'loading' | 'ready' | 'error';
  partial: boolean;
  referencesComplete: boolean;
  totalObservedBytes: number | null;
  totalLogicalBytes: number | null;
  storageUsage: number | null;
  quota: number | null;
  storageState: string;
  identity: 'unknown';
  hasNextPage: boolean;
  canPreviousPage: boolean;
  pending: boolean;
  canUse: boolean;
  status: string;
  persistenceState: 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported' | 'unknown';
  exportView: null | {url: string; filename: string; bytes: number};
  exportProgress: null | {read: number; total: number};
  exportPreparing: boolean;
  onRefresh: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onVerify: (rowId: string) => void;
  onPrepareExport: (rowId: string) => void;
  onCancel: () => void;
  onReleaseExport: () => void;
  onRequestPersistence: () => void;
  /** Revalidate the document capability in the real download click stack. */
  onDownloadPrepared: () => boolean;
}

const persistenceLabels: Record<LocalCopiesPanelProps['persistenceState'], string> = {
  idle: 'Sin solicitar', requesting: 'Solicitando', granted: 'Concedida', denied: 'Denegada',
  unsupported: 'No disponible', unknown: 'Desconocida',
};

function bytes(value: number | null): string {
  return formatStorageMB(value);
}

function count(value: number | null): string {
  return value === null ? 'desconocido' : new Intl.NumberFormat('es').format(value);
}

export function LocalCopiesPanel(props: LocalCopiesPanelProps) {
  const disabled = !props.canUse || props.pending;
  return <section className="local-copies" aria-labelledby="local-copies-heading">
    <h2 id="local-copies-heading">Copias locales</h2>
    <p>Las copias conservadas están protegidas. Verifica cada copia de forma individual cuando lo necesites.</p>
    <p>Los conteos reflejan la consulta del inventario; los cambios posteriores requieren actualizarlo.</p>
    <p>Identidad del almacenamiento: {props.identity === 'unknown' ? 'desconocida' : props.identity}.</p>
    <p>{props.partial ? 'Inventario parcial: pueden faltar copias en esta consulta.' : 'Inventario consultado.'} {props.referencesComplete ? 'Referencias consultadas.' : 'Referencias incompletas: los conteos pueden no incluir todas las relaciones.'}</p>
    <dl className="local-copies__summary">
      <div><dt>Tamaño observado</dt><dd>{bytes(props.totalObservedBytes)}</dd></div>
      <div><dt>Tamaño declarado</dt><dd>{bytes(props.totalLogicalBytes)}</dd></div>
      <div><dt>Uso del origen</dt><dd>{bytes(props.storageUsage)}</dd></div>
      <div><dt>Cuota del origen</dt><dd>{bytes(props.quota)}</dd></div>
    </dl>
    <p>Uso y cuota corresponden a todo el origen, no solo a la música. {props.storageState}</p>
    <p>Persistencia: {persistenceLabels[props.persistenceState]}. Incluso concedida, no garantiza protección contra la purga del navegador.</p>
    <div className="local-copies__actions">
      <button type="button" disabled={disabled || props.persistenceState === 'requesting'} onClick={props.onRequestPersistence}>Solicitar persistencia</button>
      <button type="button" disabled={disabled || props.inventoryState === 'loading'} onClick={props.onRefresh}>Actualizar inventario</button>
      {(props.pending || props.exportPreparing) && <button type="button" onClick={props.onCancel}>Cancelar operación</button>}
    </div>
    <p className="local-copies__status" role="status" aria-live="polite">{props.status}</p>
    {props.inventoryState === 'idle' && <p>Actualiza para consultar las copias.</p>}
    {props.inventoryState === 'loading' && <p>Cargando inventario…</p>}
    {props.inventoryState === 'error' && <p>No se pudo consultar el inventario. Puedes volver a intentarlo.</p>}
    {props.inventoryState === 'ready' && props.rows.length === 0 && <p>No hay copias en esta página.</p>}
    {props.rows.length > 0 && <ul className="local-copies__list">{props.rows.map(row => <li key={row.id}>
      <h3>{row.label}</h3>
      <p>Almacenamiento: {row.backend === 'unknown' ? 'desconocido' : row.backend.toUpperCase()}. Disponibilidad: {row.availabilityText}. Integridad: {row.integrityText}.</p>
      <p>Declarados: {bytes(row.declaredBytes)}. Observados: {bytes(row.observedBytes)}.</p>
      <p>Protección: {row.protectedReason}</p>
      <p>Canciones: {count(row.tracks)}; favoritos: {count(row.favorites)}; playlists: {count(row.playlists)}; entradas de playlist: {count(row.playlistEntries)}; apariciones en la cola guardada: {count(row.queueOccurrences)}.</p>
      <div className="local-copies__actions">
        <button type="button" disabled={disabled || !row.canVerify} onClick={() => props.onVerify(row.id)} aria-label={`Verificar copia de ${row.label}`}>Verificar copia</button>
        <button type="button" disabled={disabled || !row.canExport} onClick={() => props.onPrepareExport(row.id)} aria-label={`Preparar exportación de ${row.label}`}>Preparar exportación</button>
      </div>
    </li>)}</ul>}
    <div className="local-copies__actions" aria-label="Páginas del inventario">
      <button type="button" disabled={disabled || !props.canPreviousPage} onClick={props.onPrevious}>Página anterior</button>
      <button type="button" disabled={disabled || !props.hasNextPage} onClick={props.onNext}>Página siguiente</button>
    </div>
    <p>La exportación individual admite hasta {formatStorageMB(8*1024*1024)}. Preparar o pulsar el enlace no confirma que el archivo se haya guardado fuera del navegador.</p>
    {props.exportPreparing && <p>Preparando exportación…</p>}
    {props.exportProgress && <div>
      <label htmlFor="local-copies-export-progress">Leído: {bytes(props.exportProgress.read)} de {bytes(props.exportProgress.total)}</label>
      <progress id="local-copies-export-progress" value={props.exportProgress.read} max={Math.max(1, props.exportProgress.total)} />
    </div>}
    {props.exportView && <div className="local-copies__actions">
      <a href={props.exportView.url} download={props.exportView.filename} onClick={event=>{if(!props.onDownloadPrepared())event.preventDefault();}}>Descargar archivo preparado ({bytes(props.exportView.bytes)})</a>
      <button type="button" onClick={props.onReleaseExport}>Cerrar enlace</button>
    </div>}
  </section>;
}
