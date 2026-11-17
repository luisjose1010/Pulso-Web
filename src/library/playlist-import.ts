/** Playlist import: pasted "Artist - Title" lines -> tracks the album batch can download.
 * Level 1 resolves through the iTunes catalogue (album + duration, stricter bot match).
 * Level 2 (no catalogue hit) searches the bot by artist + title with no album/duration.
 * Anything else stays unresolved; nothing is guessed. Pure: the search is injected. */
import {catalogSongsFromBatch,type AlbumDetail,type AlbumTrack,type CatalogSongHint} from './album-catalog';
import {musicIdentityText} from '../telegram/bot-search-protocol';

/** One batch per import keeps catalogue cadence (3.1 s) and bot limits manageable. */
export const PLAYLIST_IMPORT_MAX=30;
export const PLAYLIST_EDITION_ID=9_000_000_000_001;

export interface PlaylistEntry {readonly raw:string;readonly title:string;readonly artist:string|null}
export type PlaylistMatch=
 |{readonly entry:PlaylistEntry;readonly status:'catalog'|'direct';readonly track:AlbumTrack}
 |{readonly entry:PlaylistEntry;readonly status:'duplicate'}
 |{readonly entry:PlaylistEntry;readonly status:'unresolved';readonly reason:'no-artist'|'invalid'};
/** `remaining`: the pasted lines from the first one that did not fit this batch, ready for the next batch. */
export interface PlaylistParse {readonly entries:readonly PlaylistEntry[];readonly skipped:number;readonly truncated:number;readonly remaining:string}

const SEPARATOR=/\s[-–—]\s/u;
const NOISE_GROUP=/\s*[[(][^\])]*?\b(?:official|lyrics?|lyric video|visuali[sz]er|music video|video oficial|audio oficial|animated|hd|4k)\b[^\])]*[\])]/giu;
const clean=(s:string)=>s.replace(NOISE_GROUP,'').replace(/\s*[[(]\s*audio\s*[\])]/giu,'').replace(/\s+#\S+/gu,'').replace(/\s+/gu,' ').trim();
const cleanArtist=(s:string)=>clean(s).replace(/\s*-\s*Topic$/iu,'').replace(/\s*VEVO$/iu,'').trim();

/** Lines of "Artist - Title" (or "Artist<TAB>Title"). `#` lines and blanks are ignored.
 * A line without a separator is a title with no artist: it can never be matched. */
export function parsePlaylistText(text:string,max=PLAYLIST_IMPORT_MAX):PlaylistParse {
 const entries:PlaylistEntry[]=[],seen=new Set<string>();let skipped=0,truncated=0;
 const all=text.split(/\r?\n/u);let restFrom=-1;
 for(let index=0;index<all.length;index++){const rawLine=all[index];
  // "Artist - Topic - Title": YouTube auto-generated channel suffix, not part of the name.
  const line=rawLine.replace(/^\s*(?:[-*•]|\d{1,4}\s*[.)])\s+/u,'').replace(/\s[-–—]\s+Topic(?=\s[-–—]\s)/iu,'').trim();
  if(!line||line.startsWith('#'))continue;
  let artist:string|null=null,title=line;
  if(line.includes('\t')){const [a,...rest]=line.split('\t');artist=a.trim()||null;title=rest.join(' ').trim();}
  else{const m=SEPARATOR.exec(line);if(m){artist=line.slice(0,m.index).trim()||null;title=line.slice(m.index+m[0].length).trim();}}
  artist=artist?cleanArtist(artist)||null:null;title=clean(title);
  if(!title||title.length>300||(artist?.length??0)>300){skipped++;continue;}
  const key=`${musicIdentityText(artist??'')}|${musicIdentityText(title)}`;
  if(seen.has(key)){skipped++;continue;}seen.add(key);
  if(entries.length>=max){truncated++;if(restFrom<0)restFrom=index;continue;}
  entries.push(Object.freeze({raw:line,title,artist}));
 }
 return Object.freeze({entries:Object.freeze(entries),skipped,truncated,remaining:restFrom<0?'':all.slice(restFrom).join('\n')});
}

// Featured-artist markers are credit decoration; version words (live, remix, slowed) are kept.
const comparable=(s:string)=>musicIdentityText(s.replace(/[[(]\s*(?:feat|ft|with|prod)\b[^\])]*[\])]/giu,'').replace(/\s+(?:feat|ft)\.?\s.*$/iu,''));
const credits=(s:string)=>s.split(/\s*(?:,|&|\bx\b|\band\b|\bfeat\.?|\bft\.?|\bwith\b)\s*/iu).map(musicIdentityText).filter(Boolean);
function pickHint(entry:PlaylistEntry,hints:readonly CatalogSongHint[]):CatalogSongHint|null {
 if(!entry.artist)return null;
 const title=comparable(entry.title),artist=musicIdentityText(entry.artist);
 return hints.find(h=>comparable(h.title)===title&&[...credits(h.artist),...(h.primaryArtist?credits(h.primaryArtist):[])].includes(artist))??null;
}
function directId(entry:PlaylistEntry):number {
 // Deterministic, 14 digits starting with 9: valid lrclib-shaped id, distinct from real small ids.
 const text=`${musicIdentityText(entry.artist??'')}|${musicIdentityText(entry.title)}`;
 let a=0x811c9dc5,b=0x01000193;
 for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),0x01000193)>>>0;b=Math.imul(b+text.charCodeAt(i),0x85ebca6b)>>>0;}
 return Number(`9${String(a).padStart(10,'0')}${String(b%1000).padStart(3,'0')}`);
}
export const playlistQuery=(entry:PlaylistEntry)=>`${entry.artist??''} ${entry.title}`.trim().slice(0,160);

export interface ResolveOptions {
 readonly search:(query:string,signal:AbortSignal)=>Promise<unknown|null>;
 readonly signal:AbortSignal;
 readonly current:()=>boolean;
 readonly progress?:(done:number,total:number)=>void;
}
export interface ResolveResult {readonly matches:readonly PlaylistMatch[];readonly complete:boolean}

/** Sequential on purpose: the shared catalogue transport already spaces requests. */
export async function resolvePlaylist(entries:readonly PlaylistEntry[],o:ResolveOptions):Promise<ResolveResult> {
 const matches:PlaylistMatch[]=[],used=new Set<number|string>();
 for(let i=0;i<entries.length;i++){
  if(o.signal.aborted||!o.current())return {matches,complete:false};
  const entry=entries[i];
  if(!entry.artist){matches.push({entry,status:'unresolved',reason:'no-artist'});o.progress?.(i+1,entries.length);continue;}
  const query=playlistQuery(entry);
  if(query.length<3){matches.push({entry,status:'unresolved',reason:'invalid'});o.progress?.(i+1,entries.length);continue;}
  let hint:CatalogSongHint|null=null;
  try{const data=await o.search(query,o.signal);if(o.signal.aborted||!o.current())return {matches,complete:false};hint=data?pickHint(entry,catalogSongsFromBatch(data)):null;}
  catch{if(o.signal.aborted||!o.current())return {matches,complete:false};}
  // A catalogue miss or failure is not a verdict: the bot may still have it.
  const track:AlbumTrack=hint
   ?{releaseId:hint.releaseId,trackId:hint.trackId,disc:hint.disc,position:hint.position,title:hint.title,artist:hint.artist,durationMs:hint.durationMs,album:hint.album,...(hint.primaryArtist?{primaryArtist:hint.primaryArtist}:{})}
   :{releaseId:directId(entry),trackId:directId(entry),disc:1,position:i+1,title:entry.title,artist:entry.artist,durationMs:null,direct:true};
  if(used.has(track.trackId))matches.push({entry,status:'duplicate'});
  else{used.add(track.trackId);matches.push({entry,status:hint?'catalog':'direct',track});}
  o.progress?.(i+1,entries.length);
 }
 return {matches,complete:true};
}

/** Synthetic edition consumed by the existing album batch (acquireAlbum). */
export function playlistDetail(name:string,matches:readonly PlaylistMatch[]):AlbumDetail {
 const tracks=matches.flatMap(m=>m.status==='catalog'||m.status==='direct'?[m.track]:[]);
 return {edition:{id:PLAYLIST_EDITION_ID,title:name.trim().slice(0,120)||'Playlist importada',artist:'Varios',trackCount:tracks.length,releaseDate:null},tracks};
}
