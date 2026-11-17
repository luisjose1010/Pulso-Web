import type {AlbumCatalog,AlbumEdition,AlbumRequest} from './album-catalog';
import type {CatalogId} from './catalog-id';
import {albumTrackChoice} from './album-acquisition';
import type {SongChoice} from './selected-song';

/** Resolve only after a search gesture. The catalogue owns quotas, cache and
 * transport cancellation; a collection is never used as a recording identity. */
export async function resolveSearchSingle(catalog:Pick<AlbumCatalog,'load'>,id:CatalogId,request:AlbumRequest):Promise<
 {state:'song';choice:SongChoice}|{state:'changed';edition:AlbumEdition}|{state:'unavailable'}|{state:'cancelled'}
> {
 const active=()=>{try{return !request.signal.aborted&&request.current()===true;}catch{return false;}};
 if(!active())return {state:'cancelled'};
 try{
  const result=await catalog.load(id,request);
  if(!active())return {state:'cancelled'};
  if(!result.ok)return {state:'unavailable'};
  const {edition,tracks}=result.value;
  if(edition.id!==id)return {state:'unavailable'};
  if(edition.trackCount!==1)return {state:'changed',edition};
  if(tracks.length!==1||tracks[0].releaseId!==id||tracks[0].disc!==1||tracks[0].position!==1)return {state:'unavailable'};
  return {state:'song',choice:albumTrackChoice(tracks[0],edition.title)};
 }catch{return active()?{state:'unavailable'}:{state:'cancelled'};}
}
