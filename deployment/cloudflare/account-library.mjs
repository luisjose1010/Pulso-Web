import {accountAuth} from './accounts.mjs';
import {validateAccountLibrary,libraryUuid,LIBRARY_LIMITS,emptyLibrary} from '../../src/accounts/library-document.mjs';
import {readJson,dataApiEndpoint} from './account-profile.mjs';
const headers={'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export function createAccountLibraryRouter({auth=accountAuth,fetcher=fetch,timeoutMs=15000}={}){
 return async(request,env)=>{
  const url=new URL(request.url);if(url.pathname!=='/api/account-library')return null;
  const respond=(body,status=200,cookies=[])=>{const h=new Headers(headers);for(const c of cookies)h.append('Set-Cookie',c);return new Response(JSON.stringify(body),{status,headers:h});};
  if(!['GET','PUT'].includes(request.method))return respond({},405);
  if(url.search||request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.has('Origin')&&request.headers.get('Origin')!==url.origin||request.method==='PUT'&&request.headers.get('Origin')!==url.origin)return respond({},403);
  const abort=new AbortController();let timer;
  try{return await Promise.race([(async()=>{
   const target=dataApiEndpoint(env,'pulso_account_library');let input;
   if(request.method==='PUT'){
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')??''))return respond({},415);
    try{input=await readJson(request,LIBRARY_LIMITS.bytes+1024,abort.signal);
     if(!input||Object.keys(input).length!==3||!libraryUuid(input.accountId)||input.revision!==null&&(!Number.isSafeInteger(input.revision)||input.revision<1||input.revision>=2147483647))throw Error('input');input.document=validateAccountLibrary(input.document);
    }catch{return respond({code:'LIBRARY_INVALID'},400);}
   }
   const h=new Headers({Origin:url.origin});const cookie=request.headers.get('Cookie');if(cookie)h.set('Cookie',cookie);
   const authorization=await auth(new Request(url.origin+'/api/account-auth/token',{headers:h,signal:abort.signal}),env);
   if(!authorization?.ok)return respond({code:authorization?.status===401?'SIGN_IN_REQUIRED':'LIBRARY_UNAVAILABLE'},authorization?.status===401?401:503);
   const value=await readJson(authorization,16384,abort.signal),token=value?.token;let subject;
   try{if(typeof token!=='string'||token.length>16384)throw Error('token');subject=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).sub;}catch{return respond({code:'SIGN_IN_REQUIRED'},401);}
   if(!libraryUuid(subject))return respond({code:'SIGN_IN_REQUIRED'},401);
   if(input?.accountId&&input.accountId!==subject)return respond({code:'ACCOUNT_CHANGED'},409);
   target.searchParams.set('select','user_id,document,revision');target.searchParams.set('user_id','eq.'+subject);
   const requestHeaders={Authorization:'Bearer '+token,Accept:'application/json'};let method='GET',body;
   if(input){requestHeaders['Content-Type']='application/json';requestHeaders.Prefer=input.revision===null?'resolution=ignore-duplicates,return=representation':'return=representation';
    if(input.revision===null){method='POST';target.searchParams.delete('user_id');target.searchParams.set('on_conflict','user_id');body=JSON.stringify({user_id:subject,document:input.document,revision:1});}
    else{method='PATCH';target.searchParams.set('revision','eq.'+input.revision);body=JSON.stringify({document:input.document,revision:input.revision+1,updated_at:new Date().toISOString()});}
   }
   if(abort.signal.aborted)throw Error('expired');
   const result=await fetcher(target,{method,body,headers:requestHeaders,signal:abort.signal,redirect:'error'});
   if(!result.ok){void result.body?.cancel().catch(()=>{});return respond({code:result.status===401?'SIGN_IN_REQUIRED':'LIBRARY_UNAVAILABLE'},result.status===401?401:503);}
   const rows=await readJson(result,LIBRARY_LIMITS.bytes+16384,abort.signal);if(!Array.isArray(rows)||rows.length>1)throw Error('response');
   if(input&&!rows.length)return respond({code:'LIBRARY_CHANGED'},409);
   const row=rows[0];if(row&&(row.user_id!==subject||!Number.isSafeInteger(row.revision)||row.revision<1))throw Error('response');
   return respond({accountId:subject,revision:row?.revision??null,document:row?validateAccountLibrary(row.document):emptyLibrary()},200,authorization.headers.getSetCookie());
  })(),new Promise(resolve=>{timer=setTimeout(()=>{abort.abort();resolve(respond({code:'LIBRARY_UNAVAILABLE'},503));},timeoutMs);})]);}
  catch{return respond({code:'LIBRARY_UNAVAILABLE'},503);}finally{clearTimeout(timer);}
 };
}
export const accountLibrary=createAccountLibraryRouter();
