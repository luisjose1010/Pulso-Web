import type {CatalogId} from './catalog-id';
import type {AlbumRow,AlbumProgress} from './album-acquisition';
export interface AlbumDownloadRun {scope:string;editionId:CatalogId;key:string;title:string;abort:AbortController}
export interface AlbumCoordinator {
 running:boolean;uncertainTracks:Set<CatalogId>;remoteClock:{settledAt:number};
 rows:Map<CatalogId,{key:string;rows:AlbumRow[];message?:string}>;listeners:Set<()=>void>;
 active?:AlbumDownloadRun;notice?:{title:string;progress:AlbumProgress};
}
/** Page-local work belongs to the explicit album action, not to a route. The
 * original storage/session/owner guards still govern every acquisition step. */
export const albumCoordinator:AlbumCoordinator={running:false,uncertainTracks:new Set(),remoteClock:{settledAt:0},rows:new Map(),listeners:new Set()};
export function notifyAlbumDownload(coordinator:AlbumCoordinator){for(const notify of coordinator.listeners)notify();}
