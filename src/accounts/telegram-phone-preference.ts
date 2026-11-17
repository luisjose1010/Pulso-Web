import {useEffect,useRef,useState} from 'react';
import {registerUpdateBlocker} from '../service-worker/update-blockers';

export interface TelegramPhonePreference {accountId:string;telegramPhone:string|null;revision:number|null}
function parse(value:unknown,accountId:string):TelegramPhonePreference{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('profile');
 const p=value as Record<string,unknown>;
 if(p.accountId!==accountId||p.telegramPhone!==null&&(typeof p.telegramPhone!=='string'||!/^\+[1-9][0-9]{5,14}$/.test(p.telegramPhone))||p.revision!==null&&(!Number.isSafeInteger(p.revision)||(p.revision as number)<1))throw Error('profile');
 return {accountId,telegramPhone:p.telegramPhone as string|null,revision:p.revision as number|null};
}
export async function requestTelegramPhonePreference(accountId:string,signal:AbortSignal,value?:{phone:string;revision:number|null},fetcher:typeof fetch=fetch):Promise<TelegramPhonePreference>{
 const response=await fetcher('/api/account-profile',{method:value?'PUT':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal,...(value?{headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId,telegramPhone:value.phone,revision:value.revision})}:{})});
 if(!response.ok)throw Error('profile');const text=await response.text();if(text.length>2048)throw Error('profile');return parse(JSON.parse(text),accountId);
}
/** The account captured at successful Telegram login remains the target even
 * if cookies change while this best-effort preference request is in flight. */
export function useTelegramPhonePreference(accountId:string|undefined){
 const [state,setState]=useState<{accountId:string|undefined;phone:string|null;notice:string|null}>({accountId,phone:null,notice:null});
 const lifetime=useRef<{accountId:string;abort:AbortController;ready:Promise<TelegramPhonePreference>;saved:TelegramPhonePreference|null;writing:boolean}|null>(null);
 useEffect(()=>registerUpdateBlocker(()=>lifetime.current?.writing===true),[]);
 useEffect(()=>{
  setState({accountId,phone:null,notice:null});if(!accountId)return;
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
  const entry={accountId,abort,ready:Promise.resolve(null as unknown as TelegramPhonePreference),saved:null as TelegramPhonePreference|null,writing:false};lifetime.current=entry;
  entry.ready=requestTelegramPhonePreference(accountId,abort.signal).then(value=>{if(lifetime.current!==entry||abort.signal.aborted)throw Error('stale');entry.saved=value;setState({accountId,phone:value.telegramPhone,notice:null});return value;}).catch(()=>{if(lifetime.current===entry&&!abort.signal.aborted)setState({accountId,phone:null,notice:'No pudimos recuperar el número guardado. Puedes escribirlo.'});throw Error('profile');}).finally(()=>clearTimeout(timer));
  void entry.ready.catch(()=>{});
  return()=>{clearTimeout(timer);abort.abort();if(lifetime.current===entry)lifetime.current=null;};
 },[accountId]);
 return {phone:state.accountId===accountId?state.phone:null,notice:state.accountId===accountId?state.notice:null,async remember(phone:string,expectedAccountId:string){
  const entry=lifetime.current;if(!entry||entry.accountId!==expectedAccountId||entry.abort.signal.aborted||entry.writing||!/^\+[1-9][0-9]{5,14}$/.test(phone))return false;
  entry.writing=true;
  try{
   const value=entry.saved??await entry.ready;if(lifetime.current!==entry||entry.abort.signal.aborted)return false;
   if(value.telegramPhone===phone)return true;
   const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);const stop=()=>abort.abort();entry.abort.signal.addEventListener('abort',stop,{once:true});
   try{const next=await requestTelegramPhonePreference(entry.accountId,abort.signal,{phone,revision:value.revision});if(lifetime.current!==entry||entry.abort.signal.aborted)return false;entry.saved=next;setState({accountId:entry.accountId,phone:next.telegramPhone,notice:'Número guardado en tu cuenta de Pulso.'});return true;}
   finally{clearTimeout(timer);entry.abort.signal.removeEventListener('abort',stop);}
  }catch{if(lifetime.current===entry&&!entry.abort.signal.aborted)setState(old=>({...old,notice:'Telegram está conectado, pero no pudimos actualizar el número guardado. No se repetirá automáticamente.'}));return false;}
  finally{entry.writing=false;}
 }};
}
