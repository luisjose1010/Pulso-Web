import {formatStorageMB} from '../library/storage-format';
import { useId, useLayoutEffect, useRef } from 'react'
import type React from 'react'

export interface CollectionRemovalPanelProps {
  state: 'preparing' | 'ready' | 'working' | 'done' | 'uncertain' | 'blocked'
  title: string
  kind: 'playlist' | 'album' | 'cache'
  summary: { tracks: number; eligibleCopies: number; estimatedBytes: number; retainedShared: number } | null
  accepted: boolean
  onAccepted: (value: boolean) => void
  onConfirm: () => void
  onCancel: () => void
  onClose: () => void
  current: () => boolean
  result: { metadata: 'committed' | 'not-committed' | 'unknown'; cleanup: 'complete' | 'stopped' | 'not-started'; removed: number; skipped: number; freedBytes: number | null } | null
  message: string | null
  canConfirm: boolean
  canCancel: boolean
  canClose: boolean
  headingRef?: React.Ref<HTMLHeadingElement>
}



export function CollectionRemovalPanel(props: CollectionRemovalPanelProps) {
  const headingId = useId()
  const committedProps = useRef<CollectionRemovalPanelProps | null>(null)
  useLayoutEffect(() => {
    committedProps.current = props
    return () => { if (committedProps.current === props) committedProps.current = null }
  }, [props])

  const guard = (action: () => void) => {
    try {
      if (committedProps.current === props && props.current()) action()
    } catch {
      // A stale or invalid owner cannot authorize an action.
    }
  }
  const { state, summary, result } = props
  const cache = props.kind === 'cache'
  const label = props.kind === 'playlist' ? 'playlist' : 'álbum'
  const actionLabel = cache ? 'Limpiar caché de escucha' : `Eliminar ${label}`

  return (
    <section className="collection-removal" aria-labelledby={headingId}>
      <h2 id={headingId} ref={props.headingRef} tabIndex={-1}>{cache ? 'Limpiar caché de escucha' : `Eliminar ${label}: ${props.title}`}</h2>
      {cache && <p>Se retiran las copias de canciones escuchadas sin guardar. Biblioteca, favoritos, playlists y archivos en uso se conservan. Para volver a escucharlas puede ser necesaria otra descarga.</p>}
      {state === 'preparing' && <p role="status">{cache ? 'Revisando la caché de escucha…' : 'Preparando la revisión de la colección…'}</p>}
      {summary && <dl className="collection-removal__summary">
        <div><dt>{cache ? 'Canciones en caché' : 'Canciones de la colección'}</dt><dd>{summary.tracks}</dd></div>
        <div><dt>Copias elegibles</dt><dd>{summary.eligibleCopies}</dd></div>
        <div><dt>Audio estimado</dt><dd>{formatStorageMB(summary.estimatedBytes)}</dd></div>
        <div><dt>Copias compartidas protegidas</dt><dd>{summary.retainedShared}</dd></div>
      </dl>}
      {state === 'ready' && <label className="collection-removal__consent">
        <input type="checkbox" checked={props.accepted} onChange={(event) => guard(() => props.onAccepted(event.target.checked))} />
        <span>{cache ? 'Eliminar las copias de escucha que no estén guardadas en Biblioteca, favoritos o playlists. Se conservan los archivos en uso.' : 'Entiendo que se eliminará esta colección y las copias que no use otra biblioteca, playlist o favorito. Algunas pueden ser las únicas copias guardadas.'}</span>
      </label>}
      {state === 'ready' && cache && summary?.eligibleCopies === 0 && <p>No hay copias de caché que se puedan retirar en este momento.</p>}
      {state === 'working' && <p role="status">{cache ? 'Limpieza en curso… Puedes solicitar la cancelación.' : 'Eliminación en curso… Puedes solicitar la cancelación.'}</p>}
      {state === 'blocked' && <p role="status">{cache ? 'La caché cambió o no se pudo comprobar. Vuelve a revisarla.' : 'La colección cambió. Vuelve a revisarla antes de intentar eliminarla.'}</p>}
      {state === 'uncertain' && <p role="status">{cache ? 'No se pudo confirmar la limpieza. Revisa cualquier retirada pendiente antes de volver a intentarlo.' : 'No se pudo confirmar el resultado. Revisa la colección antes de volver a intentarlo.'}</p>}
      {result && <div className="collection-removal__result">
        {cache ? <p>{result.metadata === 'committed' ? 'La biblioteca y tus playlists se conservan.' : result.metadata === 'not-committed' ? 'No se inició la limpieza de caché.' : 'No se pudo confirmar la limpieza de caché.'}</p> : result.metadata === 'committed' ? <p>La colección se eliminó.</p> : result.metadata === 'not-committed' ? <p>No se eliminó la colección.</p> : <p>No se pudo confirmar si se eliminó la colección.</p>}
        {result.freedBytes === null ? <p>No se puede confirmar el número total de copias retiradas.</p> : <p>Copias retiradas: {result.removed}. Copias conservadas o no retiradas: {result.skipped}.</p>}
        {result.freedBytes !== null && result.skipped > 0 && <p>Las copias compartidas se conservan para sus otros usos.</p>}
        {result.freedBytes !== null && <p>Audio retirado: {formatStorageMB(result.freedBytes)}</p>}
        {result.cleanup === 'stopped' && <p>La retirada de copias se detuvo.</p>}
        {result.cleanup === 'not-started' && <p>La retirada de copias no comenzó.</p>}
      </div>}
      {props.message && <p role="status">{props.message}</p>}
      <div className="collection-removal__actions">
        {(state === 'preparing' || state === 'ready') && <button type="button" disabled={state !== 'ready' || !props.accepted || !props.canConfirm || (cache && summary?.eligibleCopies === 0)} onClick={() => guard(props.onConfirm)}>{actionLabel}</button>}
        {(state === 'preparing' || state === 'ready' || state === 'working') && <button type="button" disabled={!props.canCancel} onClick={() => guard(props.onCancel)}>{state === 'working' ? 'Cancelar eliminación' : 'Cancelar'}</button>}
        {(state === 'done' || state === 'uncertain' || state === 'blocked') && <button type="button" disabled={!props.canClose} onClick={() => guard(props.onClose)}>Cerrar</button>}
      </div>
    </section>
  )
}
