import {useCallback,useEffect,useMemo,useState,useSyncExternalStore,type ComponentPropsWithoutRef,type ComponentType,type PropsWithChildren} from 'react';
import {AuthProvider,type AuthPlugin as ReactAuthPlugin,type AuthPluginComponents} from '@better-auth-ui/react';
import {emailOtpPlugin} from '@better-auth-ui/core/plugins/email-otp';
import {QueryClient} from '@tanstack/react-query';
import {esES} from '@better-auth-ui/locales/es-ES';
import {accountError} from '../accounts/account-controller';
import {getAccountAuthClient,announceAccountChange} from '../accounts/neon-provider';
import {SignIn} from './account-kit/components/auth/sign-in';
import {SignUp} from './account-kit/components/auth/sign-up';
import {ForgotPassword} from './account-kit/components/auth/forgot-password';
import {ResetPassword} from './account-kit/components/auth/reset-password';
import {ResetLinkSent} from './account-kit/components/auth/reset-link-sent';
import {VerifyEmailOtp} from './account-kit/components/auth/email-otp/verify-email-otp';
import {flowMemory} from './account-kit/flow-memory';
import {RESET_LINK_SENT_STORAGE_KEY} from './account-kit/components/auth/reset-link-sent';
import {accountNotices} from './account-kit/notices';
import {TooltipProvider} from './account-kit/components/ui/tooltip';
import inputOtpStyle from './account-kit/input-otp.css?url';
import './account-kit.css';

type AccountUIPlugin=ReactAuthPlugin<AuthPluginComponents,{className?:string},{className?:string}>;
declare module '@better-auth-ui/core' {
 interface AuthPluginRegister {pulso:AccountUIPlugin}
 interface AuthConfig {Link:ComponentType<PropsWithChildren<{className?:string;href:string;to?:string}&Pick<ComponentPropsWithoutRef<'a'>,'aria-disabled'|'tabIndex'|'onClick'>>>}
}
export type AccountView='sign-in'|'sign-up'|'forgot-password'|'reset-password'|'reset-password-otp'|'verify-email'|'reset-link-sent';
const views=new Set<AccountView>(['sign-in','sign-up','forgot-password','reset-password','reset-password-otp','verify-email','reset-link-sent']);
export interface AccountKitProps {client:Awaited<ReturnType<typeof getAccountAuthClient>>;view:AccountView;resetToken:string;google:boolean;onBusy:(busy:boolean)=>void;onSession:()=>void;onView:(view:AccountView)=>void}
/** The form markup and submission flow come from Better Auth UI. Pulso owns
 * only its dialog, checked navigation, theme and closed error presentation. */
export default function AccountKit({client,view,resetToken,google,onBusy,onSession,onView}:AccountKitProps){
 const [queryClient]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0,staleTime:0,refetchOnWindowFocus:false},mutations:{retry:false,gcTime:0}}}));
 const [error,setError]=useState('');
 const notice=useSyncExternalStore(accountNotices.subscribe,accountNotices.getSnapshot);
 useEffect(()=>{
  const cache=queryClient.getMutationCache();
  return cache.subscribe(event=>{
   onBusy(queryClient.isMutating()>0);
   if(event.type==='updated'&&event.action.type==='error')setError(accountError(event.mutation.state.error));
   if(event.type==='updated'&&event.action.type==='success'&&event.mutation.options.mutationKey?.includes('resetPassword')){announceAccountChange();onSession();}
  });
 },[onBusy,onSession,queryClient]);
 useEffect(()=>{setError('');},[view]);
 useEffect(()=>()=>{queryClient.clear();flowMemory.clear();accountNotices.clear();},[queryClient]);
 const navigate=useCallback(({to}:{to:string})=>{
  const target=new URL(to,window.location.origin);
  if(target.origin!==window.location.origin)return;
  if(target.pathname==='/'){onSession();return;}
  const next=target.pathname.replace(/^\/account\//,'') as AccountView;
  if(views.has(next))onView(next);
 },[onSession,onView]);
 const Link=useMemo(()=>function AccountLink({href,children,onClick,...rest}:PropsWithChildren<{href:string;className?:string;to?:string}&Pick<ComponentPropsWithoutRef<'a'>,'aria-disabled'|'tabIndex'|'onClick'>>){return <a {...rest} href={href} onClick={event=>{event.preventDefault();onClick?.(event);if(queryClient.isMutating()===0)navigate({to:href});}}>{children}</a>;},[navigate,queryClient]);
 const plugins=useMemo(()=>[emailOtpPlugin({signIn:false,emailVerification:true,passwordReset:true,otpLength:6})],[]);
 return <div className="account-kit" data-auth-ui="better-auth-ui">
  <link id="input-otp-style" rel="stylesheet" href={inputOtpStyle} precedence="account"/>
  <AuthProvider authClient={client} queryClient={queryClient} locale={esES} baseURL={window.location.origin} basePaths={{auth:'/account'}} redirectTo="/?pulso-account=callback" Link={Link} navigate={navigate} plugins={plugins} socialProviders={google?['google']:[]} emailAndPassword={{enabled:true,name:true,rememberMe:false,requireEmailVerification:true,confirmPassword:true,minPasswordLength:8,maxPasswordLength:128,strengthMeter:false}} localization={{auth:{signIn:'Iniciar sesión',signUp:'Crear cuenta',name:'Tu nombre',email:'Correo electrónico',forgotPassword:'Olvidé mi contraseña',verifyEmail:'Verifica tu correo',resetPassword:'Guardar contraseña',sendResetLink:'Enviar enlace',checkYourEmailTitle:'Revisa tu correo',passwordResetEmailSent:'Si existe una cuenta con ese correo, recibirás un enlace para recuperar tu contraseña.',resetLinkSentTo:'Si existe una cuenta con {{email}}, recibirás un enlace para recuperar tu contraseña.'}}}>
   <TooltipProvider>{view==='sign-in'?<SignIn socialPosition="top"/>:view==='sign-up'?<SignUp socialPosition="top"/>:view==='forgot-password'?<ForgotPassword/>:view==='reset-password'||view==='reset-password-otp'?<ResetPassword token={resetToken} email={view==='reset-password-otp'?flowMemory.getItem(RESET_LINK_SENT_STORAGE_KEY)??undefined:undefined}/>:view==='verify-email'?<VerifyEmailOtp/>:<ResetLinkSent/>}</TooltipProvider>
  </AuthProvider>
  {error&&<p className="account-dialog__error" role="alert">{error}</p>}
  {notice&&<p role={notice.kind==='error'?'alert':'status'}>{notice.message}</p>}
 </div>;
}
