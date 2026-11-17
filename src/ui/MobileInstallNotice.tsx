import {useEffect,useReducer,useRef,useState} from 'react';
import {createAppInstall,type InstallState} from '../pwa/install-prompt';
import {downloadNotifications} from '../pwa/download-notifications';
import './mobile-install-notice.css';
const choiceKey='pulso:notifications:onboarding:v1';
function answered(){try{return localStorage.getItem(choiceKey)==='answered';}catch{return false;}}
/** Installation guidance is for phones. Permission is requested only by a tap. */
export function MobileInstallNotice(){
 const [phone,setPhone]=useState(false),[ios,setIos]=useState(false),[install,setInstall]=useState<InstallState>('manual');
 const [done,setDone]=useState(answered),[pending,setPending]=useState(false),[,refresh]=useReducer(n=>n+1,0);
 const action=useRef<ReturnType<typeof createAppInstall>|null>(null),dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLButtonElement>(null),restore=useRef<(()=>void)|null>(null);
 useEffect(()=>{
  const ua=navigator.userAgent,isPhone=/iPhone|iPod|Android.*Mobile/i.test(ua);setPhone(isPhone);setIos(/iPhone|iPod/i.test(ua));
  if(!isPhone)return;
  const controller=createAppInstall(window,setInstall);action.current=controller;
  const stop=downloadNotifications.subscribe(refresh);const focus=()=>{setDone(answered());refresh();};window.addEventListener('focus',focus);
  return()=>{controller.dispose();action.current=null;stop();window.removeEventListener('focus',focus);restore.current?.();};
 },[]);
 function close(){dialog.current?.close();restore.current?.();restore.current=null;opener.current?.focus({preventScroll:true});}
 useEffect(()=>{if(install==='installed'&&dialog.current?.open)close();},[install]);
 function finish(){try{localStorage.setItem(choiceKey,'answered');}catch{/* Dismiss for this opening if storage is unavailable. */}setDone(true);}
 function show(){const node=dialog.current;if(!node||node.open)return;const previous=document.body.style.overflow;restore.current=()=>{document.body.style.overflow=previous;};node.showModal();document.body.style.overflow='hidden';}
 const notification=downloadNotifications.state();
 if(!phone)return null;
 return <>
  {install!=='installed'&&<aside className="mobile-install-banner" aria-label="Instalar Pulso"><button ref={opener} type="button" onClick={show} aria-haspopup="dialog"><span className="mobile-install-banner__icon" aria-hidden="true">↓</span><span><strong>Instala Pulso</strong><small>Añádela a tu pantalla de inicio</small></span><span aria-hidden="true">›</span></button></aside>}
  <dialog ref={dialog} className="mobile-install-sheet" aria-labelledby="mobile-install-title" onCancel={e=>{e.preventDefault();close();}} onClose={()=>{restore.current?.();restore.current=null;}}>
   <header><h2 id="mobile-install-title">Pulso en tu teléfono</h2><button type="button" onClick={close} aria-label="Cerrar instrucciones">×</button></header>
   <p>Abre tu música directamente desde la pantalla de inicio.</p>
   {ios?<ol><li>Abre Pulso en <strong>Safari</strong>.</li><li>Toca <strong>Compartir</strong> y después <strong>Añadir a pantalla de inicio</strong>.</li><li>Confirma con <strong>Añadir</strong> y abre el nuevo icono de Pulso.</li></ol>:<ol><li>Abre Pulso en <strong>Chrome</strong>.</li><li>Abre el menú <strong>⋮</strong> y elige <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>.</li><li>Confirma y abre Pulso desde su icono.</li></ol>}
   {install==='ready'&&<button className="mobile-install-primary" type="button" onClick={()=>action.current?.prompt()}>Instalar ahora</button>}
   {['prompting','requested','dismissed','failed'].includes(install)&&<p role="status">{install==='prompting'?'Completa el aviso del navegador.':install==='requested'?'Instalación solicitada. Espera la confirmación del navegador.':install==='dismissed'?'Puedes volver a intentarlo desde el menú del navegador.':'No se pudo abrir el aviso. Sigue los pasos del menú del navegador.'}</p>}
   {ios&&<p className="mobile-install-note">Usa después el icono de Pulso: Safari y la app instalada pueden guardar las descargas por separado.</p>}
  </dialog>
  {install==='installed'&&!done&&!notification.enabled&&notification.support==='ready'&&notification.permission!=='denied'&&<aside className="mobile-notification-invite" aria-label="Activar avisos de descargas">
   <div role="status"><strong>¿Te avisamos cuando termine una descarga?</strong><p>Activa las notificaciones de Pulso. Los títulos pueden aparecer en la pantalla bloqueada.</p></div>
   {notification.error&&<p role="status">{notification.error}</p>}
   <div className="mobile-notification-invite__actions"><button type="button" disabled={pending} className="mobile-install-primary" onClick={()=>{setPending(true);void downloadNotifications.enable().then(enabled=>{if(enabled)finish();}).finally(()=>setPending(false));}}>{pending?'Activando…':'Activar notificaciones'}</button><button type="button" disabled={pending} onClick={finish}>Ahora no</button></div>
  </aside>}
 </>;
}
