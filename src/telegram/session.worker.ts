/// <reference lib="webworker" />
import {hasSavedTelegramSession,clearSavedTelegramSession} from './saved-session';
import {parseSessionCommand,sessionFailure,type SessionCommand,type SessionReply,type Delivery} from './session-protocol';
import {decodeTelegramApiIdentity,API_IDENTITY_INPUT_BYTES} from './api-identity';
import {parseAccountBinding,parseSourcesCommand,type SourcesCommand} from './sources-protocol';
import type {SourcesDriver} from './sources-driver';
import {parseSaved,type SourcesBridgeReply} from './sources-bridge-protocol';
import {copyBotEnvelope,parseBotProvidersCommand,type BotProvidersCommand,type BotProvidersReply} from './bot-providers-protocol';
import type {BotProvidersDriver} from './bot-providers-driver';
import type {BotProvidersBridgeReply} from './bot-providers-bridge-protocol';
import {copyBotSearchEnvelope,parseBotSearchCommand,parseBotSearchReply,type BotSearchCommand,type BotSearchReply} from './bot-search-protocol';
import type {BotSearchDriver} from './bot-search-driver';
import type {BotSearchBridgeReply} from './bot-search-bridge-protocol';
import type {QrLoginChallenge} from './qr-login-protocol';
declare const self:DedicatedWorkerGlobalScope;
let session='',phase:SessionReply['phase']='disconnected',active=false,phone='';
let codeDelivery:Delivery|null=null;
let qrChallenge:QrLoginChallenge|null=null;
let client:import('./temporary-sdk').TemporaryTelegramDriver|undefined;
const abort=new AbortController();
let sources:SourcesDriver|undefined,page:Promise<void>|null=null,control=false;
let bots:BotProvidersDriver|undefined,botFlight:Promise<void>|null=null,botControl:Promise<void>|null=null;
let search:BotSearchDriver|undefined,searchFlight:Promise<void>|null=null,searchControl:Promise<void>|null=null,searchCancelled=false;
let retryAt:number|null=null,retryBlocked=false;
const remoteAllowed=()=>!retryBlocked&&(retryAt===null||Date.now()>=retryAt);
function observeRemote(reply:{type:string;retryAt?:number|null;retryBlocked?:boolean}){if(reply.type!=='bots.error'&&reply.type!=='sources.error'&&reply.type!=='bot-search.error')return;retryBlocked ||=!!reply.retryBlocked;if(reply.retryAt!=null)retryAt=Math.max(retryAt??0,reply.retryAt);}
/** Optional only for historic synthetic SDK fixtures. Production factory implements this accessor. */
function refreshCooldown(){const cooldown=client?.getAccountCooldown?.();if(cooldown){retryBlocked ||=cooldown.retryBlocked;if(cooldown.retryAt!==null)retryAt=Math.max(retryAt??0,cooldown.retryAt);}}
function closeLocal(){qrChallenge=null;abort.abort();search?.close();bots?.close();sources?.close();void client?.close().catch(()=>{});self.close();}
async function searchCommand(command:BotSearchCommand){
 if(!client||phase!=='connected'||active||command.sessionId!==session||command.type!=='bot-search.cancel'&&(searchFlight||searchControl||botFlight||botControl||page||control)||command.type==='bot-search.cancel'&&(!search||!searchFlight||searchControl)){closeLocal();return;}
 const driver=client,binding=parseAccountBinding(driver.getAccountBinding());
 if(!binding||command.accountRef!==binding.accountRef||command.accountEpoch!==binding.accountEpoch){closeLocal();return;}
 const current=()=>!abort.signal.aborted&&client===driver&&driver.getAccountBinding()?.accountRef===binding.accountRef&&driver.getAccountBinding()?.accountEpoch===binding.accountEpoch;
 let core:BotSearchDriver|undefined;try{core=search??=driver.createBotSearch?.(session);}catch{closeLocal();return;}
 const post=(reply:BotSearchReply,sessionClosed:boolean)=>self.postMessage({protocol:'pulso-bot-search',version:1,reply,sessionClosed,retryAt,retryBlocked} satisfies BotSearchBridgeReply);
 let terminal=false,sending=false,notice=false;
 const run=async()=>{try{
  refreshCooldown();let reply:BotSearchReply|null;
  if(command.type!=='bot-search.cancel'&&(!core||!remoteAllowed()))reply={...copyBotSearchEnvelope(command),type:'bot-search.error',error:core?'rate-limit':'unsupported',delivery:'not-dispatched',retryAt:core?retryAt:null,retryBlocked:core?retryBlocked:false};
  else reply=await core!.handle(command,{signal:abort.signal,current,publish:raw=>{
   if(terminal)return;const progress=parseBotSearchReply(raw,command);if(!progress||!['bot-search.sending','bot-search.download-progress','bot-search.provider-notice'].includes(progress.type)||command.type==='bot-search.cancel'||!current()){closeLocal();return;}
   if(progress.type==='bot-search.provider-notice'){if(command.type!=='bot-search.download'){closeLocal();return;}if(notice||searchCancelled)return;notice=true;}
   if(progress.type==='bot-search.sending'){if(sending)return;sending=true;}post(progress,false);
  }});
  const settled=command.type!=='bot-search.cancel'&&core?await core.whenSettled():true;
  if(abort.signal.aborted)return;terminal=true;if(!reply||!parseBotSearchReply(reply,command)||command.type!=='bot-search.cancel'&&!['bot-search.error','bot-search.result','bot-search.downloaded'].includes(reply.type)||command.type==='bot-search.cancel'&&(reply.type!=='bot-search.cancelled'||reply.targetRequestId!==command.targetRequestId)){closeLocal();return;}observeRemote(reply);refreshCooldown();
  const sessionClosed=!settled||!current()||!driver.getAccountBinding();post(reply,sessionClosed);if(sessionClosed)closeLocal();
 }catch{closeLocal();}};
 if(command.type==='bot-search.cancel'){searchCancelled=true;const flight=run();searchControl=flight;try{await flight;}finally{if(searchControl===flight)searchControl=null;}}
 else{searchCancelled=false;const flight=run();searchFlight=flight;try{await flight;}finally{if(searchFlight===flight)searchFlight=null;}}
}
async function botCommand(command:BotProvidersCommand){
 if(!client||phase!=='connected'||active||command.sessionId!==session||searchFlight||searchControl||command.type!=='bots.cancel'&&(botFlight||botControl||page||control||searchFlight||searchControl)||command.type==='bots.cancel'&&botControl){closeLocal();return;}
 const driver=client,binding=parseAccountBinding(driver.getAccountBinding());
 if(!binding||command.accountRef!==binding.accountRef||command.accountEpoch!==binding.accountEpoch){closeLocal();return;}
 const current=()=>!abort.signal.aborted&&client===driver&&driver.getAccountBinding()?.accountRef===binding.accountRef&&driver.getAccountBinding()?.accountEpoch===binding.accountEpoch;
 const core=bots??=driver.createBotProviders(session);
 const run=async()=>{try{
  refreshCooldown();let reply:BotProvidersReply|null=command.type==='bots.validate'&&!remoteAllowed()?{...copyBotEnvelope(command),type:'bots.error',error:'rate-limit',retryAt,retryBlocked}:await core.handle(command,{signal:abort.signal,current});
  // Cancel ACK is control only. Terminal validation publication waits for the actual SDK settlement.
  const settled=command.type==='bots.validate'?await core.whenSettled():true;
  if(abort.signal.aborted)return;if(!reply){closeLocal();return;}observeRemote(reply);refreshCooldown();
  if(reply.type==='bots.error')reply={...reply,retryAt,retryBlocked};
  const sessionClosed=!settled||!current()||!driver.getAccountBinding();
  self.postMessage({protocol:'pulso-bot-providers',version:1,reply,sessionClosed} satisfies BotProvidersBridgeReply);
  if(sessionClosed)closeLocal();
 }catch{closeLocal();}};
 if(command.type==='bots.cancel'){const flight=run();botControl=flight;try{await flight;}finally{if(botControl===flight)botControl=null;}}
 else{const flight=run();botFlight=flight;try{await flight;}finally{if(botFlight===flight)botFlight=null;}}
}
async function sourceCommand(command:SourcesCommand){
 if(!sources||!client||phase!=='connected'||active||command.sessionId!==session||searchFlight||searchControl||command.type!=='sources.cancel'&&(page||control||botFlight||botControl||searchFlight||searchControl)||command.type==='sources.cancel'&&control){closeLocal();return;}
 const driver=client,core=sources;const binding=parseAccountBinding(driver.getAccountBinding());
 if(!binding||command.accountRef!==binding.accountRef||command.accountEpoch!==binding.accountEpoch){closeLocal();return;}
 const current=()=>!abort.signal.aborted&&client===driver&&driver.getAccountBinding()?.accountRef===binding?.accountRef&&driver.getAccountBinding()?.accountEpoch===binding?.accountEpoch;
 const run=async()=>{
  try{refreshCooldown();let reply=command.type==='sources.page'&&!remoteAllowed()?{protocol:'pulso-sources' as const,version:1 as const,sessionId:command.sessionId,accountRef:command.accountRef,accountEpoch:command.accountEpoch,listEpoch:command.listEpoch,operationId:command.operationId,requestId:command.requestId,type:'sources.error' as const,error:'rate-limit' as const,retryAt,retryBlocked}:await core.handle(command,{signal:abort.signal,current});
   const settled=command.type==='sources.page'?await core.whenSettled():true;
   if(abort.signal.aborted)return;if(!reply){closeLocal();return;}
   observeRemote(reply);refreshCooldown();if(reply.type==='sources.error')reply={...reply,retryAt,retryBlocked};const sessionClosed=!settled||!current()||!driver.getAccountBinding();
   self.postMessage({protocol:'pulso-sources',version:1,reply,sessionClosed,saved:sessionClosed?null:core.getSaved()} satisfies SourcesBridgeReply);
   if(sessionClosed)closeLocal();
  }catch{closeLocal();}
 };
 if(command.type==='sources.page'){const flight=run();page=flight;try{await flight;}finally{if(page===flight)page=null;}}
 else{control=true;try{await run();}finally{control=false;}}
}

async function configuration(){
 const response=await fetch('/telegram-config.json',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:abort.signal});
 if(!response.ok||!response.body)throw Error('configuration');
 const reader=response.body.getReader();let bytes=0;const chunks:Uint8Array[]=[];
 try{while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>API_IDENTITY_INPUT_BYTES)throw Error('configuration');chunks.push(r.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const data=new Uint8Array(bytes);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
 const config=decodeTelegramApiIdentity(new TextDecoder('utf-8',{fatal:true}).decode(data));if(!config)throw Error('configuration');return config;
}
async function open(){
 const identity=await configuration();
 const {openTemporaryTelegram}=await import('./temporary-sdk');client=await openTemporaryTelegram(identity,abort.signal);return client;
}
function reply(command:SessionCommand,error:SessionReply['error']=null,waitUntil:number|null=null,delivery:Delivery|null=phase==='code'?codeDelivery:null){
 const offered=phase==='code'&&!retryBlocked?client?.getCodeResend?.():null;
 const codeResend=offered?{delivery:offered.delivery,availableAt:Math.max(offered.availableAt,retryAt??0)}:null;
 self.postMessage({version:2,session,request:command.request,phase,error,retryAt:waitUntil,delivery,binding:phase==='connected'?parseAccountBinding(client!.getAccountBinding()):null,saved:phase==='connected'?parseSaved(sources!.getSaved()):null,...(phase==='code'?{codeResend}:{}),...(phase==='qr'&&qrChallenge?{qr:qrChallenge}:{}),...(phase==='connected'&&bots?{bots:bots.getSnapshot()!.providers}:{})} satisfies SessionReply);
}
self.onmessage=event=>{
 if(event.data?.protocol==='pulso-bot-search'){const command=parseBotSearchCommand(event.data);if(!command){closeLocal();return;}void searchCommand(command);return;}
 if(event.data?.protocol==='pulso-bot-providers'){const bot=parseBotProvidersCommand(event.data);if(!bot){closeLocal();return;}void botCommand(bot);return;}
 if(event.data?.protocol==='pulso-sources'){const source=parseSourcesCommand(event.data);if(!source){closeLocal();return;}void sourceCommand(source);return;}
 const command=parseSessionCommand(event.data);if(!command||active||session&&command.session!==session){closeLocal();return;}
 if(!session){if(!['begin','qr-begin','restore','forget'].includes(command.type)){closeLocal();return;}session=command.session;}
 if(['begin','qr-begin','restore','forget'].includes(command.type)&&phase!=='disconnected'||(command.type==='code'||command.type==='resend')&&phase!=='code'||command.type==='qr-check'&&phase!=='qr'||command.type==='password'&&phase!=='password'||command.type==='logout'&&phase!=='connected'){closeLocal();return;}
 active=true;
 void (async()=>{
  try{
   if(command.type==='forget'){await clearSavedTelegramSession();if(abort.signal.aborted)return;phase='disconnected';reply(command);self.close();return;}
   if(command.type==='restore'){
    if(!await hasSavedTelegramSession()){phase='disconnected';reply(command);self.close();return;}
    const ready=await open();if(!ready.restore)throw Error('unsupported');
    if(!await ready.restore(abort.signal)){phase='disconnected';reply(command);closeLocal();return;}
   }else if(command.type==='logout'){
    // Forget this authorization even if remote quiescence cannot be confirmed.
    await client!.forgetSavedAuthorization?.(abort.signal);
    if(search){const settled=await search.quiesce();if(searchFlight)await searchFlight;if(searchControl)await searchControl;if(abort.signal.aborted)return;if(!settled||!client?.getAccountBinding()){phase='error';reply(command,'logout-unconfirmed');closeLocal();return;}}
    if(bots){const settled=await bots.quiesce();if(botFlight)await botFlight;if(botControl)await botControl;if(!settled||!client?.getAccountBinding()){phase='error';reply(command,'logout-unconfirmed');closeLocal();return;}}
    if(page){const settled=await sources!.quiesce();await page;if(!settled||!client?.getAccountBinding()){phase='error';reply(command,'logout-unconfirmed');closeLocal();return;}}
    await client!.logout(abort.signal);client=undefined;phone='';phase='disconnected';reply(command);self.close();return;
   }
   if(command.type==='qr-begin'||command.type==='qr-check'){
    const ready=command.type==='qr-begin'?await open():client!;refreshCooldown();
    if(!remoteAllowed()){
     if(qrChallenge){phase='qr';reply(command,'rate-limit',retryAt);return;}
     throw {text:'FLOOD_WAIT',seconds:retryAt===null?undefined:Math.max(1,Math.ceil((retryAt-Date.now())/1000))};
    }
    const method=command.type==='qr-begin'?ready.beginQr:ready.checkQr;if(!method)throw Error('unsupported');
    qrChallenge=await method(abort.signal);if(abort.signal.aborted)return;
    if(qrChallenge){phase='qr';reply(command);return;}
   }else if(command.type==='begin'){
    const ready=await open();phone=command.value;
    const delivery=await ready.begin(phone,abort.signal);
    if(delivery!==null){codeDelivery=delivery;phase='code';reply(command);return;}
   }else if(command.type==='resend'){
    const offered=client?.getCodeResend?.();refreshCooldown();
    if(!remoteAllowed()){reply(command,'rate-limit',retryAt);return;}
    if(!offered||!client?.resendCode){reply(command,'unsupported');return;}
    if(Date.now()<offered.availableAt){reply(command,'rate-limit',offered.availableAt);return;}
    codeDelivery=await client.resendCode(abort.signal);if(abort.signal.aborted)return;
    phase='code';reply(command);return;
   }else if(command.type==='code')await client!.code(phone,command.value,abort.signal);
   else if(command.type==='password')await client!.password(command.value,abort.signal);
   if(!parseAccountBinding(client!.getAccountBinding())){phase='error';reply(command,'protocol');closeLocal();return;}
   sources=client!.createSources(session);if(!parseSaved(sources.getSaved())){phase='error';reply(command,'protocol');closeLocal();return;}
   await client!.prepareBotProviders?.(session,abort.signal);if(abort.signal.aborted)return;
   bots=client!.createBotProviders?.(session);if(bots&&!bots.getSnapshot())throw Error('session-storage');
   phase='connected';phone='';qrChallenge=null;reply(command);
  }catch(error){
   const safe=sessionFailure(error);
   if(safe.passwordNeeded&&['code','begin','qr-begin','qr-check'].includes(command.type)){qrChallenge=null;phase='password';reply(command);return;}
   if(command.type==='qr-check'&&safe.error==='rate-limit'&&qrChallenge){retryBlocked ||=safe.retryAt===null;if(safe.retryAt!==null)retryAt=Math.max(retryAt??0,safe.retryAt);phase='qr';reply(command,safe.error,safe.retryAt);return;}
   const retryable=command.type==='code'&&safe.error==='code-invalid'||command.type==='password'&&safe.error==='password-invalid'||(command.type==='code'||command.type==='resend'||command.type==='password')&&safe.error==='rate-limit';
   if(retryable){if(safe.error==='rate-limit'){retryBlocked ||=safe.retryAt===null;if(safe.retryAt!==null)retryAt=Math.max(retryAt??0,safe.retryAt);}phase=command.type==='password'?'password':'code';reply(command,safe.error,safe.retryAt);return;}
   phase='error';phone='';reply(command,command.type==='logout'&&safe.error!=='session-storage'?'logout-unconfirmed':safe.error,safe.retryAt);
   abort.abort();await client?.close().catch(()=>{});self.close();
  }finally{active=false;}
 })();
};
self.onmessageerror=closeLocal;
