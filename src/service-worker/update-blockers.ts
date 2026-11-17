// Readiness only. No session, query, file or playback identities leave a host.
const blockers=new Set<()=>boolean>();
export function registerUpdateBlocker(blocked:()=>boolean):()=>void {
 blockers.add(blocked);return()=>{blockers.delete(blocked);};
}
export function updateWorkPending():boolean {
 for(const blocked of blockers)try{if(blocked())return true;}catch{return true;}
 return false;
}
