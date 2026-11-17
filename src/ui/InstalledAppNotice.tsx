import {useEffect,useState} from 'react';
import {detectInstalledPulso,type InstalledAppState,type RelatedApplication} from '../pwa/installed-app';
export function InstalledAppNotice(){
 const [state,setState]=useState<InstalledAppState>('standalone'),[dismissed,setDismissed]=useState(false);
 useEffect(()=>{
  let live=true,generation=0;const media=matchMedia('(display-mode: standalone)');
  const check=()=>{const attempt=++generation;const nav=navigator as Navigator&{standalone?:boolean;getInstalledRelatedApps?:()=>Promise<RelatedApplication[]>};void detectInstalledPulso({origin:location.origin,standalone:media.matches||nav.standalone===true,related:nav.getInstalledRelatedApps?.bind(nav)}).then(value=>{if(live&&attempt===generation)setState(value);});};
  check();window.addEventListener('focus',check);window.addEventListener('pageshow',check);media.addEventListener('change',check);
  return()=>{live=false;generation++;window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);media.removeEventListener('change',check);};
 },[]);
 if(dismissed||state==='standalone'||state==='not-detected')return null;
 return <aside className="installed-app-notice" aria-label="Usar Pulso instalada"><p><strong>{state==='installed'?'Pulso ya está instalada.':'¿Ya instalaste Pulso?'}</strong> {state==='installed'?'Ábrela desde su icono para seguir usando esa versión.':'Si la tienes en la pantalla de inicio, ábrela desde su icono.'}</p><p>En iPhone, Safari y la app instalada guardan sus descargas por separado. Usa la misma versión para evitar descargar tus canciones en ambos sitios.</p><button type="button" onClick={()=>setDismissed(true)}>Seguir en este navegador</button></aside>;
}
