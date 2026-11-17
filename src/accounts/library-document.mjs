import {copyLocalAlbumMetadata} from '../library/album-metadata.ts';
// Portable account data only. Never accept local paths, blobs, Telegram peers,
// access hashes, credentials, audio bytes, fingerprints or availability claims.
export const LIBRARY_LIMITS=Object.freeze({bytes:2*1024*1024,tracks:5000,playlists:500,entries:50000});
export const emptyLibrary=()=>({version:1,tracks:[],playlists:[]});
export const libraryUuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const text=(v,max,nonempty=false)=>typeof v==='string'&&v.length<=max&&(!nonempty||!!v.trim())&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v);
const nullable=v=>v===null||text(v,300);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function copyAccountCatalog(value){
 if(value===null)return null;
 const fields=['id','source','title','artist','album','duration'];if(!value||!fields.every(k=>Object.hasOwn(value,k))||Object.keys(value).some(k=>![...fields,'searchArtist'].includes(k)))throw Error('catalog');
 const itunes=value.source==='itunes'&&/^itunes:(?:[1-9][0-9]*:){3}[1-9][0-9]*$/.test(value.id),mb=value.source==='musicbrainz'&&/^musicbrainz:[a-f0-9-]{36}:[1-9][0-9]{0,2}:[1-9][0-9]{0,2}:[a-f0-9-]{36}$/.test(value.id),lyrics=value.source==='lrclib'&&/^lrclib:[1-9][0-9]{0,14}$/.test(value.id);
 if(!(itunes||mb||lyrics)||!text(value.title,300,true)||!text(value.artist,300,true)||!nullable(value.album)||value.duration!==null&&(!Number.isFinite(value.duration)||value.duration<=0||value.duration>86400)||value.searchArtist!==undefined&&!text(value.searchArtist,300,true))throw Error('catalog');
 return {id:value.id,source:value.source,title:value.title,artist:value.artist,album:value.album,duration:value.duration,...(value.searchArtist?{searchArtist:value.searchArtist}:{})};
}
export function validateAccountLibrary(value){
 if(!object(value,['version','tracks','playlists'])||value.version!==1||!Array.isArray(value.tracks)||value.tracks.length>LIBRARY_LIMITS.tracks||!Array.isArray(value.playlists)||value.playlists.length>LIBRARY_LIMITS.playlists)throw Error('library-format');
 const ids=new Set(),listIds=new Set();let entries=0;
 const tracks=value.tracks.map(t=>{
  if(!object(t,['id','title','artist','album','duration','favorite','inLibrary','createdAt','localAlbum','catalog'])||!libraryUuid(t.id)||ids.has(t.id)||!text(t.title,300,true)||!nullable(t.artist)||!nullable(t.album)||!Number.isFinite(t.duration)||t.duration<=0||t.duration>86400||typeof t.favorite!=='boolean'||typeof t.inLibrary!=='boolean'||!text(t.createdAt,30,true)||!Number.isFinite(Date.parse(t.createdAt))||t.localAlbum!==null&&!copyLocalAlbumMetadata(t.localAlbum))throw Error('library-track');
  ids.add(t.id);return {id:t.id,title:t.title,artist:t.artist,album:t.album,duration:t.duration,favorite:t.favorite,inLibrary:t.inLibrary,createdAt:t.createdAt,localAlbum:t.localAlbum===null?null:copyLocalAlbumMetadata(t.localAlbum),catalog:copyAccountCatalog(t.catalog)};
 });
 const playlists=value.playlists.map(p=>{
  if(!object(p,['id','name','entries'])||!libraryUuid(p.id)||listIds.has(p.id)||!text(p.name,100,true)||!Array.isArray(p.entries)||(entries+=p.entries.length)>LIBRARY_LIMITS.entries)throw Error('library-playlist');
  listIds.add(p.id);const seen=new Set(),seenTracks=new Set();
  return {id:p.id,name:p.name,entries:p.entries.map(e=>{if(!object(e,['id','trackId'])||!libraryUuid(e.id)||seen.has(e.id)||!ids.has(e.trackId)||seenTracks.has(e.trackId))throw Error('library-entry');seen.add(e.id);seenTracks.add(e.trackId);return {id:e.id,trackId:e.trackId};})};
 });
 const result={version:1,tracks,playlists};if(new TextEncoder().encode(JSON.stringify(result)).length>LIBRARY_LIMITS.bytes)throw Error('library-limit');return result;
}
// Three-way merge: independent changes survive. Removal of an existing entity
// wins over an untouched copy. Conflicting field edits prefer this device.
function mergeFields(base,local,remote,fields){const out={...remote};for(const k of fields)if(!equal(local[k],base?.[k]))out[k]=local[k];return out;}
function mergeRows(base,local,remote,merge){
 const b=new Map(base.map(x=>[x.id,x])),l=new Map(local.map(x=>[x.id,x])),r=new Map(remote.map(x=>[x.id,x]));const out=[];
 for(const id of new Set([...r.keys(),...l.keys()])){const before=b.get(id),left=l.get(id),right=r.get(id);
  if(before&&(!left||!right)){if(!left||equal(left,before))continue;/* a local edit can recover a remotely removed row */}
  if(!left){if(!before&&right)out.push(right);continue;}
  if(!right){out.push(left);continue;}out.push(merge(before,left,right));
 }return out;
}
export function mergeAccountLibraries(base,local,remote){
 [base,local,remote]=[base,local,remote].map(validateAccountLibrary);
 const tracks=mergeRows(base.tracks,local.tracks,remote.tracks,(b,l,r)=>mergeFields(b,l,r,['title','artist','album','duration','favorite','inLibrary','createdAt','localAlbum','catalog']));
 const playlists=mergeRows(base.playlists,local.playlists,remote.playlists,(b,l,r)=>{
  const next=mergeFields(b,l,r,['name']);const before=b?.entries??[];
  const merged=mergeRows(before,l.entries,r.entries,(_b,left)=>left);
  const order=equal(l.entries,before)?r.entries:l.entries;const ranks=new Map(order.map((e,i)=>[e.id,i]));merged.sort((a,b)=>(ranks.get(a.id)??1e9)-(ranks.get(b.id)??1e9));
  const unique=new Set();next.entries=merged.filter(e=>!unique.has(e.trackId)&&unique.add(e.trackId));return next;
 });
 const known=new Set(tracks.map(t=>t.id));for(const p of playlists)p.entries=p.entries.filter(e=>known.has(e.trackId));
 return validateAccountLibrary({version:1,tracks,playlists});
}
