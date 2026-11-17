import {lazy,Suspense,useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {accountController,getAccountAuthClient} from '../accounts/neon-provider';
import {registerUpdateBlocker} from '../service-worker/update-blockers';
import type {AccountView} from './AccountKit';
import './account-access.css';
const AccountKit=lazy(()=>import('./AccountKit'));

/** Pulso account access. Closing the session fences music operations without
 * moving, relabelling or deleting local files or Telegram credentials. */
export function AccountAccess({required=false}:{required?:boolean}={}){
 const state=useSyncExternalStore(accountController.subscribe,accountController.getSnapshot);
 const dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),opener=useRef<HTMLElement|null>(null);
 const busyRef=useRef(false);
 const [open,setOpen]=useState(false),[view,setView]=useState<AccountView>('sign-in'),[message,setMessage]=useState(''),[resetToken,setResetToken]=useState(''),[busy,setBusy]=useState(false);
 const [client,setClient]=useState<Awaited<ReturnType<typeof getAccountAuthClient>>|null>(null);
 const locked=state.pending||state.status==='checking'||busy;
 const onBusy=useCallback((next:boolean)=>{busyRef.current=next;setBusy(next);},[]);
 const onSession=useCallback(()=>{setResetToken('');void accountController.load().finally(()=>{busyRef.current=false;setBusy(false);});},[]);
 function close(){if(state.pending||busyRef.current||required&&!state.user)return;dialog.current?.close();setOpen(false);setMessage('');setResetToken('');setClient(null);const target=opener.current;opener.current=null;requestAnimationFrame(()=>{if(target?.isConnected)target.focus();});}
 function show(target:HTMLElement|null,selected:AccountView='sign-in'){
  opener.current=target;setView(selected);setMessage('');setOpen(true);dialog.current?.showModal();requestAnimationFrame(()=>heading.current?.focus());void accountController.load();
 }
 useEffect(()=>registerUpdateBlocker(()=>dialog.current?.open===true||busyRef.current||accountController.getSnapshot().pending),[]);
 useEffect(()=>{
  const url=new URL(window.location.href),entry=url.searchParams.get('pulso-account');
  if(!['callback','reset'].includes(entry??''))return;
  const token=url.searchParams.get('token');
  if(entry==='reset'){
   if(token&&token.length<=512){setResetToken(token);show(null,'reset-password');}else{show(null,'forgot-password');setMessage('El enlace ya no es válido. Solicita uno nuevo.');}
   url.searchParams.delete('token');
  }else{
   show(null);if(url.searchParams.has('error'))setMessage('No se completó el acceso con Google. Puedes intentarlo de nuevo.');
  }
  // Reset credentials remain only in this component. The official Neon SDK
  // consumes its one-use OAuth verifier; keep that parameter for the SDK.
  url.searchParams.delete('pulso-account');url.searchParams.delete('error');history.replaceState(history.state,'',url.pathname+url.search+url.hash);
 },[]);
 useEffect(()=>{void accountController.load();},[]);
 useEffect(()=>{if(required&&!state.user&&!dialog.current?.open)show(null);},[required,state.user]);
 useEffect(()=>{
  if(!open||!['signed-in','signed-out'].includes(state.status))return;
  let current=true;void getAccountAuthClient().then(value=>{if(current)setClient(()=>value);});
  return()=>{current=false;};
 },[open,state.status]);
 return <>
  <button type="button" className="account-access-button" onClick={event=>show(event.currentTarget)} aria-haspopup="dialog">{state.user?'Mi cuenta':'Iniciar sesión'}</button>
  <dialog ref={dialog} className="account-dialog" aria-labelledby="account-access-heading" onCancel={event=>{event.preventDefault();close();}}>
   <div className="account-dialog__toolbar"><span className="account-dialog__brand">pulso<span aria-hidden="true">●</span></span>{(!required||state.user)&&<button type="button" aria-label="Cerrar cuenta de Pulso" disabled={locked} onClick={close}>Cerrar</button>}</div>
   <h2 id="account-access-heading" className={state.user?'':'account-dialog__sr-heading'} ref={heading} tabIndex={-1}>{state.user?'Tu cuenta de Pulso':'Tu acceso a Pulso'}</h2>
   {open&&<>
    {state.status==='checking'&&<p role="status">Comprobando tu sesión…</p>}
    {state.status==='disabled'&&<p role="status">El acceso a cuentas todavía no está habilitado. Inténtalo más tarde.</p>}
    {state.status==='unavailable'&&<><p role="alert">{state.error}</p><button type="button" onClick={()=>void accountController.load()}>Reintentar conexión de cuenta</button></>}
    {state.user?<div className="account-dialog__profile"><p><strong>{state.user.name}</strong><br/>{state.user.email}</p><p>{state.user.verified?'Correo verificado':'Correo pendiente de verificar'}</p>{state.status==='offline'&&<p>Sin conexión. Puedes escuchar las copias de este navegador; los cambios de cuenta esperan a que vuelvas a conectarte.</p>}<button type="button" disabled={locked||state.status==='offline'} onClick={()=>void accountController.signOut()}>Cerrar sesión de Pulso</button></div>:client&&state.status!=='disabled'&&state.status!=='unavailable'&&<Suspense fallback={<p role="status">Preparando el acceso…</p>}><AccountKit client={client} view={view} resetToken={resetToken} google={state.google} onBusy={onBusy} onSession={onSession} onView={setView}/></Suspense>}
    {state.error&&state.status!=='unavailable'&&<p className="account-dialog__error" role="alert">{state.error}</p>}
    {message&&<p role="status">{message}</p>}
    <p className="account-dialog__local">Tu música y la conexión con Telegram siguen guardadas en este navegador. Este acceso no sincroniza todavía tu biblioteca entre dispositivos.</p>
   </>}
  </dialog>
 </>;
}
