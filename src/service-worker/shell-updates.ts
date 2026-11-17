import {cachedShellResponse} from './shell-response';

export function appDocumentPath(path:string):boolean {
 return /^\/(?:index\.html|try(?:\.html)?|listen(?:\.html)?|web(?:\.html)?)?$/.test(path)||/^\/releases\/[a-f0-9]{16}(?:\.html)?$/.test(path);
}

/** Use a document from this complete shell, including a canonical entry when a
 * home-screen shortcut points at a different release. Never scan media caches. */
export async function cachedAppDocument(cache:Cache,path:string,documents:readonly string[]=[]):Promise<Response|undefined>{
 if(!appDocumentPath(path))return undefined;
 for(const key of [...new Set([path,'/index.html','/',...documents.filter(appDocumentPath)])]){
  const response=await cache.match(key,{ignoreVary:true});
  if(response?.ok&&response.headers.get('content-type')?.startsWith('text/html'))return cachedShellResponse(response);
 }
 return undefined;
}
/** The last resort is a real, same-origin document, not a rejected respondWith.
 * It does not access or clear storage, and its retry link requires a user action. */
function shellRecoveryDocument():Response{
 return new Response('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>Abrir Pulso</title><main><h1>No se pudo abrir Pulso</h1><p>No se pudo cargar la aplicación y su copia local no está disponible. Comprueba la conexión y vuelve a intentarlo.</p><p>Este intento no ha borrado tu sesión ni tus descargas.</p><p><a href="/">Volver a intentar abrir Pulso</a></p></main></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
async function cachedDocumentWithin(cached:()=>Promise<Response|undefined>,timeoutMs:number):Promise<Response|undefined>{
 let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
 const pending=Promise.resolve().then(cached).then(response=>{if(expired&&response)void response.body?.cancel().catch(()=>{});return response;},()=>undefined);
 try{return await Promise.race([pending,new Promise<undefined>(resolve=>{timer=setTimeout(()=>resolve(undefined),Math.max(1,Math.min(timeoutMs,2000)));})]);}
 finally{expired=true;clearTimeout(timer);}
}

/** All known app entry URLs open the current root document. Fetch it as a
 * same-origin GET, without inheriting navigation's manual redirect mode or
 * following another host. The caller's address is preserved by respondWith. */
export async function freshShellDocument(request:Request,cached:()=>Promise<Response|undefined>,fetcher:typeof fetch=fetch,timeoutMs=5000):Promise<Response>{
 const controller=new AbortController(),abort=()=>controller.abort();
 let rejectStop!:(error:Error)=>void;const stopped=new Promise<never>((_,reject)=>{rejectStop=reject;});
 const onStop=()=>rejectStop(new DOMException('Consulta cancelada.','AbortError'));
 controller.signal.addEventListener('abort',onStop,{once:true});
 request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
 const timer=setTimeout(abort,timeoutMs);
 const network=Promise.resolve().then(()=>fetcher(new URL('/',request.url).href,{method:'GET',mode:'same-origin',credentials:'same-origin',headers:{Accept:'text/html'},referrerPolicy:'no-referrer',cache:'no-store',redirect:'error',signal:controller.signal})).then(response=>{
  if(controller.signal.aborted){void response.body?.cancel().catch(()=>{});throw new DOMException('Consulta cancelada.','AbortError');}
  if(!response.ok||!response.headers.get('content-type')?.startsWith('text/html')||response.url&&new URL(response.url).origin!==new URL(request.url).origin){void response.body?.cancel().catch(()=>{});throw Error('shell-network');}
  return cachedShellResponse(response);
 });
 try{return await Promise.race([network,stopped]);}
 catch(error){
  if(request.signal.aborted)throw error;
  try{const fallback=await cachedDocumentWithin(cached,timeoutMs);if(fallback&&!request.signal.aborted)return cachedShellResponse(fallback);}catch{/* The browser may have purged or denied the shell cache. */}
  if(request.signal.aborted)throw error;
  return shellRecoveryDocument();
 }finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',onStop);}
}

async function boundedDocument(response:Response):Promise<string|null>{
 if(!response.ok||!response.headers.get('content-type')?.startsWith('text/html')||!response.body||Number(response.headers.get('content-length'))>65536)return null;
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0,done=false;
 try{for(;;){const item=await reader.read();if(item.done){done=true;break;}size+=item.value.length;if(size>65536)return null;parts.push(item.value);}
  const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }catch{return null;}finally{if(!done)void reader.cancel().catch(()=>{});reader.releaseLock();}
}

/** A waiting worker cannot replace an older worker's cache-first fetch handler.
 * Give its public HTML entries a small, CSP-hashed launcher. It runs only on the
 * next navigation, never in an already open player. Offline restores that exact
 * old document, whose hashed assets remain untouched in its original cache. */
export async function legacyShellLauncher(response:Response):Promise<Response|null>{
 const policy=response.headers.get('content-security-policy');
 if(!policy||!/(?:^|;)\s*script-src 'self'(?=;|$)/.test(policy))return null;
 const html=await boundedDocument(response);
 if(!html||!/<div\b[^>]*\bid=["']root["']/.test(html)||!/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']\/assets\/[A-Za-z0-9_.-]+\.js["']/.test(html))return null;
 const original=JSON.stringify(html).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
 const script=`(()=>{const original=${original};const restore=()=>{const parsed=new DOMParser().parseFromString(original,'text/html');document.replaceChild(document.importNode(parsed.documentElement,true),document.documentElement);for(const inert of document.querySelectorAll('script[src]')){const script=document.createElement('script');for(const attr of inert.attributes)script.setAttribute(attr.name,attr.value);inert.replaceWith(script);}};if(navigator.onLine===false){restore();return;}const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);void(async()=>{try{const response=await fetch('/latest.json',{cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal});if(!response.ok||!response.body)throw Error('latest');const reader=response.body.getReader();let text='',size=0;const decoder=new TextDecoder('utf-8',{fatal:true});try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>1024)throw Error('size');text+=decoder.decode(item.value,{stream:true});}text+=decoder.decode();}finally{void reader.cancel().catch(()=>{});reader.releaseLock();}const value=JSON.parse(text);if(value?.version!==1||typeof value.entry!=='string'||!/^\\/releases\\/[a-f0-9]{16}\\.html$/.test(value.entry))throw Error('entry');if([value.entry,value.entry.slice(0,-5)].includes(location.pathname)){restore();return;}location.replace(value.entry);}catch{restore();}finally{clearTimeout(timer);}})();})();`;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(script));
 const hash=btoa(String.fromCharCode(...new Uint8Array(digest))),headers=new Headers(response.headers);
 headers.set('Content-Security-Policy',policy.replace(/((?:^|;)\s*script-src 'self')(?=;|$)/,`$1 'sha256-${hash}'`));
 headers.set('Content-Type','text/html; charset=utf-8');headers.set('Cache-Control','no-store');
 for(const key of ['content-length','content-encoding','etag','last-modified'])headers.delete(key);
 return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pulso</title><p>Abriendo Pulso…</p><script>${script}</script></html>`,{headers});
}

export async function migrateLegacyShells(storage:CacheStorage,current:string):Promise<void>{
 for(const name of await storage.keys()){
  if(name===current||!/^pulso-shell-[a-f0-9]{16}(?:-[a-f0-9]{16})?$/.test(name))continue;
  const cache=await storage.open(name);
  for(const key of await cache.keys()){
   if(!appDocumentPath(new URL(key.url).pathname))continue;
   const original=await cache.match(key);if(!original)continue;
   const launcher=await legacyShellLauncher(original);if(launcher)await cache.put(key,launcher);
  }
 }
}
