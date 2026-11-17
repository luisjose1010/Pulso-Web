import {formatStorageMB} from '../library/storage-format';
import React from 'react';
import {fieldSets,projectReview,serializeReviewed,type Capabilities,type Dataset,type Review,type Selection} from '../diagnostics/export';
import type {DiagnosticSession} from '../diagnostics/session';
import './diagnostics.css';
const empty=():Selection=>({errors:[],capabilities:[],limits:[]});
const labels:Record<string,string>={errors:'Errores de esta sesión',capabilities:'Capacidades observadas',limits:'Límites de esta fase',sequence:'Orden',correlationId:'Correlación',operation:'Operación',phase:'Fase',outcome:'Resultado',family:'Familia',code:'Código',backend:'Backend',transport:'Transporte',count:'Cantidad'};
export function DiagnosticsPanel({session,capabilities}:{session:DiagnosticSession;capabilities:Capabilities}) {
 const snapshot=React.useSyncExternalStore(session.subscribe,session.getSnapshot);
 const [selection,setSelection]=React.useState<Selection>(empty),[review,setReview]=React.useState<Review|null>(null),[feedback,setFeedback]=React.useState('');
 const reviewScope=React.useRef<(()=>boolean)|null>(null),scope=React.useRef(session.scope());
 const url=React.useRef<string|null>(null),timer=React.useRef<ReturnType<typeof setTimeout>|null>(null);
 const opener=React.useRef<HTMLButtonElement>(null),heading=React.useRef<HTMLHeadingElement>(null),reviewBox=React.useRef<HTMLDivElement>(null);
 const focusReview=React.useRef(false);
 const revoke=React.useCallback(()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}if(url.current!==null){try{URL.revokeObjectURL(url.current);}catch{/* no network fallback */}url.current=null;}},[]);
 function invalidate(){revoke();reviewScope.current=null;focusReview.current=false;setReview(null);}
 React.useLayoutEffect(()=>{
  if(!scope.current()){scope.current=session.scope();invalidate();setSelection(empty());setFeedback('');}
  if(review&&focusReview.current){focusReview.current=false;if(reviewScope.current?.()&&document.activeElement===opener.current)heading.current?.focus({preventScroll:true});}
 });
 React.useEffect(()=>{const hide=()=>{revoke();reviewScope.current=null;setReview(null);};window.addEventListener('pagehide',hide);return()=>{window.removeEventListener('pagehide',hide);revoke();};},[revoke]);
 function toggle(dataset:Dataset,field:string){invalidate();setFeedback('');setSelection(old=>({...old,[dataset]:old[dataset].includes(field)?old[dataset].filter(k=>k!==field):[...old[dataset],field]}));}
 function prepare(){
  invalidate();try{const current=session.scope();const next=projectReview(session.getSnapshot(),selection,capabilities);if(!current())return;reviewScope.current=current;focusReview.current=document.activeElement===opener.current;setReview(next);setFeedback('');}catch{setFeedback('No se pudo preparar la revisión. Revisa la selección y vuelve a intentarlo.');}
 }
 function cancel(){const restore=!!reviewBox.current?.contains(document.activeElement);invalidate();setFeedback('Revisión cancelada.');if(restore)opener.current?.focus({preventScroll:true});}
 function download(){
  if(!review||!reviewScope.current?.()){invalidate();return;}
  revoke();let anchor:HTMLAnchorElement|null=null;
  try{
   const json=serializeReviewed(review);const blob=new Blob([json],{type:'application/json;charset=utf-8'});
   url.current=URL.createObjectURL(blob);
   if(!reviewScope.current?.()){revoke();return;}
   anchor=document.createElement('a');anchor.href=url.current;anchor.download='pulso-diagnostico.json';document.body.append(anchor);anchor.click();
   setFeedback('Descarga solicitada. Tú decides dónde guardar o compartir el archivo.');
   timer.current=setTimeout(()=>{timer.current=null;revoke();},0);
  }catch{revoke();setFeedback('No se pudo solicitar la descarga (download-unavailable). Puedes reintentar.');}
  finally{anchor?.remove();}
 }
 return <section className="diagnostics" aria-label="Privacidad y diagnóstico local"><h2>Privacidad y diagnóstico local</h2>
 <p>El diagnóstico es opcional, solo en memoria de esta pestaña. Al recargar o cambiar el control se borra y se desactiva. No es un historial de escucha.</p>
 <p>No envía datos. El archivo local solo se prepara tras elegir los campos, revisarlos y pulsar Descargar. No incluye audios, títulos, consultas, nombres de archivo, sesiones ni URLs.</p>
 <p>Este origen y la memoria no tienen cifrado propio de Pulso. Conserva tus originales y una copia externa de tu organización: la limpieza del navegador puede eliminar la biblioteca. La exportación de organización es una acción distinta.</p>
 <label><input type="checkbox" checked={snapshot.enabled} onChange={e=>session.setEnabled(e.target.checked)}/>Activar diagnóstico de esta sesión</label>
 <button onClick={()=>session.setEnabled(false)} disabled={!snapshot.enabled}>Desactivar y borrar diagnóstico</button>
 <button onClick={()=>session.clear()}>Borrar registros (mantiene activación)</button>
 <p>{snapshot.events.length} registros de hasta 100 / {formatStorageMB(64*1024)}. Descartados: {snapshot.droppedRecords}. Rechazados: {snapshot.rejectedRecords}.</p>
 <p>Modo local; SDK Telegram no integrado. Evidencia web parcial; iPhone físico pendiente. La presencia de una API no confirma permisos, persistencia ni funcionamiento offline.</p>
 <dl>{Object.entries(capabilities).map(([key,value])=><React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl>
 <p>Selecciona los campos que deseas revisar. Todos comienzan desmarcados.</p>
 {(Object.keys(fieldSets) as Dataset[]).map(dataset=><fieldset key={dataset}><legend>{labels[dataset]}</legend>{fieldSets[dataset].map(field=><label key={field}><input type="checkbox" checked={selection[dataset].includes(field)} onChange={()=>toggle(dataset,field)}/>{labels[field]??field}</label>)}</fieldset>)}
 <button ref={opener} disabled={!Object.values(selection).some(a=>a.length)} onClick={prepare}>Revisar selección</button>
 {review&&<div ref={reviewBox} className="diagnostics-review" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}}}>
 <h3 ref={heading} tabIndex={-1}>Revisión exacta del diagnóstico</h3><p>{formatStorageMB(review.bytes)} de texto UTF-8. Los registros posteriores no cambian este archivo. Guardarlo o compartirlo es voluntario.</p>
 <pre aria-label="JSON revisado">{review.json}</pre><button onClick={download}>Descargar diagnóstico revisado</button><button onClick={cancel}>Cancelar revisión</button></div>}
 <p role="status">{feedback}</p></section>;
}
