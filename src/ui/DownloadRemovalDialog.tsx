import {useRef,useLayoutEffect,useEffect} from 'react';
import type {createDownloadRemovalController} from './download-removal-state';
import {formatStorageMB} from '../library/storage-format';
import './collection-removal.css';
export function DownloadRemovalDialog({controller,onClose}:{controller:ReturnType<typeof createDownloadRemovalController>;onClose:()=>void}){
 const view=controller.getView(),actions=controller.callbacks(view),dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null);
 useLayoutEffect(()=>{const node=dialog.current;if(!view.visible||!node)return;node.showModal();heading.current?.focus();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{node.close();document.body.style.overflow=old;};},[view.visible]);
 useEffect(()=>()=>{void controller.dispose();},[controller]);
 if(!view.visible)return null;
 const close=()=>{if(actions.close())onClose();};
 const cancel=async()=>{await actions.cancel();if(controller.getView().state==='blocked'){if(controller.callbacks(controller.getView()).close())onClose();}};
 return <dialog ref={dialog} className="collection-removal-dialog" aria-labelledby="download-removal-heading" onCancel={e=>{e.preventDefault();if(view.state==='ready'||view.state==='working')void cancel();else close();}}><section className="collection-removal">
 <h2 ref={heading} tabIndex={-1} id="download-removal-heading">Quitar descargas</h2><p>{view.title}</p>
 {view.state==='ready'&&<><dl className="collection-removal__summary"><div><dt>Archivos seleccionados</dt><dd>{view.copies}</dd></div><div><dt>Audio seleccionado</dt><dd>{formatStorageMB(view.bytes)}</dd></div></dl><p>Tu biblioteca, playlists y favoritos se conservan. Estas canciones dejarán de estar disponibles sin conexión en todas las listas que las compartan. Los archivos en uso se conservan.</p><label className="collection-removal__consent"><input type="checkbox" checked={view.accepted} onChange={e=>actions.accepted(e.target.checked)}/><span>Confirmo quitar estas descargas. Algunas podrían ser mi única copia.</span></label></>}
 {view.state==='working'&&<p role="status">Retirando descargas… {view.processed} de {view.copies}</p>}
 {view.result&&<div className="collection-removal__result"><p>{view.result.removed} {view.result.removed===1?'descarga retirada':'descargas retiradas'} · {formatStorageMB(view.result.freedBytes)} liberados</p><p>{view.result.skipped+view.result.remaining} conservadas o sin retirar. Tu biblioteca y tus playlists se mantienen.</p></div>}
 {view.message&&<p role="status">{view.message}</p>}
 <div className="collection-removal__actions">{view.state==='ready'?<><button disabled={!view.accepted} onClick={()=>void actions.confirm()}>Quitar {view.copies} {view.copies===1?'descarga':'descargas'}</button><button onClick={()=>void cancel()}>Cancelar</button></>:view.state==='working'?<button onClick={()=>void cancel()}>Detener retirada</button>:<button onClick={close}>Cerrar</button>}</div>
 </section></dialog>;
}
