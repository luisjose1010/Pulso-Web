import {useEffect,useRef,useState} from 'react';
import {createAppInstall,type InstallState} from '../pwa/install-prompt';
export function AppInstallCard(){
 const [state,setState]=useState<InstallState>('manual');
 const action=useRef<ReturnType<typeof createAppInstall>|null>(null);
 useEffect(()=>{const controller=createAppInstall(window,setState);action.current=controller;return()=>{action.current=null;controller.dispose();};},[]);
 return <section className="settings-group settings-app-install" aria-labelledby="app-install-heading"><h3 id="app-install-heading">Instalar Pulso</h3><div className="settings-group__body">
 <p role="status">{state==='installed'?'Pulso está instalada.':state==='prompting'?'Completa la instalación en el aviso del navegador.':state==='requested'?'Instalación solicitada. Espera la confirmación del navegador.':state==='dismissed'?'Has cerrado el aviso. Puedes instalar desde el menú del navegador.':state==='failed'?'El navegador no pudo abrir el aviso de instalación. Usa su menú para intentarlo.':state==='ready'?'Añade Pulso a tu pantalla de inicio.':'Puedes añadir Pulso a tu pantalla de inicio desde el menú del navegador.'}</p>
 {state==='ready'&&<button type="button" onClick={()=>action.current?.prompt()}>Instalar app</button>}
 {state!=='installed'&&<p>En Chrome para Android, abre el menú ⋮ y elige «Añadir a pantalla de inicio» o «Instalar aplicación». Si abriste un enlace dentro de otra app, ábrelo primero en Chrome. En Safari, usa Compartir → Añadir a pantalla de inicio.</p>}
 </div></section>;
}
