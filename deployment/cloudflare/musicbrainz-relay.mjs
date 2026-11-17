import {CatalogRelay,RelayError} from './relay.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const literal=s=>'"'+s.replace(/[\\"]/g,'\\$&')+'"';
export function musicBrainzUpstream(path,query){
 const pairs=[...new URLSearchParams(query)],p=Object.fromEntries(pairs);
 if(pairs.length>2||new Set(pairs.map(([k])=>k)).size!==pairs.length)throw new RelayError(400);
 const term=()=>typeof p.term==='string'&&p.term.trim()&&p.term.length<=300&&!/[\x00-\x1f]/.test(p.term);
 let resource,params;
 switch(path){
  case '/catalog/musicbrainz/search':
   if(!term()||pairs.some(([k])=>!['term','artist'].includes(k))||p.artist!==undefined&&(!p.artist.trim()||p.artist.length>300||/[\x00-\x1f]/.test(p.artist)))throw new RelayError(400);
   resource='release/';params=p.artist?{query:`release:${literal(p.term)} AND artist:${literal(p.artist)}`,limit:'20'}:{query:p.term,dismax:'true',limit:'20'};break;
  case '/catalog/musicbrainz/artists':
   if(!term()||pairs.length!==1)throw new RelayError(400);
   resource='artist/';params={query:p.term,dismax:'true',limit:'20'};break;
  case '/catalog/musicbrainz/artist-albums':
   if(pairs.length!==1||!uuid.test(p.id??''))throw new RelayError(400);
   resource='release';params={artist:p.id,inc:'artist-credits+media',limit:'100',offset:'0'};break;
  case '/catalog/musicbrainz/release':
   if(pairs.length!==1||!uuid.test(p.id??''))throw new RelayError(400);
   resource='release/'+p.id;params={inc:'recordings+artist-credits'};break;
  case '/catalog/musicbrainz/artwork':
   if(pairs.length!==1||!uuid.test(p.id??''))throw new RelayError(400);
   return {url:'https://coverartarchive.org/release/'+p.id+'/front-500',image:true};
  default:throw new RelayError(404);
 }
 return {url:'https://musicbrainz.org/ws/2/'+resource+'?'+new URLSearchParams({...params,fmt:'json'}),image:false};
}
/** Follow only the documented archive delivery hosts, never visitor-supplied URLs. */
export async function musicBrainzFetch(fetcher,url,options){
 if(new URL(url).hostname!=='coverartarchive.org')return fetcher(url,options);
 let next=url;for(let i=0;i<4;i++){
  const r=await fetcher(next,{...options,redirect:'manual'});
  if(![301,302,303,307,308].includes(r.status))return r;
  const location=r.headers.get('location');void r.body?.cancel().catch(()=>{});if(!location)throw new RelayError(502);
  const u=new URL(location,next);if(u.protocol!=='https:'||u.port||u.username||u.password||!['coverartarchive.org','archive.org'].includes(u.hostname)&&!u.hostname.endsWith('.archive.org'))throw new RelayError(502);
  next=u.href;
 }
 throw new RelayError(502);
}
export function createMusicBrainzRelay({fetcher=(...args)=>fetch(...args),...options}={}){
 return new CatalogRelay({...options,resolver:musicBrainzUpstream,spacing:1100,userAgent:'Pulso-Web/0.1 (https://github.com/Alegark/Pulso-Web)',fetcher:(url,init)=>musicBrainzFetch(fetcher,url,init)});
}
