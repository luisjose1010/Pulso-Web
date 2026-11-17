import {AccountFailure,type AccountProvider,type AccountUser,createAccountController} from './account-controller';
import {offlineAccountCache,coordinateAccountSessions} from './session-coordination';
function checked(result:{error?:{code?:string}|null}){if(result.error)throw new AccountFailure(result.error.code??'NETWORK');}
function userOf(value:unknown):AccountUser|null {
 if(value===null)return null;
 if(!value||typeof value!=='object')throw new AccountFailure('INVALID_RESPONSE');
 const {session,user}=value as {session?:unknown;user?:Record<string,unknown>};
 if(!session||!user||typeof user.id!=='string'||!user.id||typeof user.email!=='string'||typeof user.name!=='string'||typeof user.emailVerified!=='boolean')throw new AccountFailure('INVALID_RESPONSE');
 const expiry=typeof session==='object'&&session!==null?(session as {expiresAt?:unknown}).expiresAt:undefined;
 const expiresAt=expiry instanceof Date?expiry.getTime():typeof expiry==='string'?Date.parse(expiry):NaN;
 return {id:user.id,name:user.name,email:user.email,verified:user.emailVerified,...(Number.isFinite(expiresAt)?{expiresAt}:{})};
}
async function createClient(){
 // Pulso keeps a strict CSP. Configure Zod before importing schemas from the SDK.
 const {config}=await import('zod/v4/core');config({jitless:true});
 const {createAuthClient}=await import('@neon/auth');
 const {BetterAuthVanillaAdapter}=await import('@neon/auth/vanilla/adapters');
 return createAuthClient(window.location.origin+'/api/account-auth',{adapter:BetterAuthVanillaAdapter({fetchOptions:{retry:0,timeout:15000}})});
}
let authClient:ReturnType<typeof createClient>|null=null;
/** One official SDK client for the prebuilt forms and the header's checked profile. */
export function getAccountAuthClient(){return authClient??=createClient();}
async function createProvider():Promise<AccountProvider>{
 const client=await getAccountAuthClient();
 const callback=window.location.origin+'/?pulso-account=callback';
 return {
  async session(){const r=await client.getSession({fetchOptions:{cache:'no-store',headers:{'X-Force-Fetch':'true'}}});checked(r);return userOf(r.data);},
  async signIn(email,password){checked(await client.signIn.email({email,password,rememberMe:true}));},
  async signUp(name,email,password){checked(await client.signUp.email({name,email,password,callbackURL:callback}));},
  async google(){checked(await client.signIn.social({provider:'google',callbackURL:callback}));},
  async signOut(){checked(await client.signOut());},
  async requestReset(email){checked(await client.requestPasswordReset({email,redirectTo:window.location.origin+'/?pulso-account=reset'}));},
  async reset(token,newPassword){checked(await client.resetPassword({token,newPassword}));},
  async verify(email,otp){checked(await client.$fetch('/email-otp/verify-email',{method:'POST',body:{email,otp}}));},
  async resend(email){checked(await client.$fetch('/email-otp/send-verification-otp',{method:'POST',body:{email,type:'email-verification'}}));},
 };
}
let knownUser:string|null|undefined,synchronization:ReturnType<typeof coordinateAccountSessions>|null=null;
const cache=offlineAccountCache({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)});
export const accountController=createAccountController({
 async config(){const r=await fetch('/account-config.json',{cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(5000)});if(!r.ok)throw new AccountFailure('NETWORK');const raw=await r.text();if(raw.length>512)throw new AccountFailure('INVALID_RESPONSE');const v=JSON.parse(raw);if(v.version!==1||typeof v.enabled!=='boolean'||typeof v.google!=='boolean')throw new AccountFailure('INVALID_RESPONSE');return v;},
 provider:createProvider,
 offlineSession:()=>typeof navigator!=='undefined'&&navigator.onLine===false?cache.read():null,
 confirmed(user){cache.save(user);const next=user?.id??null;if(knownUser!==undefined&&knownUser!==next)synchronization?.notify();knownUser=next;},
});
export function announceAccountChange(){synchronization?.notify();}
if(typeof window!=='undefined'&&typeof document!=='undefined'){
 let channel:BroadcastChannel|null=null;try{channel=new BroadcastChannel('pulso-account:session:v1');}catch{/* Storage and focus fallback. */}
 synchronization=coordinateAccountSessions(accountController,{window,document,channel,store:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)}});
}
