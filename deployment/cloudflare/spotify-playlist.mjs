const ID=/^[A-Za-z0-9]{22}$/;
const MAX_BYTES=1024*1024;
function field(value,max=500){if(typeof value!=='string'||value.length>max)throw Error('Invalid metadata');return value;}
export function parseSpotifyPlaylist(html){
 if(new TextEncoder().encode(html).length>MAX_BYTES)throw Error('Oversize');
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(m=>/(?:^|\s)id\s*=\s*(["'])__NEXT_DATA__\1/i.test(m[1]));
 if(scripts.length!==1)throw Error('Missing data');
 const entity=JSON.parse(scripts[0][2])?.props?.pageProps?.state?.data?.entity;
 if(!entity||!Array.isArray(entity.trackList)||entity.trackList.length>1000)throw Error('Invalid playlist');
 const name=field(entity.name),rows=entity.trackList.slice(0,100),tracks=[];let omitted=0;
 for(const row of rows){
  if(!row||typeof row.uri!=='string'||!/^spotify:track:[A-Za-z0-9]{22}$/.test(row.uri)){omitted++;continue;}
  tracks.push({title:field(row.title),artists:field(row.subtitle),durationMs:Number.isSafeInteger(row.duration)&&row.duration>=0&&row.duration<=86400000?row.duration:null,url:`https://open.spotify.com/track/${row.uri.slice(14)}`});
 }
 const total=Number.isSafeInteger(entity.totalTracks)&&entity.totalTracks>=entity.trackList.length?entity.totalTracks:null;
 return {name,tracks,readCount:rows.length,omitted,total,limited:entity.trackList.length>=100,complete:total!==null&&total===rows.length};
}
export async function spotifyPlaylist(request,fetcher=fetch){
 const url=new URL(request.url),match=/^\/api\/spotify-playlist\/([A-Za-z0-9]{22})$/.exec(url.pathname);
 const reply=(body,status)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
 if(!match||!ID.test(match[1])||url.search)return reply({error:'invalid-request'},400);
 if(request.method!=='GET')return reply({error:'method'},405);
 if((request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)||request.headers.get('Sec-Fetch-Site')==='cross-site')return reply({error:'origin'},403);
 const controller=new AbortController(),abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
 const timer=setTimeout(abort,8000);let reader,stage='network',upstreamStatus;
 try{
  // Workers supports manual/follow only; manual plus the !ok check rejects 3xx
  // without following a redirect or forwarding any visitor credentials.
  const upstream=await fetcher(`https://open.spotify.com/embed/playlist/${match[1]}`,{redirect:'manual',signal:controller.signal,credentials:'omit',headers:{Accept:'text/html'}});
  stage='upstream-response';upstreamStatus=upstream.status;
  if(!upstream.ok||!upstream.headers.get('content-type')?.includes('text/html')||Number(upstream.headers.get('content-length'))>MAX_BYTES)throw Error('Unavailable');
  reader=upstream.body.getReader();const decoder=new TextDecoder();let html='',bytes=0;
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES)throw Error('Oversize');html+=decoder.decode(value,{stream:true});}html+=decoder.decode();
  stage='metadata-format';return reply(parseSpotifyPlaylist(html),200);
 }catch{return reply({error:'unavailable',reason:controller.signal.aborted?'aborted':stage,...(stage==='upstream-response'?{upstreamStatus}:{})},502);}finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);await reader?.cancel().catch(()=>{});}
}
