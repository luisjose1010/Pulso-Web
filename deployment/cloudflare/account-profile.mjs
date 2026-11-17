import {accountAuth} from './accounts.mjs';

const headers={'Cache-Control':'no-store','Pragma':'no-cache','Content-Type':'application/json','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const phone=value=>value===null||typeof value==='string'&&/^\+[1-9][0-9]{5,14}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
async function readJson(response,max=16384,signal){
 if(!response.body)throw Error('body');
 const reader=response.body.getReader(),parts=[];let length=0,stop;
 const cancelled=new Promise((_,reject)=>{stop=()=>{void reader.cancel().catch(()=>{});reject(Error('aborted'));};signal?.addEventListener('abort',stop,{once:true});});
 try{if(signal?.aborted)throw Error('aborted');while(true){const {done,value}=await Promise.race([reader.read(),cancelled]);if(done)break;length+=value.byteLength;if(length>max)throw Error('limit');parts.push(value);}}
 catch(error){void reader.cancel().catch(()=>{});throw error;}finally{signal?.removeEventListener('abort',stop);try{reader.releaseLock();}catch{/* Cancellation may still be settling. */}}
 const bytes=new Uint8Array(length);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function endpoint(env){
 const url=new URL(env.PULSO_NEON_DATA_API_URL);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!/^ep-[a-z0-9-]+\.apirest\.[a-z0-9.-]+\.neon\.(tech|build)$/.test(url.hostname)||url.pathname!=='/pulso/rest/v1')throw Error('config');
 return new URL(url.href+'/pulso_account_preferences');
}
/** The auth service issues the JWT; the Data API verifies it and enforces RLS.
 * Visitors cannot choose a subject, table, URL, authorization header or SQL. */
export function createAccountProfileRouter({auth=accountAuth,fetcher=fetch,timeoutMs=15000}={}){
 return async function accountProfile(request,env){
  const url=new URL(request.url);if(url.pathname!=='/api/account-profile')return null;
  const respond=(body,status=200,cookies=[])=>{const h=new Headers(headers);for(const cookie of cookies)h.append('Set-Cookie',cookie);return new Response(JSON.stringify(body),{status,headers:h});};
  if(!['GET','PUT'].includes(request.method))return respond({},405);
  if(url.search||request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.has('Origin')&&request.headers.get('Origin')!==url.origin||request.method==='PUT'&&request.headers.get('Origin')!==url.origin)return respond({},403);
  let target;try{target=endpoint(env);}catch{return respond({code:'PROFILE_UNAVAILABLE'},503);}
  const abort=new AbortController();let timer;
  try{
   const work=(async()=>{
   let input;
   if(request.method==='PUT'){
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')??''))return respond({},415);
    try{input=await readJson(request,1024,abort.signal);}catch{return respond({},400);}
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['accountId','telegramPhone','revision'].includes(k))||!uuid(input.accountId)||!phone(input.telegramPhone)||input.revision!==null&&(!Number.isSafeInteger(input.revision)||input.revision<1||input.revision>=2147483647))return respond({},400);
   }
   if(abort.signal.aborted)throw Error('expired');
   const h=new Headers();h.set('Origin',url.origin);const cookie=request.headers.get('Cookie');if(cookie)h.set('Cookie',cookie);
   const authResponse=await auth(new Request(url.origin+'/api/account-auth/token',{headers:h,signal:abort.signal}),env);
   if(!authResponse?.ok)return respond({code:authResponse?.status===401?'SIGN_IN_REQUIRED':'PROFILE_UNAVAILABLE'},authResponse?.status===401?401:503);
   const value=await readJson(authResponse,16384,abort.signal);const token=value?.token;
   if(typeof token!=='string'||token.length>16384)return respond({code:'SIGN_IN_REQUIRED'},401);
   let subject;try{const payload=token.split('.')[1];subject=JSON.parse(atob(payload.replaceAll('-','+').replaceAll('_','/'))).sub;}catch{return respond({code:'SIGN_IN_REQUIRED'},401);}
   if(!uuid(subject))return respond({code:'SIGN_IN_REQUIRED'},401);
   if(input&&input.accountId!==subject)return respond({code:'ACCOUNT_CHANGED'},409);
   target.searchParams.set('select','user_id,telegram_phone,revision');target.searchParams.set('user_id','eq.'+subject);
   const requestHeaders={'Authorization':'Bearer '+token,'Accept':'application/json'};
   let method='GET',body;
   if(input){
    requestHeaders['Content-Type']='application/json';
    requestHeaders.Prefer=input.revision===null?'resolution=ignore-duplicates,return=representation':'return=representation';
    if(input.revision===null){method='POST';target.searchParams.set('on_conflict','user_id');body=JSON.stringify({user_id:subject,telegram_phone:input.telegramPhone,revision:1});}
    else{method='PATCH';target.searchParams.set('revision','eq.'+input.revision);body=JSON.stringify({telegram_phone:input.telegramPhone,revision:input.revision+1,updated_at:new Date().toISOString()});}
   }
   if(method==='POST')target.searchParams.delete('user_id');
   if(abort.signal.aborted)throw Error('expired');
   const result=await fetcher(target,{method,headers:requestHeaders,body,redirect:'error',signal:abort.signal});
   if(!result.ok){void result.body?.cancel().catch(()=>{});return respond({code:result.status===401?'SIGN_IN_REQUIRED':'PROFILE_UNAVAILABLE'},result.status===401?401:503);}
   const rows=await readJson(result,2048,abort.signal);
   if(!Array.isArray(rows)||rows.length>1)throw Error('response');
   if(input&&!rows.length)return respond({code:'PROFILE_CHANGED'},409);
   const row=rows[0];if(row&&(row.user_id!==subject||!phone(row.telegram_phone)||!Number.isSafeInteger(row.revision)||row.revision<1))throw Error('response');
   return respond({accountId:subject,telegramPhone:row?.telegram_phone??null,revision:row?.revision??null},200,authResponse.headers.getSetCookie());
   })();
   return await Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>{abort.abort();resolve(respond({code:'PROFILE_UNAVAILABLE'},503));},timeoutMs);})]);
  }catch{return respond({code:'PROFILE_UNAVAILABLE'},503);}finally{clearTimeout(timer);}
 };
}
export const accountProfile=createAccountProfileRouter();
