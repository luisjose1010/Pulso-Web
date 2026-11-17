export type NotificationSupport='ready'|'install-ios'|'unsupported';
export interface NotificationHost {
 support:()=>NotificationSupport;permission:()=>NotificationPermission;
 request:()=>Promise<NotificationPermission>;
 registration:()=>Promise<{active:unknown;showNotification:(title:string,options:NotificationOptions)=>Promise<void>;getNotifications:()=>Promise<{tag:string;close:()=>void}[]>}|undefined>;
 read:()=>boolean;write:(enabled:boolean)=>void;now:()=>number;
}
export function createDownloadNotifications(host:NotificationHost){
 let enabled=host.read(),epoch=0,error:string|null=null;
 const listeners=new Set<()=>void>(),last=new Map<string,{key:unknown;body:string;at:number;terminal:boolean}>();
 let work:Promise<void>=Promise.resolve();
 const emit=()=>listeners.forEach(fn=>fn());
 const valid=(current:()=>boolean)=>{try{return current()===true;}catch{return false;}};
 const state=()=>({support:host.support(),permission:host.permission(),enabled:enabled&&host.permission()==='granted',error});
 async function enable(){
  if(host.support()!=='ready')return false;
  const token=++epoch;error=null;
  try{
   // Invoke synchronously from the user's button, before any other async work.
   const permission=await host.request();if(token!==epoch)return false;
   if(permission!=='granted'){enabled=false;host.write(false);emit();return false;}
   const registration=await host.registration();if(token!==epoch)return false;
   if(!registration?.active)throw Error('Abre Pulso de nuevo para terminar de preparar las notificaciones.');
   host.write(true);enabled=true;emit();return true;
  }catch(e){if(token===epoch){enabled=false;error=e instanceof Error?e.message:'No se pudieron activar las notificaciones.';emit();}return false;}
 }
 function disable(){const token=++epoch;enabled=false;last.clear();error=null;try{host.write(false);}catch{error='Avisos desactivados por ahora, pero no se pudo guardar esta preferencia.';}emit();void host.registration().then(async reg=>{for(const n of await reg?.getNotifications()??[])if(token===epoch&&n.tag.startsWith('pulso-download-'))n.close();}).catch(()=>{});}
 function dismiss(kind:'song'|'album'|'test',key:unknown){
  if(last.get(kind)?.key!==key)return;
  last.delete(kind);const token=epoch;
  void host.registration().then(async reg=>{for(const notification of await reg?.getNotifications()??[])if(token===epoch&&!last.has(kind)&&notification.tag===`pulso-download-${kind}`)notification.close();}).catch(()=>{});
 }
 function notify(kind:'song'|'album'|'test',key:unknown,title:string,body:string,terminal=false,current:()=>boolean=()=>true){
  if(!enabled||host.support()!=='ready'||host.permission()!=='granted'||!valid(current))return;
  const previous=last.get(kind),now=host.now();
  if(previous&&previous.key===key&&(previous.terminal||previous.body===body||!terminal&&now-previous.at<15000))return;
  const record={key,body,at:now,terminal};last.set(kind,record);const token=epoch;
  work=work.catch(()=>{}).then(async()=>{
   if(token!==epoch||!enabled||host.permission()!=='granted'||!valid(current)||last.get(kind)!==record)return;
   try{const reg=await host.registration();if(!reg?.active||token!==epoch||!enabled||host.permission()!=='granted'||!valid(current)||last.get(kind)!==record)return;
    await reg.showNotification(title.slice(0,160),{body:body.slice(0,300),tag:`pulso-download-${kind}`,icon:'/icons/pulso-192.png',badge:'/icons/pulso-192.png',data:{kind:'pulso-download',version:1},silent:!terminal});
   }catch{error='El navegador no pudo mostrar el aviso. Puedes seguir las descargas dentro de Pulso.';emit();}
  });
 }
 return {state,enable,disable,notify,dismiss,settled:()=>work,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},test:()=>notify('test',{},'Pulso','Las notificaciones de descargas están listas.',true)};
}
const preference='pulso:download-notifications:v1';
export const downloadNotifications=createDownloadNotifications({
 support:()=>{
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
  const installed=matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
  if(ios&&!installed)return 'install-ios';
  return isSecureContext&&'Notification'in window&&'serviceWorker'in navigator&&typeof ServiceWorkerRegistration!=='undefined'&&'showNotification'in ServiceWorkerRegistration.prototype?'ready':'unsupported';
 },permission:()=>typeof Notification==='undefined'?'default':Notification.permission,
 request:()=>Notification.requestPermission(),registration:()=>navigator.serviceWorker.getRegistration(),
 read:()=>{try{return localStorage.getItem(preference)==='enabled';}catch{return false;}},
 write:enabled=>localStorage.setItem(preference,enabled?'enabled':'disabled'),now:()=>Date.now(),
});
