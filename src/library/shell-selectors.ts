import type {Track, Playlist} from './library';
export type AvailabilityState = 'available'|'missing'|'invalid'|'unknown'|'metadata-only';
export interface AvailabilityRecord {generation:string;state:'available'|'missing'|'invalid'}
/** Cache entries are usable only for the asset generation observed by refresh. No IO here. */
export function trackAvailability(track:Track, cache:ReadonlyMap<string,AvailabilityRecord>):AvailabilityState {
 if(track.assetId===null)return 'metadata-only';
 return cache.get(track.id)?.state??'unknown';
}
export function availabilityText(state:AvailabilityState):string {
 return {available:'Copia local presente; se comprobará al reproducir.',missing:'Sin descarga en este dispositivo. Selecciona la canción para descargarla con Telegram.',invalid:'Copia local inválida. Se conserva la ficha.',unknown:'Disponibilidad sin comprobar.', 'metadata-only':'Ficha sin audio en este dispositivo. Selecciona la canción para descargarla con Telegram.'}[state];
}
export function recentTracks(tracks:readonly Track[]):Track[] {
 return [...tracks].sort((a,b)=>{const x=Date.parse(a.createdAt),y=Date.parse(b.createdAt);return (Number.isFinite(y)?y:-Infinity)-(Number.isFinite(x)?x:-Infinity)||a.id.localeCompare(b.id);}).slice(0,6);
}
export function homePlaylists(lists:readonly Playlist[]):Playlist[]{return [...lists].sort((a,b)=>a.name.localeCompare(b.name,'es')||a.id.localeCompare(b.id)).slice(0,6);}
export interface ShellView {query:string;listId:string;groupMode:'tracks'|'artists'|'albums';groupKey:string;favorites:boolean;present:boolean}
export const emptyShellView=():ShellView=>({query:'',listId:'',groupMode:'tracks',groupKey:'',favorites:false,present:false});
export const normalizeSearch=(s:string)=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es');
export function matchesShellTrack(track:Track,view:ShellView,cache:ReadonlyMap<string,AvailabilityRecord>):boolean {
 return (!view.favorites||track.favorite)&&(!view.present||trackAvailability(track,cache)==='available')&&normalizeSearch(`${track.title} ${track.artist??''} ${track.album??''}`).includes(normalizeSearch(view.query));
}
