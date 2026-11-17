import {formatStorageMB,formatStorageProgress} from '../library/storage-format';
import type {Ref} from 'react';
export type RescanPanelState='idle'|'verifying'|'parsing'|'saving'|'updated'|'no-change'|'not-applied'|'uncertain';
export type RescanPanelReason='limit'|'no-local-copy'|'missing'|'corrupt'|'not-inspected'|'changed'|'conflict'|'cancelled'|'timeout'|'storage'|'busy';
export interface MetadataRescanPanelProps {
 title:string;
 eligible:boolean;
 disabledReason:'no-local-copy'|'limit'|'blocked'|null;
 state:RescanPanelState;
 progress:{phase:'verify';bytes:number;total:number}|{phase:'parse'|'commit'}|null;
 reason:RescanPanelReason|null;
 canInspect:boolean;
 headingRef?:Ref<HTMLHeadingElement>;
 onStart:()=>void;
 onCancel:()=>void;
 onInspect:()=>void;
 onClose:()=>void;
}
const messages:Record<RescanPanelReason,string>={
 limit:`La revisión admite archivos de hasta ${formatStorageMB(8*1024*1024)}. Este archivo queda sin inspeccionar.`,
 'no-local-copy':'Esta ficha no tiene una copia local. La descarga desde Telegram todavía no está disponible.',
 missing:'Falta el archivo local. Conservamos la ficha y su organización.',
 corrupt:'No se pudo verificar la integridad de la copia. Conserva tus originales.',
 'not-inspected':'No se pudieron inspeccionar las etiquetas de este archivo.',
 changed:'La ficha o su copia cambió durante la revisión. Revisa el estado antes de intentarlo de nuevo.',
 conflict:'Los datos encontrados no concuerdan con los datos conservados. No los sustituimos.',
 cancelled:'Revisión cancelada. Los resultados ya confirmados se conservan.',
 timeout:'La lectura tardó demasiado. Comprueba el resultado antes de repetir si no está confirmado.',
 storage:'No se pudo completar el acceso al almacenamiento local.',
 busy:'Hay otra operación pendiente. Termínala o comprueba su resultado antes de revisar.',
};
export function MetadataRescanPanel(props:MetadataRescanPanelProps){
 const working=props.state==='verifying'||props.state==='parsing'||props.state==='saving';
 const progress=props.progress?.phase==='verify'?props.progress:null;
 return <section aria-label="Revisión de datos del archivo">
  <h2 ref={props.headingRef} tabIndex={-1}>Revisar datos del archivo</h2><p>{props.title}</p>
  <p>Lee únicamente número de pista, disco, artista de álbum y compilación de una copia local verificada de hasta {formatStorageMB(8*1024*1024)}. No envía el audio ni consulta servicios externos. Son datos declarados en el archivo, sin validación de catálogo.</p>
  <p>Conserva los datos conocidos, favoritos, playlists y audio. No cambia título, artista, álbum, portada ni letras.</p>
  {props.disabledReason==='no-local-copy'&&<p>{messages['no-local-copy']}</p>}
  {props.disabledReason==='limit'&&<p>{messages.limit}</p>}
  {props.disabledReason==='blocked'&&<p>La revisión espera a que tengas el control y se resuelvan las operaciones pendientes.</p>}
  <p role="status">{props.state==='verifying'?'Verificando la copia local…':props.state==='parsing'?'Leyendo etiquetas del archivo…':props.state==='saving'?'Confirmando los datos…':props.state==='updated'?'Datos del archivo actualizados.':props.state==='no-change'?'Revisión confirmada; no hay datos nuevos que añadir.':props.state==='uncertain'?'No se pudo confirmar el resultado. Compruébalo antes de repetir; se conservan tus archivos.':props.reason?messages[props.reason]:''}</p>
  {progress&&<label>Verificación: {formatStorageProgress(progress.bytes,progress.total)}<progress max={Math.max(1,progress.total)} value={Math.min(progress.bytes,progress.total)}/></label>}
  <div className="controls">
   <button disabled={!props.eligible||working||props.state==='uncertain'} onClick={props.onStart}>Revisar archivo local</button>
   <button disabled={!working} onClick={props.onCancel}>Cancelar revisión</button>
   {props.state==='uncertain'&&<button disabled={!props.canInspect||working} onClick={props.onInspect}>Comprobar resultado</button>}
   <button disabled={working||props.state==='uncertain'} onClick={props.onClose}>Cerrar revisión</button>
  </div>
 </section>;
}
