export type InstallState='manual'|'ready'|'prompting'|'requested'|'dismissed'|'failed'|'installed';
interface InstallEvent extends Event {
 prompt():Promise<unknown>;
 userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
}
/** Keep the browser's one-use capability only in this page. Never wait before
 * prompt(): the native dialog needs the original click's user activation. */
export function createAppInstall(target:Window,changed:(state:InstallState)=>void){
 const display=target.matchMedia('(display-mode: standalone)');
 const standalone=()=>display.matches||(target.navigator as Navigator&{standalone?:boolean}).standalone===true;
 let state:InstallState=standalone()?'installed':'manual',pending:InstallEvent|null=null,sequence=0,alive=true;
 const publish=(next:InstallState)=>{state=next;if(alive)changed(next);};
 const installed=()=>{if(!alive)return;sequence++;pending=null;publish('installed');};
 const mode=()=>{if(standalone())installed();};
 const before=(raw:Event)=>{
  const event=raw as InstallEvent;
  if(!alive||state==='installed'||state==='prompting'||typeof event.prompt!=='function')return;
  event.preventDefault();sequence++;pending=event;publish('ready');
 };
 target.addEventListener('beforeinstallprompt',before);target.addEventListener('appinstalled',installed);display.addEventListener('change',mode);changed(state);
 return {
  prompt(){
   if(!alive||state!=='ready'||!pending)return;
   const event=pending,attempt=++sequence;pending=null;publish('prompting');
   const current=()=>alive&&sequence===attempt&&state!=='installed';
   try{
    const shown=event.prompt();
    void Promise.resolve(shown).then(()=>event.userChoice).then(choice=>{if(current())publish(choice.outcome==='accepted'?'requested':'dismissed');},()=>{if(current())publish('failed');});
   }catch{if(current())publish('failed');}
  },
  dispose(){alive=false;sequence++;pending=null;target.removeEventListener('beforeinstallprompt',before);target.removeEventListener('appinstalled',installed);display.removeEventListener('change',mode);},
 };
}
