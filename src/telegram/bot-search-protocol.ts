import {AUDIO_FILE_MAX_BYTES} from '../storage/audio-limits';
import {dataArray,dataRecord,isUuid,parseAccountBinding,utf8Bytes,type AccountBinding} from './sources-protocol';
import {recordingTitleCandidate} from '../library/recording-title';
export const BOT_SEARCH_BOUNDS=Object.freeze({queryPoints:160,rows:20,keyboardRows:64,candidateRows:128,rawBytes:65536,dtoBytes:32768,timeoutMs:15000,pollMs:1000,reads:16,downloadReads:60,requestIds:256,settlementMs:2000,resultTtlMs:120000,downloadMs:120000});
// Catalogue and file metadata may differ by a few seconds. This never relaxes
// the required title/performer/version match or the ranking by closest duration.
export const BOT_SEARCH_DURATION_TOLERANCE_SECONDS=5;
export interface BotSearchEnvelope extends AccountBinding {readonly protocol:'pulso-bot-search';readonly version:1;readonly sessionId:string;readonly providerRevision:number;readonly queryId:string;readonly requestId:string}
export interface BotSearchTarget {readonly title:string;readonly artist:string|null;readonly album:string|null;readonly durationSeconds:number|null}
export type BotSearchCommand=
 |(BotSearchEnvelope&{readonly type:'bot-search.search';readonly providerRef:string;readonly query:string;readonly consent:true;readonly target?:BotSearchTarget})
 |(BotSearchEnvelope&{readonly type:'bot-search.download';readonly providerRef:string;readonly rowRef:string;readonly target:BotSearchTarget;readonly consent:true})
 |(BotSearchEnvelope&{readonly type:'bot-search.cancel';readonly targetRequestId:string});
/** Closed non-content diagnostics. No counts, query, peer or account data. */
export const BOT_SEARCH_LIMIT_DIAGNOSTICS=Object.freeze({
 'limit-requests':'L01','limit-query':'L02','limit-raw-bytes':'L03','limit-raw-nodes':'L04',
 'limit-raw-depth':'L05','limit-raw-references':'L06','limit-binary':'L07','limit-raw-slots':'L08',
 'limit-baseline':'L09','limit-history':'L10','limit-updates':'L11','limit-keyboard-rows':'L12',
 'limit-keyboard-buttons':'L13','limit-candidates':'L14','limit-attempt':'L15','limit-document-attributes':'L16',
} as const);
export type BotSearchLimitError=keyof typeof BOT_SEARCH_LIMIT_DIAGNOSTICS;
export function isBotSearchLimitError(value:unknown):value is BotSearchLimitError {return typeof value==='string'&&Object.hasOwn(BOT_SEARCH_LIMIT_DIAGNOSTICS,value);}
export type BotSearchError='cancelled'|'timeout'|'busy'|'expired'|'session-expired'|'limit'|'unsupported'|'identity-changed'|'rate-limit'|'network'|'uncertain'|'needs-start'|'file-too-large'|'file-invalid'|'conflict'|BotSearchLimitError;
export type BotSearchDelivery='not-dispatched'|'uncertain'|'acknowledged';
interface Row {readonly rowRef:string;readonly correlation:'reply'|'recent'}
export type BotSearchRow=
 |(Row&{readonly kind:'audio';readonly title:string|null;readonly performer:string|null;readonly durationSeconds:number;readonly mimeType:string;readonly bytes:number})
 |(Row&{readonly kind:'option';readonly label:string})
 |(Row&{readonly kind:'message';readonly text:string});
export type BotDownloadedAudio=Readonly<{blob:Blob;bytes:number;mime:'audio/mpeg'|'audio/mp4'|'audio/wav';sha256:string;target:BotSearchTarget;recordingTitle?:string}>;
export type BotSearchReply=
 |(BotSearchEnvelope&{readonly type:'bot-search.provider-notice';readonly text:string})
 |(BotSearchEnvelope&{readonly type:'bot-search.download-progress';readonly bytes:number;readonly total:number})
 |(BotSearchEnvelope&{readonly type:'bot-search.downloaded';readonly audio:BotDownloadedAudio})
 |(BotSearchEnvelope&{readonly type:'bot-search.sending';readonly delivery:'uncertain'})
 |(BotSearchEnvelope&{readonly type:'bot-search.result';readonly delivery:'acknowledged';readonly rows:readonly BotSearchRow[];readonly expiresAt:number;readonly expectedTarget:BotSearchTarget|null})
 |(BotSearchEnvelope&{readonly type:'bot-search.error';readonly error:BotSearchError;readonly delivery:BotSearchDelivery;readonly retryAt:number|null;readonly retryBlocked:boolean})
 |(BotSearchEnvelope&{readonly type:'bot-search.cancelled';readonly targetRequestId:string});
const revision=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const timestamp=(v:unknown):v is number=>revision(v)&&v>0&&v<=8640000000000000;
const keys=['protocol','version','sessionId','accountRef','accountEpoch','providerRevision','queryId','requestId'] as const;
export function copyBotSearchEnvelope(e:BotSearchEnvelope):BotSearchEnvelope {return Object.freeze({protocol:'pulso-bot-search',version:1,sessionId:e.sessionId,accountRef:e.accountRef,accountEpoch:e.accountEpoch,providerRevision:e.providerRevision,queryId:e.queryId,requestId:e.requestId});}
function envelope(r:Record<string,unknown>):BotSearchEnvelope|null {
 return parseAccountBinding({accountRef:r.accountRef,accountEpoch:r.accountEpoch})&&r.protocol==='pulso-bot-search'&&r.version===1&&isUuid(r.sessionId)&&revision(r.providerRevision)&&isUuid(r.queryId)&&isUuid(r.requestId)?copyBotSearchEnvelope(r as unknown as BotSearchEnvelope):null;
}
export function isBotSearchQuery(v:unknown):v is string {
 return typeof v==='string'&&v.length<=320&&v===v.trim()&&v.length>0&&Array.from(v).length<=160&&!v.startsWith('/')&&!/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u.test(v);
}
/** Text only. Caller renders React text, never HTML/markdown/URLs/actions. */
export function botSearchText(v:unknown,max=160):string|null {
 if(typeof v!=='string'||v.length>8192)return null;
 const s=Array.from(v.normalize('NFC').replace(/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/gu,' ').trim()).slice(0,max).join('');return s||null;
}
function text(v:unknown,max=160):v is string {return typeof v==='string'&&v.length<=max*2&&utf8Bytes(v)<=max*4&&botSearchText(v,max)===v;}
export function parseBotSearchTarget(raw:unknown):BotSearchTarget|null {
 const r=dataRecord(raw,['title','artist','album','durationSeconds']);
 if(!r||!text(r.title)||r.artist!==null&&!text(r.artist)||r.album!==null&&!text(r.album)||r.durationSeconds!==null&&(typeof r.durationSeconds!=='number'||!Number.isFinite(r.durationSeconds)||r.durationSeconds<0||r.durationSeconds>86400))return null;
 return Object.freeze({title:r.title,artist:r.artist as string|null,album:r.album as string|null,durationSeconds:r.durationSeconds as number|null});
}
/** Unknown album/duration syntax is deliberately never sent. Keeps version/live/remix text. */
export function formatBotSearchQuery(command:Extract<BotSearchCommand,{type:'bot-search.search'}>):string|null {
 const v=command.target?`${command.target.title}${command.target.artist?' '+command.target.artist:''}`:command.query;
 return isBotSearchQuery(v)?v:null;
}
function row(raw:unknown):BotSearchRow|null {
 const r=dataRecord(raw);if(!r||!isUuid(r.rowRef)||r.correlation!=='reply'&&r.correlation!=='recent')return null;
 const base:Row={rowRef:r.rowRef,correlation:r.correlation};let extra:string[],out:BotSearchRow;
 switch(r.kind){
 case 'option':if(!text(r.label))return null;extra=['label'];out={...base,kind:'option',label:r.label};break;
 case 'message':if(!text(r.text,1000))return null;extra=['text'];out={...base,kind:'message',text:r.text};break;
 case 'audio':
  if(r.title!==null&&!text(r.title)||r.performer!==null&&!text(r.performer)||typeof r.durationSeconds!=='number'||!Number.isFinite(r.durationSeconds)||r.durationSeconds<0||r.durationSeconds>86400||typeof r.mimeType!=='string'||!/^audio\/[a-z0-9.+-]{1,64}$/.test(r.mimeType)||!revision(r.bytes)||r.bytes===0)return null;
  extra=['title','performer','durationSeconds','mimeType','bytes'];out={...base,kind:'audio',title:r.title as string|null,performer:r.performer as string|null,durationSeconds:r.durationSeconds,mimeType:r.mimeType,bytes:r.bytes};break;
 default:return null;
 }
 return dataRecord(raw,['rowRef','correlation','kind',...extra])?Object.freeze(out):null;
}
export function parseBotSearchCommand(raw:unknown):BotSearchCommand|null {
 try{const r=dataRecord(raw);if(!r)return null;const e=envelope(r);if(!e)return null;let extra:string[],out:BotSearchCommand;
 if(r.type==='bot-search.search'){if(!isUuid(r.providerRef)||!isBotSearchQuery(r.query)||r.consent!==true)return null;const target=r.target===undefined?undefined:parseBotSearchTarget(r.target);if(target===null)return null;extra=['providerRef','query','consent',...(target?['target']:[])];out={...e,type:r.type,providerRef:r.providerRef,query:r.query,consent:true,...(target?{target}:{})};}
 else if(r.type==='bot-search.download'){const target=parseBotSearchTarget(r.target);if(!isUuid(r.providerRef)||!isUuid(r.rowRef)||!target||r.consent!==true)return null;extra=['providerRef','rowRef','target','consent'];out={...e,type:r.type,providerRef:r.providerRef,rowRef:r.rowRef,target,consent:true};}
 else if(r.type==='bot-search.cancel'){if(!isUuid(r.targetRequestId))return null;extra=['targetRequestId'];out={...e,type:r.type,targetRequestId:r.targetRequestId};}else return null;
 return dataRecord(raw,[...keys,'type',...extra])&&utf8Bytes(JSON.stringify(out))<=BOT_SEARCH_BOUNDS.dtoBytes?Object.freeze(out):null;}catch{return null;}
}
export function parseBotSearchReply(raw:unknown,expected:BotSearchEnvelope):BotSearchReply|null {
 try{const r=dataRecord(raw);if(!r)return null;const e=envelope(r);if(!e||keys.some(k=>e[k]!==expected[k]))return null;let extra:string[],out:BotSearchReply;
 switch(r.type){
 case 'bot-search.provider-notice':if(!text(r.text,500))return null;extra=['text'];out={...e,type:r.type,text:r.text};break;
 case 'bot-search.download-progress':if(!revision(r.bytes)||!revision(r.total)||r.total<=0||r.total>AUDIO_FILE_MAX_BYTES||r.bytes>r.total)return null;extra=['bytes','total'];out={...e,type:r.type,bytes:r.bytes,total:r.total};break;
 case 'bot-search.downloaded':{const audio=parseBotDownloadedAudio(r.audio);if(!audio)return null;extra=['audio'];out={...e,type:r.type,audio};break;}
 case 'bot-search.sending':if(r.delivery!=='uncertain')return null;extra=['delivery'];out={...e,type:r.type,delivery:'uncertain'};break;
 case 'bot-search.cancelled':if(!isUuid(r.targetRequestId))return null;extra=['targetRequestId'];out={...e,type:r.type,targetRequestId:r.targetRequestId};break;
 case 'bot-search.result':{const a=dataArray(r.rows,20);if(!a||!a.length||r.delivery!=='acknowledged'||!timestamp(r.expiresAt))return null;const rows=a.map(row);if(!rows.every((x):x is BotSearchRow=>x!==null)||new Set(rows.map(x=>x.rowRef)).size!==rows.length)return null;const expectedTarget=r.expectedTarget===null?null:parseBotSearchTarget(r.expectedTarget);if(r.expectedTarget!==null&&!expectedTarget)return null;extra=['delivery','rows','expiresAt','expectedTarget'];out={...e,type:r.type,delivery:'acknowledged',rows:Object.freeze(rows),expiresAt:r.expiresAt,expectedTarget};break;}
 case 'bot-search.error':
  if(!(['cancelled','timeout','busy','expired','session-expired','limit','unsupported','identity-changed','rate-limit','network','uncertain','needs-start','file-too-large','file-invalid','conflict'].includes(r.error as string)||isBotSearchLimitError(r.error))||!['not-dispatched','uncertain','acknowledged'].includes(r.delivery as string)||r.retryAt!==null&&!timestamp(r.retryAt)||typeof r.retryBlocked!=='boolean'||(r.error==='rate-limit'?(r.retryBlocked!==(r.retryAt===null)):(r.retryAt!==null||r.retryBlocked)))return null;
  extra=['error','delivery','retryAt','retryBlocked'];out={...e,type:r.type,error:r.error as BotSearchError,delivery:r.delivery as BotSearchDelivery,retryAt:r.retryAt as number|null,retryBlocked:r.retryBlocked};break;
 default:return null;
 }
 return dataRecord(raw,[...keys,'type',...extra])&&utf8Bytes(JSON.stringify(out))<=BOT_SEARCH_BOUNDS.dtoBytes?Object.freeze(out):null;}catch{return null;}
}

const blobSize=Object.getOwnPropertyDescriptor(Blob.prototype,'size')!.get!;
const blobType=Object.getOwnPropertyDescriptor(Blob.prototype,'type')!.get!;
export function parseBotDownloadedAudio(raw:unknown):BotDownloadedAudio|null {
 try{
  const r=dataRecord(raw),required=['blob','bytes','mime','sha256','target'];
  if(!r||required.some(k=>!Object.hasOwn(r,k))||Object.keys(r).some(k=>!required.includes(k)&&k!=='recordingTitle')||!revision(r.bytes)||r.bytes<=0||r.bytes>AUDIO_FILE_MAX_BYTES||!['audio/mpeg','audio/mp4','audio/wav'].includes(r.mime as string)||typeof r.sha256!=='string'||! /^[a-f0-9]{64}$/.test(r.sha256)||blobSize.call(r.blob)!==r.bytes||blobType.call(r.blob)!==r.mime)return null;
  const target=parseBotSearchTarget(r.target);if(!target)return null;
  const recordingTitle=Object.hasOwn(r,'recordingTitle')?botSearchText(r.recordingTitle,300):undefined;
  if(Object.hasOwn(r,'recordingTitle')&&(!recordingTitle||!target.album||target.durationSeconds===null||target.durationSeconds<=0||!recordingTitleCandidate(recordingTitle,target.title,target.album,target.durationSeconds)))return null;
  return Object.freeze({blob:r.blob as Blob,bytes:r.bytes,mime:r.mime as BotDownloadedAudio['mime'],sha256:r.sha256,target,...(recordingTitle?{recordingTitle}:{})});
 }catch{return null;}
}

// Presentation normalization; never acoustic identity or a substitute for worker peer/epoch checks.
export const musicIdentityText=(s:string)=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

/** A zero Telegram duration is not evidence of a zero-length recording.
 * Permit byte inspection only for an exact title/full credit with a positive
 * catalogue duration and album; the importer must verify the actual duration. */
export function canCheckBotDurationFromFile(row:Extract<BotSearchRow,{kind:'audio'}>,target:BotSearchTarget):boolean {
 return row.durationSeconds===0&&target.durationSeconds!==null&&target.durationSeconds>0&&!!target.album?.trim()&&!!row.title&&musicIdentityText(row.title)===musicIdentityText(target.title)&&!!target.artist&&!!row.performer&&musicIdentityText(row.performer)===musicIdentityText(target.artist);
}

export type BotAudioMismatchField='title-version'|'artist'|'duration';
/** Closed local observation only: no metadata values, ids or acoustic claims.
 * Title/version stay combined because the catalogue supplies one title string. */
export function botAudioMismatchFields(row:Extract<BotSearchRow,{kind:'audio'}>,target:BotSearchTarget):readonly BotAudioMismatchField[] {
 const fields:BotAudioMismatchField[]=[];
 if(!row.title||!recordingTitleCandidate(row.title,target.title,target.album,target.durationSeconds))fields.push('title-version');
 if(!target.artist||!row.performer||musicIdentityText(row.performer)!==musicIdentityText(target.artist))fields.push('artist');
 const tolerance=row.title&&musicIdentityText(row.title)===musicIdentityText(target.title)?BOT_SEARCH_DURATION_TOLERANCE_SECONDS:1;
 if(target.durationSeconds!==null&&!canCheckBotDurationFromFile(row,target)&&Math.abs(target.durationSeconds-row.durationSeconds)>tolerance)fields.push('duration');
 return fields;
}

// The downloader accepts only these containers and one file up to AUDIO_FILE_MAX_BYTES.
// A row it would reject must never outrank one it can fetch: selection is a single attempt.
const DOWNLOADABLE_MIME=new Set(['audio/mpeg','audio/mp4','audio/wav']);
const downloadableRow=(row:BotSearchRow):boolean=>row.kind!=='audio'||row.bytes<=AUDIO_FILE_MAX_BYTES&&DOWNLOADABLE_MIME.has(row.mimeType);
/** Coarse bitrate tier (average kbps = bytes*8/seconds). Tiers, not raw kbps, so VBR and tag
 * overhead cannot reorder files of the same quality; equal tiers keep the bot's order. */
const qualityTier=(row:BotSearchRow):number=>{
 if(row.kind!=='audio'||row.durationSeconds<=0)return 0;
 const kbps=row.bytes*8/row.durationSeconds/1000;
 return kbps>=256?3:kbps>=160?2:kbps>=96?1:0;
};

/** Rank compatible recordings: downloadable first, then closest duration, then audio quality tier,
 * then keep the bot's order.
 * Only presentation decoration is ignored; title, performer and version words
 * still have to match. Raw callback data never contributes to the score. */
export function matchingSongRows(rows:readonly BotSearchRow[],target:BotSearchTarget):readonly BotSearchRow[] {
 if(!target.artist)return [];
 const title=musicIdentityText(target.title),artist=musicIdentityText(target.artist);
 const score=(row:BotSearchRow):number=>{
  const correlation=row.correlation==='reply'?1:0;
  if(row.kind==='audio'){
   if(!row.title||!row.performer||!recordingTitleCandidate(row.title,target.title,target.album,target.durationSeconds)||musicIdentityText(row.performer)!==artist)return 0;
   const fileCheck=canCheckBotDurationFromFile(row,target);
   const delta=target.durationSeconds===null||fileCheck?0:Math.abs(target.durationSeconds-row.durationSeconds);
   const tolerance=musicIdentityText(row.title)===title?BOT_SEARCH_DURATION_TOLERANCE_SECONDS:1;
   return delta<=tolerance?(fileCheck?3000:4000)-Math.round(delta*100)+correlation:0;
  }
  if(row.kind!=='option')return 0;
  const matches=(label:string)=>label.split(/\s+[–—−-]\s+/u).some((_,i,parts)=>{
   if(i>=parts.length-1)return false;
   const left=parts.slice(0,i+1).join(' - '),right=parts.slice(i+1).join(' - ');
   return recordingTitleCandidate(left,target.title,target.album,target.durationSeconds)&&musicIdentityText(right)===artist||
    musicIdentityText(left)===artist&&recordingTitleCandidate(right,target.title,target.album,target.durationSeconds);
  });
  if(matches(row.label))return 2000+correlation;
  // Numbered results and an optional displayed duration are formatting only.
  // Do not strip live/remix/cover/version text or words from the performer.
  const clean=row.label.replace(/^\s*(?:#\d{1,3}\s+|\d{1,3}\s*[.)]\s*)/u,'').replace(/\s*[[(]\d{1,2}:[0-5]\d[)\]]\s*$/u,'');
  return matches(clean)?1900+correlation:0;
 };
 // Telegram reports whole seconds while the catalogue has milliseconds, so two encodes of one
 // recording often differ by a fraction. Quality decides inside the same whole-second bucket;
 // the exact difference only breaks ties after it.
 const bucket=(row:BotSearchRow,value:number)=>row.kind==='audio'?Math.ceil((value-(row.correlation==='reply'?1:0))/100)*100:value;
 return rows.map((row,index)=>{const value=score(row);return {row,index,score:value,coarse:bucket(row,value),usable:downloadableRow(row),tier:qualityTier(row)};}).filter(v=>v.score>0)
  .sort((a,b)=>Number(b.usable)-Number(a.usable)||b.coarse-a.coarse||b.tier-a.tier||b.score-a.score||a.index-b.index).map(v=>v.row);
}
