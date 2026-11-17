/** TESTONLY auth/MTProto. Real worker, session vault, defaults and bot driver. */
import Long from 'long';
import {createBotProvidersDriver,type BotProvidersDriver} from '../../src/telegram/bot-providers-driver';
import {createSourcesDriver,type SourcesDriver} from '../../src/telegram/sources-driver';
import {prepareDefaultBotSelection} from '../../src/telegram/default-bot-selection';
import {sessionLease,saveTelegramSession,loadTelegramSession,loadTelegramBotSelection,saveTelegramBots,clearSavedTelegramSession,type SavedBot} from '../../src/telegram/saved-session';
export async function openTemporaryTelegram(_identity:unknown,signal:AbortSignal){
 let lease='',binding:{accountRef:string;accountEpoch:number}|null=null,selected:SavedBot[]=[],revision=0,bots:BotProvidersDriver|undefined,sources:SourcesDriver|undefined;
 const event=async(kind:string)=>{signal.throwIfAborted();await fetch('/__setup-event?kind='+kind);};
 const close=async()=>{bots?.close();sources?.close();binding=null;};
 const resolveIdentity=async(username:string)=>{await event('profile');const id=username==='kdmusic_bot'?101:username==='deezermusicbot'?102:103;return {_: 'contacts.resolvedPeer',peer:{_: 'peerUser',userId:id},chats:[],users:[{_: 'user',id,bot:username!=='humanuser',username,accessHash:new Long(3,id,false),firstName:username}]};};
 return {
 async begin(){await event('begin');lease=await sessionLease();return 'app' as const;},
 getCodeResend(){return null;},
 async code(_phone:string,code:string){await event('code');throw {text:code==='12345'?'SESSION_PASSWORD_NEEDED':'PHONE_CODE_INVALID'};},
 async password(password:string){await event('password');if(password!=='TESTONLY')throw {text:'PASSWORD_HASH_INVALID'};await saveTelegramSession(lease,'TESTONLY_AUTH');binding={accountRef:crypto.randomUUID(),accountEpoch:1};},
 async restore(){await event('restore');const saved=await loadTelegramSession();if(!saved)return false;lease=saved.lease;binding={accountRef:crypto.randomUUID(),accountEpoch:1};return true;},
 async forgetSavedAuthorization(){await clearSavedTelegramSession();},
 async logout(){await clearSavedTelegramSession();await close();},
 getAccountBinding(){return binding;},getAccountCooldown(){return null;},close,
 async prepareBotProviders(session:string,abort:AbortSignal){const old=await loadTelegramBotSelection(lease);await prepareDefaultBotSelection(binding!,session,old,{resolveIdentity,invalidateSession(){},saveSelection:rows=>saveTelegramBots(lease,rows,old.bots,old.revision)},abort,()=>!signal.aborted);const value=await loadTelegramBotSelection(lease);selected=value.bots;revision=value.revision;},
 createSources(session:string){return sources??=createSourcesDriver(binding!,session,{invalidateSession(){},async getDialogs(){throw Error('No source browsing in setup');}});},
 createBotProviders(session:string){return bots??=createBotProvidersDriver(binding!,session,{resolveIdentity,invalidateSession(){},async saveSelection(rows){const ok=await saveTelegramBots(lease,rows,selected,revision);if(ok){selected=rows;revision++;}return ok;}},undefined,selected);},
 };
}
