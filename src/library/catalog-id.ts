/** Provider identity is explicit; MusicBrainz UUIDs never masquerade as Apple IDs. */
export type MusicBrainzId=`musicbrainz:${string}`;
export type CatalogId=number|MusicBrainzId;
export const MB_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function musicBrainzId(id:unknown):id is MusicBrainzId{return typeof id==='string'&&id.startsWith('musicbrainz:')&&MB_UUID.test(id.slice(12));}
export function musicBrainzArtwork(id:MusicBrainzId):string|undefined{
 return typeof location==='undefined'?undefined:new URL('/catalog/musicbrainz/artwork?id='+id.slice(12),location.origin).href;
}
export function musicBrainzArtworkUrl(value:unknown):string|null{
 if(typeof location==='undefined'||typeof value!=='string'||value.length>300)return null;
 try{const u=new URL(value,location.origin);return u.origin===location.origin&&u.pathname==='/catalog/musicbrainz/artwork'&&[...u.searchParams].length===1&&MB_UUID.test(u.searchParams.get('id')??'')&&!u.hash&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
