let notice:{message:string;kind:'success'|'error'}|null=null;
const listeners=new Set<()=>void>();
export const accountNotices={getSnapshot:()=>notice,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},clear:()=>{notice=null;for(const fn of listeners)fn();}};
export const toast={success:(message:string)=>{notice={message,kind:'success'};for(const fn of listeners)fn();},error:(message:string)=>{notice={message,kind:'error'};for(const fn of listeners)fn();}};
