export function accountLaunchTarget(value:string,current:string):string|null{
 try{const source=new URL(current),target=new URL(value);if(target.origin!==source.origin||target.username||target.password||target.pathname!=='/'||target.search.length>2048||target.href===source.href)return null;
  return ['callback','reset'].includes(target.searchParams.get('pulso-account')??'')?target.href:null;
 }catch{return null;}
}
/** Ordinary launches focus the installed window without restarting its audio.
 * Explicit credential returns navigate that same window; credentials never
 * enter an inter-tab channel or a saved installation marker. */
export function reuseInstalledWindow(host:Window){
 const queue=(host as Window&{launchQueue?:{setConsumer(fn:(params:{targetURL?:string})=>void):void}}).launchQueue;
 queue?.setConsumer(params=>{if(!params.targetURL)return;const target=accountLaunchTarget(params.targetURL,host.location.href);if(target)host.location.assign(target);});
}
