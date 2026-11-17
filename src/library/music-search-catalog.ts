import type {CatalogId} from './catalog-id';
import type {Track} from './library';
import type {MusicSuggestion} from './music-suggestions';
import type {AlbumEdition,AlbumHint,CatalogArtist,CatalogSongHint} from './album-catalog';

interface ChoiceBase {
 readonly id:string;
 readonly title:string;
 readonly displayTitle?:string;
 readonly artist:string|null;
 readonly album:string|null;
 readonly duration:number|null;
 readonly source:'local'|'lrclib'|'itunes'|'musicbrainz';
 readonly artworkUrl?:string;
}
export type MusicCatalogChoice = (ChoiceBase & {readonly kind:'track'; readonly pendingEditionId?:CatalogId; readonly searchArtist?:string}) | (ChoiceBase & {readonly kind:'album'; readonly editionId?:CatalogId}) | (ChoiceBase & {readonly kind:'artist'; readonly artistId:CatalogId});
export const MUSIC_CATALOG_LIMITS=Object.freeze({localMatches:50,tracks:70,albums:20,preview:6});
// Ignore presentation differences, not recording/version qualifiers or performers.
export function musicCatalogKey(text:string):string {
 return text.normalize('NFKC').toLocaleLowerCase('es').trim()
  .replace(/[‘’ʼ]/gu,"'").replace(/[‐‑‒–—−]/gu,'-')
  .replace(/^["“”]+|["“”]+$/gu,'').replace(/\s*-\s*/gu,'-').replace(/\s+/gu,' ').trim();
}
// These labels describe a video presentation, not a recording version. Keep
// the original title for acquisition and use this value only for presentation.
function displayTrackTitle(title:string,artist:string|null):string {
 let result=title.trim();
 if(artist?.trim()){
  for(const separator of result.matchAll(/\s+[-–—]\s+/gu)){
   const index=separator.index;
   const prefix=result.slice(0,index), credit=musicCatalogKey(artist);
   const members=prefix.split(',').map(member=>musicCatalogKey(member));
   if(musicCatalogKey(prefix)===credit||(members.length>1&&members.every(Boolean)&&members.includes(credit))){
    result=result.slice(index+separator[0].length).trim();break;
   }
  }
 }
 const withoutTag=result.replace(/\s+\((?:visualizer|official video|official audio)\)\s*$/iu,'').trim();
 return withoutTag||result||title;
}
function tokens(s:string|null):string[] {
 return musicCatalogKey(s??'').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/u).filter(Boolean);
}
// Dedupe only presentation-equivalent recordings. Keep version words and the
// complete performer credit; accent/punctuation differences are harmless.
function recordingGroupBase(title:string,artist:string|null):string {
 const canonical=(value:string)=>tokens(value).join(' ');
 return JSON.stringify([canonical(displayTrackTitle(title,artist)),canonical(artist??'')]);
}
function recordingGroupKey(title:string,artist:string|null,duration:number|null):string {
 return JSON.stringify([recordingGroupBase(title,artist),duration]);
}
// Every query word must be accounted for by the candidate's own metadata.
// Prefixes support typing, but a performer-only match requires whole words.
function relevance(query:string,fields:readonly (string|null)[],performerOnly=false):number {
 const words=tokens(query),values=fields.flatMap(tokens);
 if(!words.length||!values.length)return 0;
 const exact=words.filter(word=>values.includes(word)).length;
 if(performerOnly)return exact===words.length?10000+exact:0;
 const covered=words.filter(word=>values.some(value=>value===word||(word.length>=3&&value.startsWith(word)))).length;
 return covered===words.length?10000+exact*100:0;
}
function score(query:string,title:string,artist:string|null,album:string|null):number {
 const words=tokens(query),names=[...tokens(title),...tokens(album)];
 const onlyArtist=words.length>0&&words.every(word=>tokens(artist).some(value=>value===word||(word.length>=3&&value.startsWith(word))))&&
  !words.some(word=>names.some(value=>value===word||(word.length>=3&&value.startsWith(word))));
 return relevance(query,[title,artist,album],onlyArtist);
}
function albumMatches(query:string,album:string,artist:string|null):boolean {
 return score(query,album,artist,null)>0;
}
/** A metadata grouping, not an acoustic identity claim. Album/duration differences
 * do not repeat a title/performer; literal live/remix/etc titles remain distinct.
 * Artist identities and concrete editions come from the bounded public catalogue.
 * All candidates are checked against their declared metadata and the full query.
 */
export function musicSearchCatalog(query:string,local:readonly Track[],remote:readonly MusicSuggestion[], editions:readonly AlbumEdition[] = [], artists:readonly CatalogArtist[] = [], hints:readonly AlbumHint[] = [], songHints:readonly CatalogSongHint[] = []):readonly MusicCatalogChoice[] {
 const q=musicCatalogKey(query);if(!q)return [];
 const singles=editions.filter(e=>e.trackCount===1);
 // Collection totals are authoritative; a batch's hit count is not a total.
 const singleIds=new Set(singles.map(e=>e.id));
 const sameCollection=(e:AlbumEdition,title:string,artist:string|null)=>musicCatalogKey(e.title)===musicCatalogKey(title)&&musicCatalogKey(e.artist)===musicCatalogKey(artist??'');
 const singleCollection=(title:string,artist:string|null)=>singles.some(e=>sameCollection(e,title,artist))&&!editions.some(e=>e.trackCount!==1&&sameCollection(e,title,artist));
 const songs=new Map<string,MusicCatalogChoice>(),songGroupBases=new Map<string,string>(),songGroupDurations=new Map<string,number[]>(),albums=new Map<string,MusicCatalogChoice>();
 const add=(id:string,title:string,artist:string|null,album:string|null,duration:number|null,source:'local'|'lrclib'|'itunes'|'musicbrainz',artworkUrl?:string,searchArtist?:string,releaseId?:CatalogId)=>{
  if(!score(q,title,artist,album)&&!singles.some(e=>e.id===releaseId&&albumMatches(q,e.title,e.artist)))return;
  const displayTitle=displayTrackTitle(title,artist);
  // Presentation grouping only: an authoritative album/title/credit match
  // can corroborate a primary-only label or punctuation variant. Audio lookup
  // and admission keep the original choice and its complete declared credits.
  const counterparts=artist&&album?songHints.filter(h=>musicCatalogKey(h.album)===musicCatalogKey(album)&&tokens(h.title).join(' ')===tokens(displayTitle).join(' ')&&(tokens(h.artist).join(' ')===tokens(artist).join(' ')||!!h.primaryArtist&&musicCatalogKey(h.primaryArtist)===musicCatalogKey(artist))):[];
  const corroborated=counterparts.length&&new Set(counterparts.map(h=>JSON.stringify([musicCatalogKey(h.title),musicCatalogKey(h.artist)]))).size===1?counterparts[0]:null;
  const albumHints=artist&&album?hints.filter(h=>h.artist&&musicCatalogKey(h.title)===musicCatalogKey(album)&&musicCatalogKey(h.artist)===musicCatalogKey(artist)):[];
  const albumCover=albumHints.length&&new Set(albumHints.map(h=>h.id)).size===1?albumHints[0].artworkUrl:undefined;
  const cover=artworkUrl??corroborated?.artworkUrl??albumCover;
  const baseKey=recordingGroupBase(corroborated?.title??displayTitle,corroborated?.artist??artist);
  const key=recordingGroupKey(corroborated?.title??displayTitle,corroborated?.artist??artist,duration);
  const existingEntry=duration===null?undefined:[...songs.entries()].find(([group,value])=>(songGroupBases.get(group)??recordingGroupBase(value.title,value.artist))===baseKey&&songGroupDurations.get(group)?.every(d=>Math.abs(d-duration)<=5));
  const groupedKey=existingEntry?.[0]??(duration===null?`${key}:${id}`:key),existing=existingEntry?.[1]??songs.get(groupedKey);
  if(duration!==null)songGroupDurations.set(groupedKey,[...(songGroupDurations.get(groupedKey)??[]),duration]);
  const priority={local:3,itunes:2,lrclib:1,musicbrainz:2};
  if((!existing&&songs.size<MUSIC_CATALOG_LIMITS.tracks)||(existing&&(priority[source]>priority[existing.source]||priority[source]===priority[existing.source]&&existing.displayTitle!==undefined&&displayTitle===title)))
   songs.set(groupedKey,Object.freeze({id,kind:'track',title,...(searchArtist?{searchArtist}:{}),...(displayTitle!==title?{displayTitle}:{}),artist,album,duration,source,...(cover?{artworkUrl:cover}:{})})),songGroupBases.set(groupedKey,baseKey);
  else if(existing&&!existing.artworkUrl&&artworkUrl)songs.set(groupedKey,Object.freeze({...existing,artworkUrl}));
  const confirmedLrclibAlbum=source==='lrclib'&&artist&&album? hints.some(h=>h.artist&&musicCatalogKey(h.title)===musicCatalogKey(album)&&musicCatalogKey(h.artist)===musicCatalogKey(artist))||editions.some(e=>musicCatalogKey(e.title)===musicCatalogKey(album)&&musicCatalogKey(e.artist)===musicCatalogKey(artist)):false;
  if((source==='local'||confirmedLrclibAlbum)&&album&&albumMatches(q,album,artist)&&!singleCollection(album,artist)&&!(corroborated&&singleIds.has(corroborated.releaseId))){
   // A local collaboration is not another edition of the same album. Use only
   // the corroborating recording's declared collection identity/credit; never
   // split a performer string or rewrite the chosen recording's metadata.
   const declaredAlbums=corroborated?[...hints,...editions].filter(h=>h.id===corroborated.releaseId&&musicCatalogKey(h.title)===musicCatalogKey(album)&&h.artist):[];
   const declaredArtist=declaredAlbums.length&&new Set(declaredAlbums.map(h=>musicCatalogKey(h.artist!))).size===1?declaredAlbums[0].artist:null;
   const albumArtist=corroborated?.primaryArtist??declaredArtist??artist;
   const albumKey=JSON.stringify([musicCatalogKey(albumArtist??''),musicCatalogKey(album)]);
   if(!albums.has(albumKey)&&albums.size<MUSIC_CATALOG_LIMITS.albums)albums.set(albumKey,Object.freeze({id:'album:'+albumKey,kind:'album',title:album,artist:albumArtist,album,duration:null,source}));
  }
 };
 for(const hint of hints){
  if(singleIds.has(hint.id)||!albumMatches(q,hint.title,hint.artist))continue;
  const key='hint:'+hint.id;
  if(!albums.has(key)&&albums.size<MUSIC_CATALOG_LIMITS.albums)albums.set(key,Object.freeze({id:'itunes:album:'+hint.id,kind:'album',editionId:hint.id,title:hint.title,artist:hint.artist,album:hint.title,duration:null,source:'itunes',...(hint.artworkUrl?{artworkUrl:hint.artworkUrl}:{})}));
 }
 const rankedLocal=local.map((t,index)=>({t,index,score:score(q,t.title,t.artist,t.album)}))
  .filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,MUSIC_CATALOG_LIMITS.localMatches);
 for(const {t} of rankedLocal)add('local:'+t.id,t.title,t.artist,t.album,Number.isFinite(t.duration)?t.duration:null,'local');
 for(const t of songHints.slice().sort((a,b)=>score(q,b.title,b.artist,b.album)-score(q,a.title,a.artist,a.album)))add(`itunes:${t.releaseId}:${t.disc}:${t.position}:${t.trackId}`,t.title,t.artist,t.album,t.durationMs/1000,'itunes',t.artworkUrl,t.primaryArtist,t.releaseId);
 // Some scraped LRCLIB entries include a media label in the performer field.
 // Suppress only a corroborated duplicate with placeholder album metadata; do
 // not rewrite full credits, merge distinct versions or guess a missing artist.
 const reliableRemote=remote.filter(t=>{
  // A zero length result is malformed metadata, not a usable recording.
  if(!Number.isFinite(t.duration)||t.duration<=0)return false;
  if(!['','null','undefined'].includes(musicCatalogKey(t.albumName)))return true;
  const label=t.artistName.match(/^(?:song|canción|video)\s*(?:[•·]|,)\s*(.+)$/iu);
  if(!label)return true;
  return !remote.some(other=>other!==t&&musicCatalogKey(other.artistName)===musicCatalogKey(label[1])&&musicCatalogKey(displayTrackTitle(other.trackName,other.artistName))===musicCatalogKey(displayTrackTitle(t.trackName,label[1]))&&Math.abs(other.duration-t.duration)<=5);
 });
 for(const {t} of reliableRemote.map((t,index)=>({t,index,score:score(q,t.trackName,t.artistName,t.albumName||null)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.index-b.index))add('lrclib:'+t.id,t.trackName,t.artistName,['null','undefined'].includes(musicCatalogKey(t.albumName))?null:t.albumName||null,t.duration,'lrclib');
 const ranked=[...songs.values()].map((choice,index)=>({choice,index,score:score(q,choice.title,choice.artist,choice.album)}))
  .sort((a,b)=>b.score-a.score||a.index-b.index).map(item=>item.choice);
 const editionChoices:MusicCatalogChoice[]=editions.filter(e=>e.trackCount!==1&&albumMatches(q,e.title,e.artist)).slice().sort((a,b)=>score(q,b.title,b.artist,null)-score(q,a.title,a.artist,null)).map(e=>Object.freeze({id:(typeof e.id==='string'?'musicbrainz:album:':'itunes:album:')+e.id,kind:'album',editionId:e.id,title:e.title,artist:e.artist,album:e.title,duration:null,source:typeof e.id==='string'?'musicbrainz':'itunes',artworkUrl:e.artworkUrl}));
 // A pending candidate deliberately has no recording ID or duration. Only an
 // explicit selection may resolve it through the catalogue's bounded cache.
 const pendingSingles:MusicCatalogChoice[]=singles.filter(e=>{
  if(!albumMatches(q,e.title,e.artist)||songHints.some(t=>t.releaseId===e.id))return false;
  const known=[...songs.values()].filter(t=>t.kind==='track'&&t.album!==null&&sameCollection(e,t.album,t.artist));
  return !singleCollection(e.title,e.artist)||known.length!==1||known[0].duration===null||known[0].duration<=0;
 }).slice(0,Math.max(0,MUSIC_CATALOG_LIMITS.tracks-ranked.length)).map(e=>Object.freeze({id:'single-edition:'+e.id,kind:'track',pendingEditionId:e.id,title:e.title,artist:e.artist,album:e.title,duration:null,source:typeof e.id==='string'?'musicbrainz':'itunes',artworkUrl:e.artworkUrl}));
 const artistChoices:MusicCatalogChoice[]=artists.filter(a=>relevance(q,[a.name],true)>0).map(a=>Object.freeze({id:(typeof a.id==='string'?'musicbrainz:artist:':'itunes:artist:')+a.id,kind:'artist',artistId:a.id,title:a.name,artist:null,album:null,duration:null,source:typeof a.id==='string'?'musicbrainz':'itunes'}));
 const hintKeys=new Set(hints.filter(h=>albumMatches(q,h.title,h.artist)).map(h=>JSON.stringify([musicCatalogKey(h.artist??''),musicCatalogKey(h.title)])));
 const concreteKeys=new Set(editions.filter(e=>albumMatches(q,e.title,e.artist)).map(e=>JSON.stringify([musicCatalogKey(e.artist),musicCatalogKey(e.title)])));
 return Object.freeze([...ranked,...pendingSingles,...editionChoices,...[...albums.entries()].filter(([key,value])=>value.kind==='album'&&value.editionId!==undefined?!editions.some(e=>e.id===value.editionId||typeof e.id==='string'&&e.trackCount!==1&&musicCatalogKey(e.title)===musicCatalogKey(value.title)&&musicCatalogKey(e.artist)===musicCatalogKey(value.artist??'')):!concreteKeys.has(key)&&!hintKeys.has(key)).map(([,value])=>value).sort((a,b)=>score(q,b.title,b.artist,null)-score(q,a.title,a.artist,null)),...artistChoices]);
}
