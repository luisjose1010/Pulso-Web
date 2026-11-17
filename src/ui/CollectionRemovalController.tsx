import React from 'react';
import './collection-removal.css';
import {CollectionRemovalPanel} from './CollectionRemovalPanel';
import type {createCollectionRemovalController} from './collection-removal-state';

export function CollectionRemovalController({controller,headingRef,onVisible,onClose}:{controller:ReturnType<typeof createCollectionRemovalController>;headingRef:React.Ref<HTMLHeadingElement>;onVisible:()=>void;onClose:()=>void}){
 const view=controller.getView(),callbacks=controller.callbacks(view);
 const dialog=React.useRef<HTMLDialogElement>(null);
 React.useLayoutEffect(()=>{
  const node=dialog.current;if(!view.visible||!node)return;
  if(!node.open)node.showModal();
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';
  return()=>{if(node.open)node.close();document.body.style.overflow=previous;};
 },[view.visible]);
 React.useLayoutEffect(()=>{if(view.visible)onVisible();},[view.visible,onVisible]);
 React.useEffect(()=>()=>{void controller.dispose();},[controller]);
 if(!view.visible)return null;
 return <dialog ref={dialog} className="collection-removal-dialog" aria-label={view.kind==='cache'?'Limpiar caché de escucha':`Eliminar ${view.kind==='playlist'?'playlist':'álbum'}`} onCancel={event=>{event.preventDefault();if(view.state==='preparing'||view.state==='ready'||view.state==='working')void callbacks.cancel();else if(callbacks.close())onClose();}}><CollectionRemovalPanel state={view.state} title={view.title} kind={view.kind} summary={view.summary&&{tracks:view.summary.tracks,eligibleCopies:view.summary.copiesEligible,estimatedBytes:view.summary.estimatedBytes,retainedShared:view.summary.retainedShared}} accepted={view.accepted} onAccepted={callbacks.accepted} onConfirm={()=>{void callbacks.confirm();}} onCancel={()=>{void callbacks.cancel();}} onClose={()=>{if(callbacks.close())onClose();}} current={callbacks.current} result={view.result} message={view.message} canConfirm={view.state==='ready'} canCancel={view.state==='preparing'||view.state==='ready'||view.state==='working'} canClose={view.state==='done'||view.state==='blocked'||view.state==='uncertain'} headingRef={headingRef}/></dialog>;
}
