import React from 'react';
import type {BotsSnapshot,TelegramSessionClient} from '../telegram/session-client';
import './required-setup.css';

export function setupWasCompleted(accountId:string|undefined){try{return !!accountId&&localStorage.getItem(`pulso:setup:v1:${accountId}`)==='complete';}catch{return false;}}
export function rememberCompletedSetup(accountId:string|undefined){try{if(accountId)localStorage.setItem(`pulso:setup:v1:${accountId}`,'complete');}catch{/* The current opening can still finish. */}}

/** A page, rather than a dismissible dialog. The app behind it is inert. */
export function RequiredSetup({step,children}:{step:'phone'|'bots';children:React.ReactNode}){
 const title=React.useRef<HTMLHeadingElement>(null);
 React.useLayoutEffect(()=>{const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[]);
 React.useLayoutEffect(()=>{title.current?.focus({preventScroll:true});},[step]);
 return <main className="required-setup" aria-label="Configura Pulso"><div className="required-setup__card"><header><p className="required-setup__brand">pulso</p><p className="required-setup__step">Paso {step==='phone'?'1':'2'} de 2</p><div className="required-setup__progress" aria-hidden="true"><span/><span data-active={step==='bots'}/></div><h1 ref={title} tabIndex={-1}>{step==='phone'?'Conecta tu Telegram':'Elige tus bots de música'}</h1><p>{step==='phone'?'Usa el número de tu cuenta de Telegram para conectar tu música.':'Conserva los bots de Pulso o elige los que prefieras.'}</p></header>{children}</div></main>;
}

export function SetupBots({client,state,canConnect,onFinish}:{client:TelegramSessionClient;state:BotsSnapshot;canConnect:boolean;onFinish:()=>void}){
 const [editing,setEditing]=React.useState(false),[draft,setDraft]=React.useState('');
 const current=client.captureBotsCurrent(),action=client.captureBotActionCurrent(),cancel=client.captureBotCancel();
 const enabled=canConnect&&!state.pending&&!state.cancelling;
 return <section className="setup-bots" aria-label="Tu selección de bots" aria-busy={state.pending}>
  <ol>{state.providers.map((bot,index)=><li key={bot.providerRef}><span className="setup-bots__symbol" aria-hidden="true">♫</span><div><strong>{bot.label}</strong><span>@{bot.username}</span><small>{index===0?'Principal':index===1?'Respaldo':`${index+1}.º en la búsqueda`}</small></div>{editing&&<div className="setup-bots__actions"><button type="button" aria-label={`Subir @${bot.username}`} disabled={!enabled||index===0} onClick={()=>{if(enabled&&current())client.moveBot(bot.providerRef,'up',action);}}>↑</button><button type="button" aria-label={`Bajar @${bot.username}`} disabled={!enabled||index===state.providers.length-1} onClick={()=>{if(enabled&&current())client.moveBot(bot.providerRef,'down',action);}}>↓</button><button type="button" aria-label={`Quitar @${bot.username}`} disabled={!enabled} onClick={()=>{if(enabled&&current())client.removeBot(bot.providerRef,action);}}>×</button></div>}</li>)}</ol>
  {!state.providers.length&&<p>Necesitas añadir al menos un bot para continuar.</p>}
  {!editing?<button type="button" className="setup-secondary" onClick={()=>setEditing(true)}>Elegir otros bots</button>:<form onSubmit={event=>{event.preventDefault();if(enabled&&current()&&draft.trim()&&state.providers.length<5)client.addBot(draft.trim(),action);}}><label>Usuario del bot<input type="text" placeholder="@nombre_del_bot" autoComplete="off" autoCapitalize="none" spellCheck={false} value={draft} maxLength={512} onChange={event=>setDraft(event.target.value)} disabled={!enabled}/></label><button type="submit" disabled={!enabled||!draft.trim()||state.providers.length>=5}>Comprobar y añadir</button><p className="setup-note">Hasta 5 bots. Se comprueba su perfil; la búsqueda musical depende de cada bot.</p></form>}
  {state.pending&&<p role="status">Guardando tu selección…</p>}{state.notice&&<p role="status">{state.notice}</p>}{state.error&&<p role="alert">{state.error}</p>}
  {state.pending&&<button type="button" className="setup-secondary" onClick={cancel}>Cancelar cambio</button>}
  <button type="button" className="setup-primary" disabled={!enabled||!state.providers.length} onClick={()=>{if(enabled&&current())onFinish();}}>Empezar a escuchar</button><p className="setup-note">Después podrás cambiarlos en Configuración.</p>
 </section>;
}
