const pending = new Map<string,string>();
export const flowMemory = {getItem:(key:string)=>pending.get(key)??null,setItem:(key:string,value:string)=>{pending.set(key,value);},removeItem:(key:string)=>{pending.delete(key);},clear:()=>pending.clear()};
