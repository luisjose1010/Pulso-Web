/** TESTONLY synthetic SDK factory, sole replaced module in native session.worker.
 * This does NOT authenticate a real account or establish live bot compatibility.
 * Genuine pool/source/search drivers and typed SDK adapter remain in the worker. */
import Long from 'long';
import {sessionLease,saveTelegramSession,loadTelegramSession,clearTelegramSessionLease} from './saved-session';
import type {tl} from '@mtcute/core';
import {createSourcesDriver,type SourcesDriver} from './sources-driver';
import {createBotProvidersDriver,botProvidersFailure,type BotProvidersDriver} from './bot-providers-driver';
import {createBotSearchSdkDriver,type BotSearchDriver} from './bot-search-driver';
const nativeFetch=fetch.bind(globalThis);
async function event(type:string,extra:object={}){const r=await nativeFetch('/__musicflow/event',{method:'POST',body:JSON.stringify({type,...extra})});return r.json();}
Object.defineProperty(globalThis,'WebSocket',{value:class{constructor(){void event('blocked-websocket');throw Error('TESTONLY no Telegram network');}}});
globalThis.fetch=((input:RequestInfo|URL,init?:RequestInit)=>{
 const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
 if(u.origin!==location.origin){void event('blocked-fetch');throw Error('TESTONLY external denied');}return nativeFetch(input,init);
}) as typeof fetch;
let wirePeer=101;let diagnostic='';let wireMode='';let wireTitle='MUSIC_FLOW Song (Live version)';
const history=(messages:unknown[]=[])=>({_:'messages.messages',messages:messages.map((value:any)=>{
 if(value.out===true)return value;const m={...value};
 if(['download-sender-omitted','download-private-optional','download-unthreaded-ambiguous'].includes(wireMode))delete m.fromId;
 if(['download-unthreaded','download-private-optional','download-unthreaded-ambiguous'].includes(wireMode))delete m.replyTo;
 return m;
}),users:[],chats:[]});
const idOf=(username:string)=>username==='ivkmbot'?101:102+Number(username.match(/\d+/)?.[0]??0);
function identity(username:string,label='Synthetic provider'){
 const id=idOf(username);return {_:'contacts.resolvedPeer',peer:{_:'peerUser',userId:id},users:[{_:'user',id,bot:true,username,firstName:label,accessHash:Long.fromString('146000000001')}],chats:[]};
}
const markup={_:'replyInlineMarkup',rows:[{_:'keyboardInlineButtonRow',buttons:[
 {_:'keyboardInlineButton',text:'MUSIC_FLOW Song (Live version) — MUSIC_FLOW Artist',type:{_:'inlineButtonTypeCallback',data:new Uint8Array([1,2,3])}},
 {_:'keyboardInlineButton',text:'<img src=x onerror=alert(1)> '+ 'L'.repeat(80),type:{_:'inlineButtonTypeCallback',data:new Uint8Array([47,115,116,97,114,116])}},
]}]} satisfies tl.RawReplyInlineMarkup;
function page(mode:string){
 if(mode==='download-partial'&&wireTitle.includes('Second'))return page('download-no-match');
 const msg={_:'message',id:12,peerId:{_:'peerUser',userId:wirePeer},fromId:{_:'peerUser',userId:wirePeer},date:1,replyTo:{_:'messageReplyHeader',replyToMsgId:10},message:''};
 if(mode==='download-ambiguous'||mode==='download-unthreaded-ambiguous'){const copied=structuredClone(markup);copied.rows[0].buttons[1]={...copied.rows[0].buttons[0],type:{_:'inlineButtonTypeCallback',data:new Uint8Array([1,2,4])}};return history([{...msg,replyMarkup:copied}]);}
 if(mode==='download-wide-menu'){
  const rows=Array.from({length:25},(_,i)=>({_:'keyboardInlineButtonRow',buttons:[{_:'keyboardInlineButton',text:i===24?'MUSIC_FLOW Song (Live version) — MUSIC_FLOW Artist':'Other song '+i+' — Other artist',type:{_:'inlineButtonTypeCallback',data:new Uint8Array(i===24?[1,2,3]:[9,i])}}]}));
  rows.push({_:'keyboardInlineButtonRow',buttons:[{_:'keyboardInlineButton',text:'▶️',type:{_:'inlineButtonTypeCallback',data:new Uint8Array([7])}}]});
  return history([{...msg,message:'Choose a song',replyMarkup:{_:'replyInlineMarkup',rows}}]);
 }
 if(mode==='download-ranked-options'||mode==='download-no-match'){
  const labels=['MUSIC_FLOW Song (Remix) — MUSIC_FLOW Artist','MUSIC_FLOW Song (Live version) — Another Artist',...(mode==='download-ranked-options'?['#3 MUSIC_FLOW Song (Live version) — MUSIC_FLOW Artist [00:45]','MUSIC_FLOW Song (Live version) — MUSIC_FLOW Artist']:[])];
  return history([{...msg,replyMarkup:{_:'replyInlineMarkup',rows:labels.map((text,i)=>({_:'keyboardInlineButtonRow',buttons:[{_:'keyboardInlineButton',text,type:{_:'inlineButtonTypeCallback',data:new Uint8Array(i===3?[1,2,3]:[9,i])}}]}))}}]);
 }
 if(mode==='empty')return history();
 if(mode==='unknown')return history([{...msg,media:{_:'messageMediaPhoto'}}]);
 if(mode==='conflict'||mode==='missing')return history([{...msg,media:{_:'messageMediaDocument',document:{_:'document',id:new Long(1,0),accessHash:new Long(2,0),fileReference:new Uint8Array([1]),mimeType:'audio/mpeg',size:40000,attributes:[{_:'documentAttributeAudio',duration:45,...(mode==='conflict'?{title:'Different studio version',performer:'Different artist'}:{})}]}}}]);
 const selected=structuredClone(markup);if(diagnostic)selected.rows[0].buttons[0].text+='; Guest';if(mode==='download-multi'||mode==='download-partial')selected.rows[0].buttons[0].text=wireTitle+' — MUSIC_FLOW Artist';return history([{...msg,replyMarkup:selected}]);
}
export async function openTemporaryTelegram(_identity:unknown,lifetime:AbortSignal){
 await event('synthetic-sdk-open');lifetime.throwIfAborted();let closed=false,binding:{accountRef:string;accountEpoch:number}|null=null;
 let bots:BotProvidersDriver|undefined,sources:SourcesDriver|undefined,search:BotSearchDriver|undefined;
 let clicked=false,polls=0,callbackPolls=0,fileTransferred=false;let audioBytes:Uint8Array|undefined;
 const ownAudio=async()=>audioBytes??=new Uint8Array(await(await nativeFetch(['download-multi','download-partial'].includes(wireMode)?(wireTitle.includes('Second')?'/__musicflow/second.mp3':'/__musicflow/third.mp3'):diagnostic==='zero-duration-wrong-file'?'/__musicflow/zero-wrong-duration.m4a':(wireMode==='download-collaboration'||diagnostic==='control'||diagnostic==='zero-duration-valid')?'/__musicflow/collaboration.m4a':wireMode==='download-wrong-tags'?'/__musicflow/wrong-tags.m4a':'/__musicflow/download.mp3')).arrayBuffer());
 const audioPage=async(mode:string)=>{const bytes=await ownAudio();return history([{_:'message',id:clicked?13:12,peerId:{_:'peerUser',userId:wirePeer},fromId:{_:'peerUser',userId:wirePeer},date:1,message:'',...(mode==='download-recent'?{}:{replyTo:{_:'messageReplyHeader',replyToMsgId:10}}),media:{_:'messageMediaDocument',document:{_:'document',id:new Long(mode==='download-document-changed'&&fileTransferred?99:12,1),accessHash:new Long(45,2),fileReference:new Uint8Array([4,mode==='download-reference-refresh'&&fileTransferred?6:5]),dcId:2,mimeType:(diagnostic==='control'||diagnostic.startsWith('zero-duration')||['download-collaboration','download-wrong-tags'].includes(mode))?'audio/mp4':'audio/mpeg',size:mode==='download-oversize'?8388609:bytes.length,attributes:[{_:'documentAttributeAudio',duration:diagnostic.startsWith('zero-duration')?0:diagnostic==='duration'?60:45,title:diagnostic==='title-version'?'Other version':mode==='download-conflict'?'Different studio version':['download-multi','download-partial'].includes(mode)?wireTitle:'MUSIC_FLOW Song (Live version)',performer:diagnostic==='artist'?'Other Artist':diagnostic?'MUSIC_FLOW Artist; Guest':'MUSIC_FLOW Artist'}]}}}]);};
 let cooldown:{retryAt:number|null;retryBlocked:boolean}|null=null;
 const getAccountCooldown=()=>{if(cooldown&&!cooldown.retryBlocked&&cooldown.retryAt!==null&&Date.now()>=cooldown.retryAt)cooldown=null;return cooldown;};
 const current=(signal:AbortSignal)=>{if(closed||lifetime.aborted||signal.aborted)throw Error('cancelled');};
 const close=async()=>{if(closed)return;closed=true;binding=null;search?.close();bots?.close();sources?.close();await event('synthetic-sdk-close');};
 const invalidateSession=()=>{void close();};lifetime.addEventListener('abort',()=>void close(),{once:true});
 const rawCall=async(request:any,options:any)=>{
  // Closed transport schema, peer capability and policy checked BEFORE fixture IO.
  if(!['contacts.resolveUsername','messages.getHistory','messages.sendMessage','messages.getDialogs','messages.getMessages','messages.getBotCallbackAnswer','upload.getFile'].includes(request._))throw Error('Forbidden SDK method');
  if(request.peer&&(request.peer._!=='inputPeerUser'||![101,102].includes(request.peer.userId)||!Long.isLong(request.peer.accessHash)))throw Error('Peer capability not closed');
  if(options.maxRetryCount!==0||options.floodSleepThreshold!==0||options.timeout<0||options.timeout>15000||options.timeout===0&&options.abortSignal!==undefined)throw Error('SDK policy changed');
  if(request.peer)wirePeer=request.peer.userId;
  const payload={method:request._,username:request.username??null,query:request.message??null,offset:request.offset??null,limit:request.limit??null,minId:request.minId??null,peer:request.peer?{type:request.peer._,id:request.peer.userId}:null,keys:Object.keys(request).sort(),randomLong:request.randomId?Long.isLong(request.randomId):null,policy:{maxRetryCount:options.maxRetryCount,floodSleepThreshold:options.floodSleepThreshold,timeout:options.timeout}};
  // Native await barrier deliberately ignores abort, so cancel ACK cannot stand for settlement.
  const r=await nativeFetch('/__musicflow/rpc',{method:'POST',body:JSON.stringify(payload)});const v=await r.json();wireMode=v.mode;diagnostic=v.diagnostic??'';await event('rpc-settled',{method:request._});
  if(v.error){const e={errorMessage:v.error};const f=botProvidersFailure(e,Date.now());if(f.error==='rate-limit')cooldown={retryAt:f.retryAt,retryBlocked:f.retryBlocked};throw e;}
  if(v.mode==='diagnostic-binary'&&request._==='messages.getHistory'&&request.limit===20)return {...page('menu'),incidental:new Uint8Array(4097)};
  if(request._==='contacts.resolveUsername')return identity(request.username,v.label);
  if(request._==='messages.getDialogs')return {_:'messages.dialogs',dialogs:[],messages:[],users:[],chats:[]};
  if(request._==='upload.getFile'){if(options.dcId!==2||options.kind!=='download'||request.location._!=='inputDocumentFileLocation'||request.location.thumbSize!=='')throw Error('Unbound file location');const b=await ownAudio();if(request.offset+request.limit>=b.length)fileTransferred=true;return {_:'upload.file',bytes:v.mode==='download-corrupt'?new Uint8Array(Math.min(request.limit,b.length-request.offset)):b.slice(request.offset,request.offset+request.limit),mtime:0};}
  if(request._==='messages.getBotCallbackAnswer'){if(request.msgId!==12||String(request.data)!=='1,2,3')throw Error('Unbound callback');clicked=true;callbackPolls=0;return {_:'messages.botCallbackAnswer',cacheTime:0,...(v.mode==='download-url'?{url:'https://invalid.example/'}:{})};}
  if(request._==='messages.getMessages'){const p= v.mode.startsWith('download-')&&(clicked||!['download-partial','download-multi','download-option','download-collaboration','download-wrong-tags','download-reference-refresh','download-document-changed','download-changed','download-url','download-recent','download-progress','download-ambiguous','download-sender-omitted','download-unthreaded','download-private-optional','download-unthreaded-ambiguous','download-wide-menu','download-metadata-budget','download-ranked-options','download-no-match'].includes(v.mode))?await audioPage(v.mode):page(v.mode);if(v.mode==='download-changed')p.messages[0].message='Changed menu';return p;}
  if(request._==='messages.sendMessage'){wireTitle=request.message?.includes('Second')?'MUSIC_FLOW Second':request.message?.includes('Third')?'MUSIC_FLOW Third':'MUSIC_FLOW Song (Live version)';audioBytes=undefined;clicked=false;polls=0;fileTransferred=false;return v.mode==='badack'?{_:'updates',updates:[],users:[],chats:[]}:{_:'updateShortSentMessage',out:true,id:10,date:1,pts:1,ptsCount:1};}
  if(request._==='messages.getHistory'&&request.limit===20&&v.mode==='download-metadata-budget'){
   const count=clicked?++callbackPolls:++polls;
   if(count<3)return history([{_:'message',id:clicked?13:12,peerId:{_:'peerUser',userId:wirePeer},fromId:{_:'peerUser',userId:wirePeer},date:1,message:'Searching…',replyTo:{_:'messageReplyHeader',replyToMsgId:10}}]);
   return clicked?audioPage(v.mode):page('menu');
  }
  if(request._==='messages.getHistory'&&request.limit!==1&&v.mode==='download-progress'&&!clicked){polls++;if(polls===1)return history([{_:'message',id:12,peerId:{_:'peerUser',userId:wirePeer},fromId:{_:'peerUser',userId:wirePeer},date:1,message:'Searching…',replyTo:{_:'messageReplyHeader',replyToMsgId:10}}]);return page('menu');}
  if(request.limit!==1&&v.mode.startsWith('download-')&&(clicked||!['download-partial','download-multi','download-option','download-collaboration','download-wrong-tags','download-reference-refresh','download-document-changed','download-changed','download-url','download-recent','download-progress','download-ambiguous','download-sender-omitted','download-unthreaded','download-private-optional','download-unthreaded-ambiguous','download-wide-menu','download-metadata-budget','download-ranked-options','download-no-match'].includes(v.mode)))return audioPage(v.mode);
  return request.limit===1?history():page(v.mode);
 };
 const call=async(request:any,options:any)=>{
  const result=await rawCall(request,options);
  // TESTONLY individual responses fit 64KiB, while ordinary polling totals more.
  return wireMode==='download-metadata-budget'&&request._!=='upload.getFile'?{...result,incidental:'x'.repeat(8192)}:result;
 };
 let persistentLease='';
 return {
  async restore(s:AbortSignal){current(s);const config=await event('synthetic-restore-NOT-REAL');current(s);const saved=await loadTelegramSession();if(!saved)return false;persistentLease=saved.lease;if(config.mode==='persist-network')throw Error('synthetic-network');if(config.mode==='persist-revoked'){await clearTelegramSessionLease(persistentLease);throw Error('session-expired');}binding={accountRef:crypto.randomUUID(),accountEpoch:1};return true;},
  async forgetSavedAuthorization(s:AbortSignal){current(s);if(persistentLease)await clearTelegramSessionLease(persistentLease);current(s);},
  async begin(_phone:string,s:AbortSignal){current(s);await event('synthetic-begin');return 'app' as const;},
  async code(_phone:string,_code:string,s:AbortSignal){current(s);throw {errorMessage:'SESSION_PASSWORD_NEEDED'};},
  async password(_password:string,s:AbortSignal){current(s);const config=await event('synthetic-positive-auth-NOT-REAL');current(s);if(config.persistSession){persistentLease=await sessionLease();if(!await saveTelegramSession(persistentLease,'MUSIC_FLOW_SYNTHETIC_AUTH_ONLY'))throw Error('session-storage');}binding={accountRef:crypto.randomUUID(),accountEpoch:1};},
  async logout(s:AbortSignal){current(s);if(search&&!await search.quiesce()||bots&&!await bots.quiesce()||sources&&!await sources.quiesce())throw Error('synthetic logout unsettled');await event('synthetic-logout');await close();},
  close,getAccountCooldown,getAccountBinding:()=>closed?null:binding,
  createBotProviders(sessionId:string){if(!binding||closed)throw Error('No synthetic binding');return bots??=createBotProvidersDriver(binding,sessionId,{invalidateSession,resolveIdentity:(username,s)=>call({_:'contacts.resolveUsername',username},{abortSignal:s,timeout:15000,maxRetryCount:0,floodSleepThreshold:0})});},
  createSources(sessionId:string){if(!binding||closed)throw Error('No synthetic binding');return sources??=createSourcesDriver(binding,sessionId,{invalidateSession,getDialogs:(r,s)=>call({_:'messages.getDialogs',...r},{abortSignal:s,timeout:15000,maxRetryCount:0,floodSleepThreshold:0})});},
  createBotSearch(sessionId:string){if(!binding||closed||!bots)throw Error('No synthetic pool');return search??=createBotSearchSdkDriver(binding,sessionId,{providers:bots,call:call as import('@mtcute/core/client.js').BaseTelegramClient['call'],current,invalidateSession,getAccountCooldown});},
 };
}
