import {useEffect,useReducer,useState} from 'react';
import './download-notification-settings.css';
import {downloadNotifications} from '../pwa/download-notifications';
export function DownloadNotificationSettings(){
 const [,refresh]=useReducer(n=>n+1,0),[pending,setPending]=useState(false);
 useEffect(()=>{const stop=downloadNotifications.subscribe(refresh);const sync=()=>refresh();window.addEventListener('focus',sync);return()=>{stop();window.removeEventListener('focus',sync);};},[]);
 const state=downloadNotifications.state();
 return <section className="settings-group settings-notifications" aria-labelledby="download-notifications-heading"><h3 id="download-notifications-heading">Avisos de descargas</h3><div className="settings-group__body">
 <p>Recibe avisos del avance y del resultado de tus descargas. Pueden mostrar nombres de canciones y álbumes en la pantalla bloqueada.</p>
 <p role="status">{state.support==='install-ios'?'En iPhone o iPad, añade Pulso a Inicio desde Compartir y ábrela desde su icono para activar los avisos.':state.support==='unsupported'?'Este navegador no admite estos avisos. Las descargas siguen visibles en Pulso.':state.permission==='denied'?'Las notificaciones están bloqueadas. Puedes permitirlas en los ajustes del navegador o del teléfono.':state.enabled?'Avisos activados en este navegador.':'Avisos desactivados.'}</p>
 {state.support==='ready'&&<div className="controls">{state.enabled?<><button type="button" onClick={()=>downloadNotifications.test()}>Enviar aviso de prueba</button><button type="button" onClick={()=>downloadNotifications.disable()}>Desactivar avisos</button></>:state.permission!=='denied'&&<button type="button" disabled={pending} onClick={()=>{setPending(true);void downloadNotifications.enable().finally(()=>setPending(false));}}>{pending?'Esperando permiso…':'Activar notificaciones'}</button>}</div>}
 {state.error&&<p role="status">{state.error}</p>}
 <p>Los avisos no mantienen la app ejecutándose: si el teléfono la suspende, la descarga y sus avisos pueden detenerse hasta que vuelvas a abrirla.</p>
 </div></section>;
}
