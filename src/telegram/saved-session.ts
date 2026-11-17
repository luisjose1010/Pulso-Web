/** Dedicated authorization vault. SDK peer and message storage remains in memory. */
import {dataArray,dataRecord,positive,sourceName,utf8Bytes} from './sources-protocol';
import {parseBotUsername} from './bot-providers-protocol';
const DB='pulso-web-telegram-session-v1', STORE='authorization', SECRET='session', EPOCH='epoch', BOTS='bot-selection-v1', BOTS_REV='bot-selection-revision-v1';
export interface SavedBot {username:string;label:string;id:number;low:number;high:number}
export function parseSavedBots(value:unknown):SavedBot[]|null {
 try {const root=dataRecord(value,['version','bots']);if(!root||root.version!==1)return null;const a=dataArray(root.bots,5);if(!a)return null;const out:SavedBot[]=[];for(const item of a){const r=dataRecord(item,['username','label','id','low','high']);if(!r||parseBotUsername(r.username)!==r.username||typeof r.label!=='string'||r.label.length>320||utf8Bytes(r.label)>640||sourceName(r.label)!==r.label||!positive(r.id)||typeof r.low!=='number'||!Number.isInteger(r.low)||r.low< -2147483648||r.low>2147483647||typeof r.high!=='number'||!Number.isInteger(r.high)||r.high< -2147483648||r.high>2147483647||r.low===0&&r.high===0)return null;out.push({username:r.username as string,label:r.label,id:r.id,low:r.low,high:r.high});}return new Set(out.map(x=>x.id)).size===out.length&&new Set(out.map(x=>x.username)).size===out.length?out:null;}catch{return null;}
}
const failure=()=>Error('session-storage');
const epochValue=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
function open(create:boolean):Promise<IDBDatabase|null>{
 return new Promise((resolve,reject)=>{
  let absent=false,settled=false,request:IDBOpenDBRequest;
  try{request=indexedDB.open(DB,1);}catch{reject(failure());return;}
  request.onupgradeneeded=()=>{if(settled||!create){absent=!create;request.transaction?.abort();return;}request.result.createObjectStore(STORE);};
  request.onerror=()=>{settled=true;if(absent)resolve(null);else reject(failure());};
  request.onblocked=()=>{settled=true;reject(failure());};
  request.onsuccess=()=>{const db=request.result;if(settled){db.close();return;}settled=true;db.onversionchange=()=>db.close();resolve(db);};
 });
}
async function transaction<T>(create:boolean,mode:IDBTransactionMode,work:(store:IDBObjectStore,set:(value:T)=>void)=>void,empty:T):Promise<T>{
 const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),15000);
 try{
  const run=()=>transactionUnlocked(create,mode,work,empty,abort.signal);
  if(mode==='readwrite'&&typeof navigator!=='undefined'&&navigator.locks)return await navigator.locks.request('pulso-web-telegram-session-v1',{signal:abort.signal},run);
  return await run();
 }catch{throw failure();}finally{clearTimeout(timer);}
}
async function transactionUnlocked<T>(create:boolean,mode:IDBTransactionMode,work:(store:IDBObjectStore,set:(value:T)=>void)=>void,empty:T,signal:AbortSignal):Promise<T>{
 const opening=open(create);let db:IDBDatabase|null;
 try{db=await new Promise<IDBDatabase|null>((resolve,reject)=>{const cancel=()=>reject(failure());signal.addEventListener('abort',cancel,{once:true});if(signal.aborted){cancel();return;}opening.then(value=>{signal.removeEventListener('abort',cancel);if(signal.aborted){value?.close();return;}resolve(value);},error=>{signal.removeEventListener('abort',cancel);reject(error);});});}catch(error){void opening.then(value=>value?.close(),()=>{});throw error;}
 if(!db)return empty;
 return new Promise((resolve,reject)=>{let result=empty,tx:IDBTransaction;
  try{tx=db!.transaction(STORE,mode);}catch{db!.close();reject(failure());return;}
  const cancel=()=>{try{tx.abort();}catch{/* terminal transaction */}};
  signal.addEventListener('abort',cancel,{once:true});
  const finish=()=>{signal.removeEventListener('abort',cancel);db!.close();};
  tx.oncomplete=()=>{finish();resolve(result);};tx.onabort=()=>{finish();reject(failure());};
  if(signal.aborted){cancel();return;}
  try{work(tx.objectStore(STORE),value=>{result=value;});}catch{try{tx.abort();}catch{finish();reject(failure());}}
 });
}
function read(store:IDBObjectStore,key:string,consume:(value:unknown)=>void):void{
 const request=store.get(key);request.onsuccess=()=>{try{consume(request.result);}catch{store.transaction.abort();}};
}
export async function hasSavedTelegramSession():Promise<boolean>{
 return transaction(false,'readonly',(store,set)=>{const r=store.getKey(SECRET);r.onsuccess=()=>set(r.result!==undefined);},false);
}
/** Clears and advances the epoch atomically, invalidating all previously issued leases. */
export async function clearSavedTelegramSession():Promise<void>{
 await transaction(true,'readwrite',store=>{store.put(crypto.randomUUID(),EPOCH);store.delete(SECRET);store.delete(BOTS);store.delete(BOTS_REV);},undefined);
}
export async function sessionLease():Promise<string>{
 return transaction(true,'readwrite',(store,set)=>{read(store,EPOCH,value=>{if(value!==undefined&&!epochValue(value))throw failure();const epoch=crypto.randomUUID();store.put(epoch,EPOCH);store.delete(SECRET);store.delete(BOTS);store.delete(BOTS_REV);set(epoch);});},'');
}
export async function telegramSessionLeaseCurrent(lease:string):Promise<boolean>{
 if(!epochValue(lease))return false;
 return transaction(false,'readonly',(store,set)=>{read(store,EPOCH,value=>set(value===lease));},false);
}
export async function saveTelegramSession(lease:string,value:string):Promise<boolean>{
 if(!epochValue(lease)||typeof value!=='string'||!value.length||value.length>4096)throw failure();
 return transaction(true,'readwrite',(store,set)=>{read(store,EPOCH,epoch=>{if(epoch===lease){store.put(value,SECRET);set(true);}});},false);
}
export async function loadTelegramSession():Promise<{lease:string;value:string}|null>{
 return transaction<{lease:string;value:string}|null>(false,'readonly',(store,set)=>{read(store,EPOCH,epoch=>read(store,SECRET,value=>{if(value===undefined)return;if(!epochValue(epoch)||typeof value!=='string'||!value.length||value.length>4096)throw failure();set({lease:epoch,value});}));},null);
}
export async function clearTelegramSessionLease(lease:string):Promise<void>{
 await transaction(true,'readwrite',(store)=>{read(store,EPOCH,value=>{if(value===lease){store.put(crypto.randomUUID(),EPOCH);store.delete(SECRET);store.delete(BOTS);store.delete(BOTS_REV);}});},undefined);
}

/** Selection shares the exact authorization lease and is never returned to the main thread. */
export async function loadTelegramBots(lease:string):Promise<SavedBot[]> {
 return (await loadTelegramBotSelection(lease)).bots;
}
export async function loadTelegramBotSelection(lease:string):Promise<{bots:SavedBot[];revision:number;initialized:boolean}> {
 if(!epochValue(lease))throw failure();
 const selection=await transaction<{bots:SavedBot[];revision:number;initialized:boolean}|null>(false,'readonly',(store,set)=>{read(store,EPOCH,epoch=>read(store,SECRET,secret=>read(store,BOTS,value=>read(store,BOTS_REV,storedRevision=>{
  if(epoch!==lease||typeof secret!=='string'||!secret)throw failure();
  const bots=value===undefined?[]:parseSavedBots(value),revision=storedRevision===undefined?0:storedRevision;
  if(!bots||typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<0)throw failure();set({bots,revision,initialized:value!==undefined||revision!==0});
 }))));},null);
 if(!selection)throw failure();return selection;
}
/** Compare the exact previously read selection in the same transaction as the write.
 * Two live workers sharing an authorization cannot overwrite each other's newer choice. */
export async function saveTelegramBots(lease:string,bots:SavedBot[],expected:SavedBot[]=[],expectedRevision=0):Promise<boolean> {
 const next=parseSavedBots({version:1,bots}),previous=parseSavedBots({version:1,bots:expected});
 if(!epochValue(lease)||!next||!previous||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||expectedRevision===Number.MAX_SAFE_INTEGER)throw failure();
 return transaction(true,'readwrite',(store,set)=>{read(store,EPOCH,epoch=>read(store,SECRET,secret=>read(store,BOTS,stored=>read(store,BOTS_REV,storedRevision=>{
  if(epoch!==lease||typeof secret!=='string'||!secret)return;
  const actual=stored===undefined?[]:parseSavedBots(stored);if(!actual)throw failure();
  const revision=storedRevision===undefined?0:storedRevision;
  if(typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<0)throw failure();
  if(revision!==expectedRevision||JSON.stringify(actual)!==JSON.stringify(previous))return;
  store.put({version:1,bots:next},BOTS);store.put(revision+1,BOTS_REV);set(true);
 }))));},false);
}
