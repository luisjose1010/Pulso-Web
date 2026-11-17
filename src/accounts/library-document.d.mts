import type {LocalAlbumMetadataV1} from '../library/album-metadata';
import type {SongChoice} from '../library/selected-song';
export interface AccountLibraryTrack {id:string;title:string;artist:string|null;album:string|null;duration:number;favorite:boolean;inLibrary:boolean;createdAt:string;localAlbum:LocalAlbumMetadataV1|null;catalog:SongChoice|null}
export interface AccountLibraryPlaylist {id:string;name:string;entries:{id:string;trackId:string}[]}
export interface AccountLibraryDocument {version:1;tracks:AccountLibraryTrack[];playlists:AccountLibraryPlaylist[]}
export const LIBRARY_LIMITS:Readonly<{bytes:number;tracks:number;playlists:number;entries:number}>;
export function libraryUuid(value:unknown):value is string;
export function emptyLibrary():AccountLibraryDocument;
export function validateAccountLibrary(value:unknown):AccountLibraryDocument;
export function copyAccountCatalog(value:unknown):SongChoice|null;
export function mergeAccountLibraries(base:AccountLibraryDocument,local:AccountLibraryDocument,remote:AccountLibraryDocument):AccountLibraryDocument;
