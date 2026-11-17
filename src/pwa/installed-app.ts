export type InstalledAppState='standalone'|'installed'|'not-detected'|'unknown';
export interface RelatedApplication {platform?:string;id?:string;url?:string}
export function isPulsoApplication(value:RelatedApplication,origin:string){
 if(value.platform!=='webapp')return false;
 try{return !!value.id&&new URL(value.id,origin).href===origin+'/'||!!value.url&&new URL(value.url,origin).href===origin+'/manifest.webmanifest';}catch{return false;}
}
/** No saved installation flag: deletion must not leave a false claim behind. */
export async function detectInstalledPulso(host:{origin:string;standalone:boolean;related?:()=>Promise<RelatedApplication[]>},timeoutMs=2000):Promise<InstalledAppState>{
 if(host.standalone)return 'standalone';if(!host.related)return 'unknown';let timer:ReturnType<typeof setTimeout>|undefined;
 try{const apps=await Promise.race([host.related(),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),timeoutMs);})]);if(!apps)return 'unknown';return apps.some(app=>isPulsoApplication(app,host.origin))?'installed':'not-detected';}
 catch{return 'unknown';}finally{clearTimeout(timer);}
}
