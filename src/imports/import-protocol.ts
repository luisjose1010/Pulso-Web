import {copyAccountCatalog} from '../accounts/library-document.mjs';
import {recordingTitleCandidate} from '../library/recording-title';
import type {ExpectedAudioMetadata} from './expected-audio-metadata';
export type {ExpectedAudioMetadata} from './expected-audio-metadata';
import {copyLocalAlbumMetadata} from '../library/album-metadata';
import {plain} from '../diagnostics/contract';
import {copyOutcomeV1,makeOutcome,workerFailureOutcome,type OutcomeV1} from './import-outcome';
import type {DetailedImportResult} from './import-outcome';
export const IMPORT_PROTOCOL_VERSION=2;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v:unknown,max:number,min=0):v is string=>typeof v==='string'&&v.length>=min&&v.length<=max;
const member=(v:unknown,list:readonly string[])=>typeof v==='string'&&list.includes(v);
const art=['image-size','image-format','image-structure','image-dimensions','decode-unavailable','decode-failed','tag-size','tag-invalid','tag-unsupported','format-not-inspected','storage-failed','conflict'];
const embedded=['payload-size','walk-limit','tag-invalid','tag-unsupported','encoding-unsupported','sylt-frames','format-not-inspected','lyrics-invalid','lyrics-limit'];
const lyrics=[...embedded,'size','lines','line-size','unicode','format','timestamp','offset','cues','track','conflict','corrupt','storage','quota','locks'];
function optionalRecord(value:unknown,required:readonly string[],optional:readonly string[]):Record<string,unknown>|null{
 try{
 if(!value||typeof value!=='object')return null;
 const keys=Reflect.ownKeys(value);if(keys.some(k=>typeof k!=='string'||![...required,...optional].includes(k))||required.some(k=>!keys.includes(k)))return null;
 return plain(value,keys as string[]);
 }catch{return null;}
}
function array(value:unknown,max:number):unknown[]|null{
 try{
 if(!Array.isArray(value))return null;
 const d=Object.getOwnPropertyDescriptor(value,'length');if(!d||!integer(d.value,0,max))return null;
 if(Reflect.ownKeys(value).length!==d.value+1)return null;
 const result=[];for(let i=0;i<d.value;i++){const p=Object.getOwnPropertyDescriptor(value,String(i));if(!p||!('value'in p))return null;result.push(p.value);}return result;
 }catch{return null;}
}
function trackCopy(value:unknown){
 const t=optionalRecord(value,['id','assetId','title','artist','album','duration','favorite','revision','createdAt','manualOverrides'],['audioFingerprint','organizationRef','localAlbum','accountId','catalogChoice']);if(!t)return null;
 if(!uuid(t.id)||!uuid(t.assetId)||!text(t.title,300,1)||![t.artist,t.album].every(v=>v===null||text(v,300))||typeof t.duration!=='number'||!Number.isFinite(t.duration)||t.duration<=0||t.duration>1e9||typeof t.favorite!=='boolean'||!integer(t.revision,1)||!text(t.createdAt,64,1)||!Number.isFinite(Date.parse(t.createdAt)))return null;
 if(t.accountId!==undefined&&!uuid(t.accountId))return null;if(t.catalogChoice!==undefined){try{if(!copyAccountCatalog(t.catalogChoice))return null;}catch{return null;}}
 const manual=optionalRecord(t.manualOverrides,[],['title','artist','album']);if(!manual||Object.entries(manual).some(([k,v])=>!(text(v,300,k==='title'?1:0)||k!=='title'&&v===null)))return null;t.manualOverrides=manual;
 if(t.audioFingerprint===undefined)delete t.audioFingerprint;
 if(Object.hasOwn(t,'audioFingerprint')&&t.audioFingerprint!==null){const f=plain(t.audioFingerprint,['algorithm','sha256','bytes']);if(!f||f.algorithm!=='sha256'||!text(f.sha256,64)||!/^[a-f0-9]{64}$/.test(f.sha256)||!integer(f.bytes,1,100*1024*1024))return null;t.audioFingerprint=f;}
 if(Object.hasOwn(t,'organizationRef')){const r=plain(t.organizationRef,['libraryId','id']);if(!r||!uuid(r.libraryId)||!uuid(r.id))return null;t.organizationRef=r;}
 if(Object.hasOwn(t,'localAlbum')){const album=copyLocalAlbumMetadata(t.localAlbum);if(!album)return null;t.localAlbum=album;}
 return t;
}
function inspectionCopy(value:unknown):Record<string,unknown>|null{
 const header=optionalRecord(value,['state'],['reason','scope','failureCode','text','format','source','warnings','cues']);if(!header)return null;
 if(header.state==='preserved'){const p=plain(header,['state','reason']);return p&&member(p.reason,['manual','existing'])?p:null;}
 if(header.state==='absent'){const p=plain(header,['state','scope']);return p&&member(p.scope,['leading-id3v2','riff-id3','moov-ilst'])?p:null;}
 if(member(header.state,['omitted','invalid','not-inspected'])){const p=plain(header,['state','failureCode']);return p&&member(p.failureCode,embedded)?p:null;}
 if(header.state!=='ready')return null;
 const p=optionalRecord(header,['state','text','format','source','warnings'],['cues']);if(!p||!text(p.text,131072)||!member(p.format,['plain','lrc','sylt'])||new TextEncoder().encode(p.text).length>131072)return null;
 const s=plain(p.source,['kind','tag','language','descriptor']);if(!s||!member(s.kind,['embedded-id3','embedded-riff-id3','embedded-mp4'])||!member(s.tag,['USLT','SYLT','©lyr'])||!(s.language===null||text(s.language,3,3))||!text(s.descriptor,8192)||s.kind==='embedded-mp4'&&s.tag!=='©lyr'||s.kind!=='embedded-mp4'&&s.tag==='©lyr')return null;p.source=s;
 const w=array(p.warnings,32);if(!w||w.some(v=>!member(v,embedded)))return null;p.warnings=w;
 if(Object.hasOwn(p,'cues')){const cues=array(p.cues,4000);if(!cues)return null;let previous=-1,total=0;const copied=[];for(const cue of cues){const c=plain(cue,['timeMs','text']);if(!c||!integer(c.timeMs,0,86400000)||c.timeMs<previous||!text(c.text,8192))return null;total+=new TextEncoder().encode(c.text).length;if(total>131072)return null;previous=c.timeMs;copied.push(c);}p.cues=copied;}
 if(p.format==='sylt'&&!Object.hasOwn(p,'cues'))return null;
 return p;
}
export function copyImportResult(value:unknown):DetailedImportResult|null{
 const r=optionalRecord(value,['track','duplicate'],['artworkWarning','lyricsWarning','lyricsInspection']);if(!r||typeof r.duplicate!=='boolean')return null;
 const t=trackCopy(r.track);if(!t)return null;r.track=t;
 if(Object.hasOwn(r,'artworkWarning')&&!member(r.artworkWarning,art)||Object.hasOwn(r,'lyricsWarning')&&!member(r.lyricsWarning,lyrics))return null;
 if(Object.hasOwn(r,'lyricsInspection')){const i=inspectionCopy(r.lyricsInspection);if(!i)return null;r.lyricsInspection=i;}
 return r as unknown as DetailedImportResult;
}
export type ImportRequest={version:2;type:'import';operationId:string;file:File;libraryMode?:'cache';expected?:ExpectedAudioMetadata}|{version:2;type:'cancel';operationId:string};
export type RecoveryRequest={version:2;type:'recover';requestId:string;operationId:string;revision:number;action:'resume'|'discard'};
const fileSize=typeof Blob==='undefined'?undefined:Object.getOwnPropertyDescriptor(Blob.prototype,'size')?.get;
const fileName=typeof File==='undefined'?undefined:Object.getOwnPropertyDescriptor(File.prototype,'name')?.get;
export function copyWorkerRequest(value:unknown):ImportRequest|RecoveryRequest|null{
 const h=optionalRecord(value,['version','type','operationId'],['file','expected','libraryMode','requestId','revision','action']);if(!h||h.version!==2||!uuid(h.operationId))return null;
 if(h.type==='cancel'){const r=plain(h,['version','type','operationId']);return r as ImportRequest|null;}
 if(h.type==='import'){
 const r=optionalRecord(h,['version','type','operationId','file'],['expected','libraryMode']);if(!r||Object.hasOwn(r,'libraryMode')&&r.libraryMode!=='cache')return null;
 try{if(!integer(fileSize?.call(r.file),1,100*1024*1024)||typeof fileName?.call(r.file)!=='string')return null;}catch{return null;}
 if(r.expected!==undefined){const e=optionalRecord(r.expected,['sha256','title','artist'],['recordingTitle','album','durationSeconds']);if(!e||!text(e.sha256,64,64)||! /^[a-f0-9]{64}$/.test(e.sha256)||!text(e.title,300,1)||e.artist!==null&&!text(e.artist,300,1))return null;const grouped=['recordingTitle','album','durationSeconds'].filter(k=>Object.hasOwn(e,k)).length;if(grouped!==0&&grouped!==3)return null;if(grouped===3&&(!text(e.recordingTitle,300,1)||!e.recordingTitle.trim()||!text(e.album,300,1)||!e.album.trim()||typeof e.durationSeconds!=='number'||!Number.isFinite(e.durationSeconds)||e.durationSeconds<=0||e.durationSeconds>86400||!recordingTitleCandidate(e.recordingTitle,e.title,e.album,e.durationSeconds)))return null;r.expected=e;}
 return r as ImportRequest;
 }
 const r=plain(h,['version','type','operationId','requestId','revision','action']);return r&&r.type==='recover'&&uuid(r.requestId)&&integer(r.revision,1)&&member(r.action,['resume','discard'])?r as RecoveryRequest:null;
}
export type WorkerResponse={version:2;operationId:string;type:'progress';bytes:number}|{version:2;operationId:string;type:'complete';result:DetailedImportResult;outcome:OutcomeV1}|{version:2;operationId:string;type:'error';outcome:OutcomeV1}|{version:2;requestId:string;type:'recovered';state:'sealed'|'discarded';outcome:OutcomeV1}|{version:2;requestId:string;type:'error';outcome:OutcomeV1};
export function copyWorkerResponse(value:unknown):WorkerResponse|null{
 const h=optionalRecord(value,['version','type'],['operationId','requestId','bytes','result','outcome','state']);if(!h||h.version!==2)return null;
 if(h.type==='progress'){const r=plain(h,['version','operationId','type','bytes']);return r&&uuid(r.operationId)&&integer(r.bytes,0,100*1024*1024)?r as WorkerResponse:null;}
 const recovery=Object.hasOwn(h,'requestId');
 const keys=h.type==='error'?['version',recovery?'requestId':'operationId','type','outcome']:recovery?['version','requestId','type','state','outcome']:['version','operationId','type','result','outcome'];
 const r=plain(h,keys);if(!r||!uuid(r[recovery?'requestId':'operationId']))return null;
 const o=copyOutcomeV1(r.outcome);if(!o)return null;r.outcome=o;
 if(h.type==='error')return o.status!=='confirmed'?r as WorkerResponse:null;
 if(recovery){if(h.type!=='recovered'||!member(r.state,['sealed','discarded'])||o.status!=='confirmed'||o.writeState!==(r.state==='sealed'?'published':'not-published'))return null;}
 else{if(h.type!=='complete'||o.status!=='confirmed'||o.writeState!=='published')return null;const result=copyImportResult(r.result);if(!result)return null;r.result=result;}
 return r as WorkerResponse;
}
/** Capture once per exact Worker/request. Caller retains its own scope/Activity guards. */
export function createResponseGate(expected:ImportRequest|RecoveryRequest){
 const importing=expected.type==='import';const recovery=expected.type==='recover';const key=recovery?'requestId':'operationId';
 const id=expected.type==='recover'?expected.requestId:expected.operationId;
 const action=expected.type==='recover'?expected.action:null;
 const size=expected.type==='import'?fileSize?.call(expected.file):0;
 let previous=0,terminal=false;
 const protocol=()=>{terminal=true;return {kind:'protocol'} as const;};
 return (value:unknown):{kind:'ignored'}|{kind:'protocol'}|{kind:'accepted';response:WorkerResponse}=>{
 let routing:unknown;try{const d=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key):undefined;routing=d&&'value'in d?d.value:undefined;}catch{return protocol();}
 if(routing!==id||terminal)return {kind:'ignored'};
 const response=copyWorkerResponse(value);if(!response)return protocol();
 if(('requestId'in response?response.requestId:response.operationId)!==id)return protocol();
 if(recovery){
 if(!('requestId'in response)||response.type==='recovered'&&action==='discard'&&response.state!=='discarded')return protocol();
 }else{
 if(!('operationId'in response))return protocol();
 if(response.type==='progress'){if(!importing||response.bytes<previous||response.bytes>size)return protocol();previous=response.bytes;}
 }
 if(response.type!=='progress')terminal=true;
 return {kind:'accepted',response};
 };
}
/** Opt-in v2 handler. The product workers keep v1 until main is migrated together. */
export function createImportV2Handler(send:(response:WorkerResponse)=>void){
 let active:{operationId:string;controller:AbortController}|null=null;
 return async(value:unknown):Promise<boolean>=>{
 const request=copyWorkerRequest(value);if(!request||request.type==='recover')return false;
 if(request.type==='cancel'){if(active?.operationId===request.operationId)active.controller.abort();return true;}
 if(active)return false;
 const controller=new AbortController();active={operationId:request.operationId,controller};
 try{
 const {importFileDetailed}=await import('./import-file');
 const attempt=await importFileDetailed(request.file,controller.signal,bytes=>send({version:2,type:'progress',operationId:request.operationId,bytes}),{operationId:request.operationId,expected:request.expected,libraryMode:request.libraryMode});
 if(attempt.kind==='confirmed'){
 const result=copyImportResult(attempt.result);
 if(result)send({version:2,type:'complete',operationId:request.operationId,result,outcome:attempt.outcome});
 else send({version:2,type:'error',operationId:request.operationId,outcome:makeOutcome({...attempt.outcome,status:'uncertain',primary:attempt.outcome.primary??workerFailureOutcome('worker-protocol').primary,writeState:'published',recoveryRequired:true})});
 }
 else send({version:2,type:'error',operationId:request.operationId,outcome:attempt.outcome});
 }finally{active=null;}
 return true;
 };
}
export function createRecoveryV2Handler(send:(response:WorkerResponse)=>void,current?:()=>boolean){
 let active=false;
 return async(value:unknown):Promise<boolean>=>{
 const request=copyWorkerRequest(value);if(!request||request.type!=='recover'||active)return false;
 active=true;
 try{
 const {recoverImportOperationDetailed}=await import('../storage/import-operations');
 const attempt=await recoverImportOperationDetailed(request.operationId,request.revision,request.action,current);
 if(attempt.kind==='confirmed'){
 const state=attempt.operation.state;
 if(state==='sealed'||state==='discarded')send({version:2,type:'recovered',requestId:request.requestId,state,outcome:attempt.outcome});
 else send({version:2,type:'error',requestId:request.requestId,outcome:workerFailureOutcome('worker-protocol')});
 }
 else send({version:2,type:'error',requestId:request.requestId,outcome:attempt.outcome});
 }finally{active=false;}
 return true;
 };
}
