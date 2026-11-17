import type {AccountUser} from './account-controller';

const cacheKey='pulso-account:confirmed-profile:v1',noticeKey='pulso-account:changed:v1';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
/** A local offline hint, never a credential or authority for an HTTP request. */
export function offlineAccountCache(store:Store,now=Date.now){
 return {
  save(user:AccountUser|null){try{if(!user){store.removeItem(cacheKey);return;}if(!Number.isFinite(user.expiresAt)||user.expiresAt!<=now()){store.removeItem(cacheKey);return;}store.setItem(cacheKey,JSON.stringify({version:1,user,until:Math.min(user.expiresAt!,now()+7*86400000)}));}catch{/* Browser storage may be unavailable. */}},
  read():AccountUser|null{try{const raw=store.getItem(cacheKey);if(!raw||raw.length>2048)return null;const value=JSON.parse(raw),u=value.user;if(value.version!==1||!Number.isFinite(value.until)||value.until<=now()||value.until>now()+7*86400000||!u||typeof u.id!=='string'||!u.id||u.id.length>100||typeof u.name!=='string'||u.name.length>200||typeof u.email!=='string'||u.email.length>254||typeof u.verified!=='boolean')return null;return {id:u.id,name:u.name,email:u.email,verified:u.verified,expiresAt:value.until};}catch{return null;}},
 };
}
export function accountNotice(value:unknown):value is {version:1;type:'changed';source:string}{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;return Object.keys(v).length===3&&v.version===1&&v.type==='changed'&&typeof v.source==='string'&&v.source.length>0&&v.source.length<=100;
}
export function coordinateAccountSessions(controller:{invalidate():void;load():Promise<void>},host:{window:Window;document:Document;channel:BroadcastChannel|null;store:Store|null}){
 let live=true,lastResume=0;const seen=new Set<string>();
 const remember=(id:string)=>{seen.add(id);if(seen.size>128)seen.delete(seen.values().next().value!);};
 const receive=(value:unknown)=>{if(live&&accountNotice(value)&&!seen.has(value.source)){remember(value.source);controller.invalidate();}};
 const message=(event:MessageEvent)=>receive(event.data);
 const storage=(event:StorageEvent)=>{if(event.key!==noticeKey||!event.newValue)return;try{receive(JSON.parse(event.newValue));}catch{/* Not an account hint. */}};
 const resume=()=>{if(!live||host.document.visibilityState==='hidden'||Date.now()-lastResume<1500)return;lastResume=Date.now();void controller.load();};
 host.channel?.addEventListener('message',message);host.window.addEventListener('storage',storage);host.window.addEventListener('focus',resume);host.window.addEventListener('pageshow',resume);host.window.addEventListener('online',resume);
 // Visibility is only a session check, never playback or download permission.
 host.document.addEventListener('visibilitychange',resume);
 return {
  notify(){if(!live)return;const notice={version:1,type:'changed',source:crypto.randomUUID()};remember(notice.source);try{host.channel?.postMessage(notice);}catch{/* Storage/focus fallback. */}try{host.store?.setItem(noticeKey,JSON.stringify(notice));host.store?.removeItem(noticeKey);}catch{/* Focus still revalidates. */}},
  dispose(){live=false;host.channel?.removeEventListener('message',message);host.channel?.close();host.window.removeEventListener('storage',storage);host.window.removeEventListener('focus',resume);host.window.removeEventListener('pageshow',resume);host.window.removeEventListener('online',resume);host.document.removeEventListener('visibilitychange',resume);},
 };
}
