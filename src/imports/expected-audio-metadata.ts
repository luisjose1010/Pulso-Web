import {musicIdentityText} from '../telegram/bot-search-protocol';
import {recordingTitleCandidate,recordingTitlesEquivalent} from '../library/recording-title';
/** Compatibility of declared file tags, never acoustic identity. */
export interface ExpectedAudioMetadata {sha256:string;title:string;artist:string|null;recordingTitle?:string;album?:string;durationSeconds?:number}
const normalized=musicIdentityText;
const fullText=(s:string)=>s.normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('es');
/** Compare parsed audio duration before creating staging or publishing an asset.
 * Normal recordings keep five seconds; the album-version alias keeps one. */
export function expectedAudioDurationMismatch(expected:Pick<ExpectedAudioMetadata,'title'|'recordingTitle'|'durationSeconds'>,actual:number|undefined):boolean {
 if(expected.durationSeconds===undefined)return false;
 const tolerance=expected.recordingTitle&&normalized(expected.recordingTitle)!==normalized(expected.title)?1:5;
 return !Number.isFinite(expected.durationSeconds)||expected.durationSeconds<=0||!Number.isFinite(actual)||actual!<=0||Math.abs(actual!-expected.durationSeconds)>tolerance;
}
export function expectedAudioTagMismatch(tags:{title?:string;artist?:string;artists?:readonly string[];album?:string},expected:{title:string;artist:string|null;recordingTitle?:string;album?:string;durationSeconds?:number},durationSeconds?:number):'title'|'artist'|null {
 const contextual=expected.recordingTitle!==undefined&&expected.album!==undefined&&expected.durationSeconds!==undefined;
 if(!contextual&&(expected.recordingTitle!==undefined||expected.album!==undefined||expected.durationSeconds!==undefined))return 'title';
 const recordingAlias=contextual&&normalized(expected.recordingTitle!)!==normalized(expected.title);
 const tagAlias=!!tags.title&&normalized(tags.title)!==normalized(expected.title);
 if(recordingAlias||tagAlias){
  if(!contextual||!expected.recordingTitle||!expected.album?.trim()||!tags.title||!tags.album?.trim()||fullText(tags.album)!==fullText(expected.album)||typeof durationSeconds!=='number'||!Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>86400||typeof expected.durationSeconds!=='number'||!Number.isFinite(expected.durationSeconds)||expected.durationSeconds<=0||expected.durationSeconds>86400||Math.abs(durationSeconds-expected.durationSeconds)>1||!recordingTitleCandidate(expected.recordingTitle,expected.title,expected.album,expected.durationSeconds)||!recordingTitlesEquivalent(tags.title,expected.title,{actualAlbum:tags.album,expectedAlbum:expected.album,actualDurationSeconds:durationSeconds,expectedDurationSeconds:expected.durationSeconds}))return 'title';
  const declared=[...(tags.artists??[]),...(tags.artist?[tags.artist]:[])].filter(value=>value.trim());
  if(!expected.artist||!declared.length||declared.some(value=>fullText(value)!==fullText(expected.artist!)))return 'artist';
  return null;
 }
 if(tags.title&&normalized(tags.title)!==normalized(expected.title))return 'title';
 if(!expected.artist||!tags.artist&&!tags.artists?.length)return null;
 const artist=normalized(expected.artist),values=[...(tags.artists??[]),...(tags.artist?[tags.artist]:[])];
 const delimiters=['\u0000',';','/',','].filter(d=>!expected.artist!.includes(d));
 const members=(value:string)=>delimiters.reduce<string[]>((parts,d)=>parts.flatMap(p=>p.split(d)),[value]);
 return values.some(value=>normalized(value)===artist||members(value).some(name=>normalized(name)===artist))?null:'artist';
}
