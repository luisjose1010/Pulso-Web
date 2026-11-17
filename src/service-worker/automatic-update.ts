const entryPattern=/^\/releases\/[a-f0-9]{16}\.html$/;
const bundlePattern=/^\/assets\/[A-Za-z0-9_.-]+\.js$/;
export function updateEntry(value:unknown):string|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 return v.version===1&&typeof v.entry==='string'&&entryPattern.test(v.entry)?v.entry:null;
}
export function entryBundle(html:string):string|null {
 const scripts=html.match(/<script\b[^>]{0,4096}>/gi)??[];
 const paths=scripts.filter(tag=>/\btype\s*=\s*["']module["']/i.test(tag)).map(tag=>tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]);
 return paths.length===1&&typeof paths[0]==='string'&&bundlePattern.test(paths[0])?paths[0]:null;
}
async function text(response:Response,max:number,signal:AbortSignal):Promise<string>{
 if(!response.ok||!response.body||Number(response.headers.get('content-length'))>max){void response.body?.cancel().catch(()=>{});throw Error('update-response');}
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0,done=false;
 const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{
  for(;;){if(signal.aborted)throw Error('aborted');const r=await reader.read();if(signal.aborted)throw Error('aborted');if(r.done){done=true;break;}size+=r.value.length;if(size>max)throw Error('update-size');parts.push(r.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }finally{signal.removeEventListener('abort',cancel);if(!done)cancel();try{reader.releaseLock();}catch{/* Original read may still settle. */}}
}
export type UpdateState='checking'|'current'|'available'|'unavailable';
interface UpdateHost {
 origin:string;bundle:string;fetcher:typeof fetch;
 ready:(manual:boolean)=>boolean;prepare:(manual:boolean)=>Promise<boolean>;
 enter:()=>()=>void;navigate:(entry:string)=>void;reload:()=>void;pending:(value:boolean)=>void;
 state?:(value:UpdateState)=>void;manualPending?:(value:boolean)=>void;
 now?:()=>number;quietMs?:number;timeoutMs?:number;
}
/** New page/hashed assets, without skipWaiting or changing another tab's reader.
 * The installed worker keeps its ordinary lifetime until its clients close. */
export function createAutomaticUpdater(host:UpdateHost){
 const now=host.now??Date.now,quiet=host.quietMs??3000;
 let candidate:{entry:string;bundle:string}|null=null,idleAt:number|null=null,lastEntry:string|null=null,manual=false;
 let stopped=false,checking=false,applying=false,navigating=false;
 let abort:AbortController|null=null,watchdog:ReturnType<typeof setTimeout>|undefined,release:(()=>void)|null=null;
 const ready=()=>{try{return !stopped&&host.ready(manual);}catch{return false;}};
 const reset=()=>{idleAt=null;};
 function stop(){stopped=true;abort?.abort();clearTimeout(watchdog);release?.();release=null;}
 async function check(){
  if(stopped||checking||applying||navigating)return;
  checking=true;const controller=new AbortController();abort=controller;
  host.state?.('checking');
  const timer=setTimeout(()=>controller.abort(),host.timeoutMs??10000);
  try{
   const options:RequestInit={signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'};
   const pointer=await host.fetcher(new URL('/latest.json',host.origin),{...options,redirect:'error'});
   const entry=updateEntry(JSON.parse(await text(pointer,1024,controller.signal)));if(!entry)throw Error('update-pointer');if(controller.signal.aborted||stopped)return;
   // Entries are immutable. Poll only the small static pointer after this entry
   // was inspected, rather than invoking the HTML Worker every minute.
   if(entry===lastEntry){host.state?.(candidate?'available':'current');return;}
   // Fetch as inert text; Cloudflare may canonicalize .html to an extensionless
   // URL. A redirect is acceptable only within this exact same-origin entry.
   const response=await host.fetcher(new URL(entry,host.origin),{...options,redirect:'follow'});
   if(response.url){const u=new URL(response.url);if(u.origin!==host.origin||![entry,entry.slice(0,-5)].includes(u.pathname)||u.search||u.hash)throw Error('update-entry');}
   const bundle=entryBundle(await text(response,65536,controller.signal));if(!bundle)throw Error('update-bundle');if(controller.signal.aborted||stopped)return;
   lastEntry=entry;
   if(bundle===host.bundle){candidate=null;reset();host.pending(false);host.state?.('current');return;}
   if(candidate?.entry!==entry){candidate={entry,bundle};reset();host.pending(true);}
   host.state?.('available');
  }catch{if(!stopped)host.state?.('unavailable');/* Offline/partial publication leaves the current app usable. */}
  finally{clearTimeout(timer);if(abort===controller)abort=null;checking=false;}
 }
 async function tick(){
  if(!candidate&&!manual||stopped||checking||applying||navigating)return;
  if(!ready()){reset();return;}
  if(!manual){if(idleAt===null){idleAt=now();return;}if(now()-idleAt<quiet)return;}
  const selected=candidate;applying=true;
  try{
   if(!await host.prepare(manual)||selected!==candidate||!ready()){reset();return;}
   // The final synchronous guard and admission fence precede navigation. A new
   // Play or write cannot start while the document is leaving.
   release=host.enter();navigating=true;
   watchdog=setTimeout(failedNavigation,15000);
   const target=selected?.entry??lastEntry;
   if(target)host.navigate(target);else host.reload();
  }catch{clearTimeout(watchdog);failedNavigation();}
  finally{applying=false;}
 }
 function failedNavigation(){release?.();release=null;navigating=false;manual=false;candidate=null;lastEntry=null;reset();host.manualPending?.(false);host.pending(false);host.state?.('unavailable');}
 function reload(){if(stopped||navigating||manual)return;manual=true;host.manualPending?.(true);reset();void check();}
 return {check,tick,reset,stop,reload};
}
export function startAutomaticUpdates(host:Omit<UpdateHost,'origin'|'bundle'|'fetcher'|'navigate'|'reload'>):{reload:()=>void;dispose:()=>void} {
 const script=document.querySelector<HTMLScriptElement>('script[type="module"][src]');
 if(!script)return {reload:()=>location.reload(),dispose:()=>{}};
 const bundle=new URL(script.src).pathname;if(!bundlePattern.test(bundle))return {reload:()=>location.reload(),dispose:()=>{}}; // Development is not a deployed release.
 const core=createAutomaticUpdater({...host,origin:location.origin,bundle,fetcher:(...args)=>fetch(...args),navigate:entry=>location.replace(entry),reload:()=>location.reload()});
 let lastCheck=-Infinity;
 const check=()=>{if(document.visibilityState!=='visible'||navigator.onLine===false||Date.now()-lastCheck<15000)return;lastCheck=Date.now();void core.check();};
 const tick=()=>{if(document.visibilityState!=='visible'||navigator.onLine===false){core.reset();return;}void core.tick();};
 const initial=setTimeout(check,5000),poll=setInterval(check,60000),idle=setInterval(tick,1000);
 const visible=()=>{core.reset();check();};
 const interaction=()=>core.reset();
 const pagehide=(event:PageTransitionEvent)=>{if(!event.persisted)dispose();else core.reset();};
 function dispose(){clearTimeout(initial);clearInterval(poll);clearInterval(idle);core.stop();document.removeEventListener('visibilitychange',visible);document.removeEventListener('pointerdown',interaction,true);document.removeEventListener('keydown',interaction,true);window.removeEventListener('focus',check);window.removeEventListener('online',check);window.removeEventListener('pagehide',pagehide);window.removeEventListener('pageshow',visible);}
 document.addEventListener('visibilitychange',visible);document.addEventListener('pointerdown',interaction,true);document.addEventListener('keydown',interaction,true);window.addEventListener('focus',check);window.addEventListener('online',check);window.addEventListener('pagehide',pagehide);window.addEventListener('pageshow',visible);
 return {reload:core.reload,dispose};
}
