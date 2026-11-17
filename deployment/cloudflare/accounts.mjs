import {handleAuthProxyRequest,resolveNeonAuthLogging} from '@neon/auth/server';

const mount='/api/account-auth/';
const methods=new Map([
 ['get-session','GET'],['token','GET'],['sign-in/email','POST'],['sign-up/email','POST'],
 ['sign-in/social','POST'],['sign-out','POST'],['request-password-reset','POST'],
 ['reset-password','POST'],['email-otp/verify-email','POST'],['email-otp/send-verification-otp','POST'],
 ['email-otp/request-password-reset','POST'],['email-otp/reset-password','POST'],
]);
const policy="default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
const safeHeaders={'Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':policy};
function json(body,status=200){return Response.json(body,{status,headers:safeHeaders});}
function enabled(env){
 try{const u=new URL(env.PULSO_NEON_AUTH_URL);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^ep-[a-z0-9-]+\.neonauth\.[a-z0-9.-]+\.neon\.(?:build|tech)$/.test(u.hostname)&&/^\/[a-z0-9_-]+\/auth$/.test(u.pathname)&&typeof env.PULSO_AUTH_COOKIE_SECRET==='string'&&env.PULSO_AUTH_COOKIE_SECRET.length>=32;}
 catch{return false;}
}
async function bounded(stream,max){if(!stream)return '';const reader=stream.getReader(),chunks=[];let size=0,timer;try{const read=async()=>{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw Error('limit');chunks.push(value);}};await Promise.race([read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),5000);})]);}catch(error){void reader.cancel().catch(()=>{});throw error;}finally{clearTimeout(timer);reader.releaseLock();}const out=new Uint8Array(size);let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return new TextDecoder('utf-8',{fatal:true}).decode(out);}
function validEmail(v){return typeof v==='string'&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
function password(v){return typeof v==='string'&&v.length>=8&&v.length<=128;}
function payload(path,v,origin){
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('body');
 const email=()=>{if(!validEmail(v.email))throw Error('email');return v.email;};
 const pass=()=>{if(!password(v.password))throw Error('password');return v.password;};
 const callback=origin+'/?pulso-account=callback';
 switch(path){
  case 'sign-in/email':return {email:email(),password:pass(),rememberMe:true};
  case 'sign-up/email':if(typeof v.name!=='string'||!v.name.trim()||v.name.length>80)throw Error('name');return {name:v.name.trim(),email:email(),password:pass(),callbackURL:callback};
  case 'sign-in/social':if(v.provider!=='google')throw Error('provider');return {provider:'google',callbackURL:callback,errorCallbackURL:callback};
  case 'sign-out':return {};
  case 'request-password-reset':return {email:email(),redirectTo:origin+'/?pulso-account=reset'};
  case 'email-otp/request-password-reset':return {email:email()};
  case 'email-otp/reset-password':if(typeof v.otp!=='string'||!/^\d{6}$/.test(v.otp)||!password(v.password))throw Error('reset');return {email:email(),otp:v.otp,password:v.password};
  case 'reset-password':if(typeof v.token!=='string'||!v.token||v.token.length>512||!password(v.newPassword))throw Error('reset');return {token:v.token,newPassword:v.newPassword};
  case 'email-otp/verify-email':if(typeof v.otp!=='string'||!/^\d{6}$/.test(v.otp))throw Error('otp');return {email:email(),otp:v.otp};
  case 'email-otp/send-verification-otp':if(v.type!=='email-verification')throw Error('otp');return {email:email(),type:'email-verification'};
  default:throw Error('path');
 }
}
/** The SDK owns Neon OAuth/cookie semantics. This boundary exposes only the
 * account flows used by Pulso, never admin, SQL, arbitrary URLs or visitor logs. */
export function createAccountAuthRouter({proxy=handleAuthProxyRequest,timeoutMs=15000}={}){
 return async function accountAuth(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/account-config.json')return ['GET','HEAD'].includes(request.method)?json({version:1,enabled:enabled(env),google:enabled(env)&&env.PULSO_AUTH_GOOGLE_ENABLED==='true'}):json({},405);
  if(!path.startsWith(mount))return null;
  const operation=path.slice(mount.length),method=methods.get(operation);
  if(!method)return json({},404);
  if(request.method!==method)return json({},405);
  const origin=request.headers.get('Origin'),site=request.headers.get('Sec-Fetch-Site');
  if(origin&&origin!==url.origin||site==='cross-site'||method==='POST'&&origin!==url.origin)return json({},403);
  if(!enabled(env))return json({code:'DISABLED'},503);
  if(operation==='sign-in/social'&&env.PULSO_AUTH_GOOGLE_ENABLED!=='true')return json({code:'DISABLED'},503);
  const target=new URL(url.origin+mount+operation);
  for(const [name,value] of url.searchParams){if(operation!=='get-session'||name!=='neon_auth_session_verifier'||value.length>512||!value)return json({},400);target.searchParams.set(name,value);}
  // Revalidate at Neon, including OAuth exchanges while an older account cookie
  // still exists. A cached profile must not swallow the new one-use verifier.
  if(operation==='get-session')target.searchParams.set('disableCookieCache','true');
  const headers=new Headers();
  headers.set('Origin',url.origin);
  // No Authorization, Referer, IP, account identity or arbitrary visitor headers.
  const cookie=request.headers.get('Cookie');if(cookie){if(cookie.length>16384)return json({},431);headers.set('Cookie',cookie);}
  let body;
  if(method==='POST'){
   if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')??''))return json({},415);
   try{body=JSON.stringify(payload(operation,JSON.parse(await bounded(request.body,8192)),url.origin));}catch{return json({code:'INVALID_REQUEST'},400);}
   headers.set('Content-Type','application/json');
  }
  let timer;
  try{
   const response=await Promise.race([proxy({request:new Request(target,{method,headers,body}),path:operation,baseUrl:env.PULSO_NEON_AUTH_URL,cookieSecret:env.PULSO_AUTH_COOKIE_SECRET,sessionDataTtl:0,domain:url.hostname,sameSite:'lax',log:resolveNeonAuthLogging({logLevel:'silent'})}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs);})]);
   const content=await bounded(response.body,65536),out=new Headers(safeHeaders);
   out.set('Content-Type','application/json');
   for(const cookie of response.headers.getSetCookie())out.append('Set-Cookie',cookie);
   const retry=response.headers.get('Retry-After');if(retry&&/^\d{1,5}$/.test(retry))out.set('Retry-After',retry);
   return new Response(content,{status:response.status,headers:out});
  }catch{return json({code:'AUTH_UNAVAILABLE'},503);}finally{clearTimeout(timer);}
 };
}
export const accountAuth=createAccountAuthRouter();
