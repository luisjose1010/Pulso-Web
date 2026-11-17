import {PULSO_BOT_SUGGESTIONS} from './bot-chat-profiles';
import {createBotProvidersDriver,type BotProvidersDependency} from './bot-providers-driver';
import type {AccountBinding} from './sources-protocol';
import type {SavedBot} from './saved-session';

export interface BotSelection {bots:SavedBot[];revision:number;initialized:boolean}
/** Authenticated, first-use profile checks only. Existing choices, including empty, win.
 * Uses the normal identity validator and one durable CAS, never searches/starts a bot.
 * Failure leaves the preference uninitialized so the next connection can try again. */
export async function prepareDefaultBotSelection(
 binding:AccountBinding,sessionId:string,selection:BotSelection,
 dependency:BotProvidersDependency,signal:AbortSignal,current:()=>boolean,
):Promise<{settled:boolean}> {
 if(selection.initialized||selection.revision!==0||selection.bots.length||signal.aborted||!current())return {settled:true};
 const abort=new AbortController(),cancel=()=>abort.abort();
 signal.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(cancel,8000);
 const core=createBotProvidersDriver(binding,sessionId,dependency);
 const context={signal:abort.signal,current:()=>!signal.aborted&&current()};
 const envelope=()=>({protocol:'pulso-bot-providers' as const,version:1 as const,sessionId,...binding,providerRevision:0,operationId:crypto.randomUUID(),requestId:crypto.randomUUID()});
 try{
  const refs:string[]=[];
  for(const username of PULSO_BOT_SUGGESTIONS){
   const reply=await core.handle({...envelope(),type:'bots.validate',input:username},context);
   if(!await core.whenSettled())return {settled:false};
   if(reply?.type!=='bots.validated')return {settled:true};
   refs.push(reply.offer.providerRef);
  }
  if(!abort.signal.aborted&&context.current())await core.handle({...envelope(),type:'bots.setOrder',expectedRevision:0,providerRefs:refs},context);
  return {settled:await core.whenSettled()};
 }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);core.close();}
}
