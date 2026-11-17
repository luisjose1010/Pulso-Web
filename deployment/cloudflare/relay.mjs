// Public metadata/images only. Never accepts arbitrary hosts, credentials or audio.
const JSON_MAX=1048576,IMAGE_MAX=2097152;
export class RelayError extends Error{constructor(status,retryAfter=null){super('catalog');this.status=status;this.retryAfter=retryAfter;}}
export function upstream(path,query){
 const pairs=[...new URLSearchParams(query)];if(pairs.length>8||new Set(pairs.map(p=>p[0])).size!==pairs.length)throw new RelayError(400);
 const p=Object.fromEntries(pairs);
 if(path==='/catalog/artwork'){
  if(pairs.length!==1||!p.u||!/^https:\/\/is[1-5]-ssl\.mzstatic\.com\//.test(p.u)||p.u.length>2048||p.u.includes('\\'))throw new RelayError(400);
  const u=new URL(p.u);if(u.search||u.hash||!/[.](jpe?g|png|webp)$/i.test(u.pathname))throw new RelayError(400);
  return {url:u.href,image:true};
 }
 if(!['/catalog/itunes/search','/catalog/itunes/lookup'].includes(path))throw new RelayError(404);
 const search=path.endsWith('/search'),allowed=search?['term','country','media','entity','limit']:['id','country','media','entity','limit'];
 if(pairs.some(([k])=>!allowed.includes(k)))throw new RelayError(400);
 if(search?(!p.term||p.term.length>300||/[\x00-\x1f]/.test(p.term)):(!/^[0-9]{1,16}$/.test(p.id??'')||!Number.isSafeInteger(Number(p.id))||Number(p.id)<=0))throw new RelayError(400);
 if(p.country!==undefined&&p.country!=='US'||p.media!==undefined&&p.media!=='music'||p.entity!==undefined&&!(search?['album','song','musicArtist']:['album','song']).includes(p.entity)||p.limit!==undefined&&(!/^[0-9]{1,3}$/.test(p.limit)||Number(p.limit)<1||Number(p.limit)>200))throw new RelayError(400);
 p.country='US';return {url:'https://itunes.apple.com/'+(search?'search':'lookup')+'?'+new URLSearchParams(Object.entries(p).sort()).toString(),image:false};
}
async function bounded(response,limit,signal){
 if(!response.body||Number(response.headers.get('content-length'))>limit){void response.body?.cancel().catch(()=>{});throw new RelayError(502);}
 const reader=response.body.getReader(),chunks=[];let size=0,done=false;
 const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{while(true){if(signal.aborted)throw new RelayError(504);const r=await reader.read();if(signal.aborted)throw new RelayError(504);if(r.done){done=true;break;}size+=r.value.length;if(size>limit||chunks.length>=8192)throw new RelayError(502);chunks.push(r.value);}const b=new Uint8Array(size);let offset=0;for(const c of chunks){b.set(c,offset);offset+=c.length;}return b;}
 finally{signal.removeEventListener('abort',cancel);if(!done)cancel();try{reader.releaseLock();}catch{}}
}
export class CatalogRelay{
 constructor({fetcher=(...args)=>fetch(...args),clock=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),spacing=3100,timeout=10000,checkpoint=async()=>{},initial={},resolver=upstream,userAgent='Pulso-Web prototype'}={}){
  Object.assign(this,{fetcher,clock,sleep,spacing,timeout,checkpoint,resolver,userAgent});this.last=initial.last??0;this.cooldown=initial.cooldown??0;this.cache=new Map();this.inflight=new Map();this.tail=Promise.resolve();this.cacheBytes=0;
 }
 async get(path,query){
  const target=this.resolver(path,query),key=target.url,hit=this.cache.get(key);
  if(hit&&hit.expires>this.clock()){this.cache.delete(key);this.cache.set(key,hit);return hit.value;}
  if(hit){this.cacheBytes-=hit.value.body.length;this.cache.delete(key);}
  if(this.inflight.has(key))return this.inflight.get(key);if(this.inflight.size>=8)throw new RelayError(503,'5');
  const {result,settled}=this.load(target);const work=result.then(value=>{this.cache.set(key,{value,expires:this.clock()+300000,image:target.image});this.cacheBytes+=value.body.length;
   while(this.cacheBytes>33554432||[...this.cache.values()].filter(e=>e.image===target.image).length>(target.image?16:32)){const k=this.cache.keys().next().value;this.cacheBytes-=this.cache.get(k).value.body.length;this.cache.delete(k);}return value;});
  this.inflight.set(key,work);void settled.then(()=>{if(this.inflight.get(key)===work)this.inflight.delete(key);});return work;
 }
 load({url,image}){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),this.timeout);
  let stop;const expired=new Promise((_,reject)=>{stop=()=>reject(new RelayError(504));abort.signal.addEventListener('abort',stop,{once:true});});
  const task=(async()=>{
   if(!image){const previous=this.tail;let release;const gate=new Promise(r=>{release=r;});this.tail=Promise.allSettled([previous,gate]).then(()=>{});try{
    await Promise.race([previous,expired]);if(this.cooldown>this.clock())throw new RelayError(429,String(Math.ceil((this.cooldown-this.clock())/1000)));
    const delay=Math.max(0,this.last+this.spacing-this.clock());if(delay)await Promise.race([this.sleep(delay),expired]);if(abort.signal.aborted)throw new RelayError(504);
    if(this.cooldown>this.clock())throw new RelayError(429,String(Math.ceil((this.cooldown-this.clock())/1000)));
    this.last=this.clock();await Promise.race([this.checkpoint({last:this.last,cooldown:this.cooldown}),expired]);
   }finally{release();}}
   if(abort.signal.aborted)throw new RelayError(504);
   const r=await this.fetcher(url,{method:'GET',redirect:'manual',credentials:'omit',signal:abort.signal,headers:{Accept:image?'image/png,image/jpeg,image/webp':'application/json','User-Agent':this.userAgent}});
   if(abort.signal.aborted){void r.body?.cancel().catch(()=>{});throw new RelayError(504);}
   if(r.status!==200){void r.body?.cancel().catch(()=>{});const retry=r.headers.get('retry-after');
    if(!image&&[429,503].includes(r.status)){const seconds=/^[0-9]{1,4}$/.test(retry??'')&&Number(retry)<=3600?Math.max(4,Number(retry)):60;this.cooldown=Math.max(this.cooldown,this.clock()+seconds*1000);await this.checkpoint({last:this.last,cooldown:this.cooldown});throw new RelayError(r.status,String(seconds));}
    throw new RelayError(r.status>=400&&r.status<=599?r.status:502);
   }
   const mime=(r.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
   if(!(image?['image/png','image/jpeg','image/webp']:['application/json','text/json','text/javascript']).includes(mime)){void r.body?.cancel().catch(()=>{});throw new RelayError(502);}
   const body=await bounded(r,image?IMAGE_MAX:JSON_MAX,abort.signal);
   if(image){const signature=mime==='image/png'?body.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i])&&body.length>=8:mime==='image/jpeg'?body.length>=3&&body[0]===255&&body[1]===216&&body[2]===255:body.length>=12&&new TextDecoder().decode(body.slice(0,4))==='RIFF'&&new TextDecoder().decode(body.slice(8,12))==='WEBP';if(!signature)throw new RelayError(502);return {mime,body};}
   const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));if(!value||typeof value!=='object'||Array.isArray(value))throw new RelayError(502);
   const encoded=new TextEncoder().encode(JSON.stringify(value));if(encoded.length>JSON_MAX)throw new RelayError(502);return {mime:'application/json',body:encoded};
  })();
  const result=Promise.race([task,expired]).catch(e=>{throw e instanceof RelayError?e:new RelayError(502);}).finally(()=>{clearTimeout(timer);abort.signal.removeEventListener('abort',stop);abort.abort();});
  return {result,settled:task.then(()=>{},()=>{})};
 }
}
