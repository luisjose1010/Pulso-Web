import {useEffect,useLayoutEffect,useId,useRef,useState,type ReactNode} from 'react';
import './track-actions-menu.css';

interface TrackActionsMenuProps {
 title:string;
 artist:string;
 artwork?:ReactNode;
 children:ReactNode;
 active:boolean;
}

/** Transfer panels must return to the visible row control, not a hidden menu action. */
export function trackActionOpener(button:HTMLButtonElement):HTMLButtonElement {
 return button.closest('li')?.querySelector<HTMLButtonElement>('.track-actions-trigger')??button;
}

/** Presentation only. Actions and their admission checks remain with the caller. */
export function TrackActionsMenu({title,artist,artwork,children,active}:TrackActionsMenuProps){
 const id=useId(),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const releaseScroll=useRef<(()=>void)|null>(null);
 const [open,setOpen]=useState(false),[subpage,setSubpage]=useState(false);
 function back(restore=false){const summary=dialog.current?.querySelector<HTMLElement>('details[open]>summary');dialog.current?.querySelectorAll('details[open]').forEach(node=>node.removeAttribute('open'));setSubpage(false);if(restore)requestAnimationFrame(()=>summary?.focus());}
 function unlock(){releaseScroll.current?.();releaseScroll.current=null;}
 function close(){
  const node=dialog.current;
  if(node?.open)node.close();
  unlock();setOpen(false);back();
  if(trigger.current?.isConnected)trigger.current.focus({preventScroll:true});
 }
 function show(){
  const node=dialog.current;
  if(!active||!node||node.open)return;
  node.showModal();
  const previous=document.body.style.overflow;
  document.body.style.overflow='hidden';
  releaseScroll.current=()=>{document.body.style.overflow=previous;};
  setOpen(true);
 }
 // Reordering a row can detach its dialog from the browser's top layer while
 // leaving `open` set. Restore modality before paint, so the player cannot cover it.
 useLayoutEffect(()=>{
  const node=dialog.current;
  if(!open||!active||!node?.open||node.matches(':modal'))return;
  const focused=document.activeElement instanceof HTMLElement&&node.contains(document.activeElement)?document.activeElement:null;
  node.close();node.showModal();
  if(focused?.isConnected&&focused.getClientRects().length)focused.focus({preventScroll:true});
 });
 useEffect(()=>{if(!active&&dialog.current?.open)close();},[active]);
 useEffect(()=>{
  const node=dialog.current,opener=trigger.current;
  return()=>{
   const wasOpen=!!node?.open;
   if(wasOpen)node?.close();
   releaseScroll.current?.();releaseScroll.current=null;
   if(wasOpen)requestAnimationFrame(()=>{
    // Removing a playlist row also removes its opener. Do not steal focus from
    // a replacement panel or from navigation that already placed it elsewhere.
    if(document.querySelector('dialog[open],[aria-modal="true"]'))return;
    const focused=document.activeElement;
    if(focused&&focused!==document.body&&focused.isConnected&&!node?.contains(focused))return;
    if(opener?.isConnected){opener.focus({preventScroll:true});return;}
    const next=[...document.querySelectorAll<HTMLButtonElement>('.track-actions-trigger')].find(button=>button.getClientRects().length&&!button.closest('[hidden]'));
    if(next){next.focus({preventScroll:true});return;}
    const heading=document.querySelector<HTMLElement>('.library-detail:not([hidden]) .collection-header h3');
    if(heading){const previous=heading.getAttribute('tabindex');heading.tabIndex=-1;heading.focus({preventScroll:true});if(previous===null)heading.removeAttribute('tabindex');else heading.setAttribute('tabindex',previous);}
   });
  };
 },[]);
 return <>
  <button ref={trigger} type="button" className="track-actions-trigger" aria-label={`Opciones de ${title}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={show}>
   <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
  </button>
  <dialog ref={dialog} id={id} className="track-actions-menu" aria-labelledby={`${id}-title`} onKeyDown={event=>{
   if(event.key!=='Tab')return;
   const node=event.currentTarget;
   const closed=[...node.querySelectorAll('details:not([open])')];
   const controls=[...node.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],summary,[tabindex]')].filter(element=>element.tabIndex>=0&&!element.matches(':disabled')&&element.getClientRects().length>0&&closed.every(details=>!details.contains(element)||details.querySelector(':scope>summary')===element));
   const first=controls[0],last=controls.at(-1);
   if(event.shiftKey&&(document.activeElement===first||!node.contains(document.activeElement))){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&(document.activeElement===last||!node.contains(document.activeElement))){event.preventDefault();first?.focus();}
  }} onCancel={event=>{event.preventDefault();close();}} onClose={()=>{if(!dialog.current?.open){unlock();setOpen(false);}}} onClick={event=>{
   if(event.target!==event.currentTarget)return;
   const rect=event.currentTarget.getBoundingClientRect();
   if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();
  }}>
   <div className="track-actions-menu__handle" aria-hidden="true"/>
   <header className="track-actions-menu__header">
    {artwork&&<div className="track-actions-menu__art">{artwork}</div>}
    <div className="track-actions-menu__copy"><h2 id={`${id}-title`}>{title}</h2><p>{artist}</p></div>
    <button type="button" className="track-actions-menu__close" aria-label="Cerrar opciones de canción" onClick={close} autoFocus><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
   </header>
   {subpage&&<button className="track-actions-menu__back" type="button" onClick={()=>back(true)}>← Todas las opciones</button>}
   <div className="track-actions-menu__content" data-subpage={subpage||undefined} onClickCapture={event=>{
    const target=event.target;
    if(!(target instanceof Element)||target.closest(':disabled,[aria-disabled="true"]'))return;
    const summary=target.closest('summary');
    if(summary){event.preventDefault();const details=summary.parentElement as HTMLDetailsElement;const next=!details.open;back();details.open=next;setSubpage(next);return;}
    if(target.closest('[data-menu-dismiss="true"]'))close();
   }}>{children}</div>
  </dialog>
 </>;
}
