// Closed diagnostic values only. No exception, business identifier or content belongs here.
import type {LocalBatchErrorCode} from '../library/local-batches';
import type {OrganizationBackupErrorCode} from '../library/organization-backup';
export const familyValues = Object.freeze(["auth-required", "auth-expired", "source-unavailable", "rate-limited", "network", "cancelled", "unsupported-format", "autoplay-blocked", "quota", "storage-unavailable", "integrity", "write-uncertain", "internal"] as const);
export type Family = typeof familyValues[number];
export const operationValues = Object.freeze(["open-library", "refresh-library", "save-position", "prepare-queue", "play", "import-audio", "recover-import", "edit-organization", "verify-batch", "recover-batch", "export-organization", "preview-organization", "apply-organization", "inspect-organization", "recover-organization", "artwork", "lyrics", "handoff", "check-capabilities", "export-diagnostics", "inspect-local-copies", "verify-local-copy", "export-audio", "request-persistence"] as const);
export type Operation = typeof operationValues[number];
export const phaseValues = Object.freeze(["admit", "validate", "parse", "open", "read", "write", "close", "verify", "commit", "reconcile", "cleanup", "refresh", "transport", "play", "release", "review", "download"] as const);
export type Phase = typeof phaseValues[number];
export const outcomeValues = Object.freeze(["succeeded", "failed", "cancelled", "partial", "uncertain", "recovered", "blocked"] as const);
export type Outcome = typeof outcomeValues[number];
export const backendValues = Object.freeze(["idb", "opfs", "none", "unknown"] as const);
export type Backend = typeof backendValues[number];
export const transportValues = Object.freeze(["sw", "bounded-blob", "none", "unknown"] as const);
export type Transport = typeof transportValues[number];
export const safeCodeValues = Object.freeze(["none", "unknown", "input-invalid", "limit-exceeded", "format-unsupported", "metadata-invalid", "metadata-title-mismatch", "metadata-artist-mismatch", "metadata-duration-mismatch", "audio-duration-invalid", "audio-codec-missing", "autoplay-denied", "media-aborted", "media-network", "media-decode", "media-unsupported", "media-unknown", "quota-exceeded", "storage-denied", "storage-unavailable", "database-blocked", "transaction-aborted", "asset-missing", "asset-changed", "length-mismatch", "digest-mismatch", "write-uncertain", "close-uncertain", "commit-uncertain", "cleanup-failed", "worker-failed", "worker-protocol", "transport-unavailable", "transport-timeout", "transport-incompatible", "blob-budget", "scope-changed", "owner-unavailable", "handoff-blocked", "cancelled", "conflict", "empty-selection", "retry-required", "relations-invalid", "backup-format", "backup-version", "backup-limits", "local-corrupt", "imports-unresolved", "stale-preview", "plan-expired", "invalid-choice", "fingerprint-conflict", "export-reused", "sample-fetch-failed", "download-unavailable"] as const);
export type SafeCode = typeof safeCodeValues[number];

export interface Result { phase: Phase; outcome: Outcome; family: Family|null; code: SafeCode; backend: Backend; transport: Transport; count: number }
export interface DiagnosticEvent extends Result { sequence: number; correlationId: string; operation: Operation }
export const resultKeys = Object.freeze(['phase','outcome','family','code','backend','transport','count'] as const);
export const eventKeys = Object.freeze(['sequence','correlationId','operation',...resultKeys] as const);
export const MAX_COUNTER = 2147483647;
export const MAX_BYTES = 65536;
export const increment = (n:number) => Math.min(MAX_COUNTER,n+1);
export function plain(value:unknown, keys:readonly string[]): Record<string,unknown>|null {
 try {
  if(!value||typeof value!=='object')return null;
  const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==null)return null;
  const names=Reflect.ownKeys(value);if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
  const copy:Record<string,unknown>=Object.create(null);
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value'in d))return null;copy[key]=d.value;}
  return copy;
 }catch{return null;}
}
function member(value:unknown, values:readonly string[]){return typeof value==='string'&&values.includes(value);}
export function validResult(value:unknown): value is Result {
 const r=plain(value,resultKeys);return !!r&&member(r.phase,phaseValues)&&member(r.outcome,outcomeValues)&&
 (r.family===null||member(r.family,familyValues))&&member(r.code,safeCodeValues)&&member(r.backend,backendValues)&&member(r.transport,transportValues)&&
 Number.isInteger(r.count)&&Number(r.count)>=0&&Number(r.count)<=1000&&
 ((r.family===null&&r.code==='none'&&(r.outcome==='succeeded'||r.outcome==='recovered'))||(r.family!==null&&r.code!=='none'));
}
export function validEvent(value:unknown):value is DiagnosticEvent {
 const e=plain(value,eventKeys);if(!e)return false;
 const r:Record<string,unknown>=Object.create(null);for(const key of resultKeys)r[key]=e[key];
 return validResult(r)&&member(e.operation,operationValues)&&Number.isInteger(e.sequence)&&Number(e.sequence)>0&&Number(e.sequence)<=MAX_COUNTER&&
 typeof e.correlationId==='string'&&e.correlationId.length===36&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(e.correlationId);
}
export function result(phase:Phase, family:Family='internal', code:SafeCode='unknown',outcome:Outcome='failed'):Result {
 return {phase,family,code,outcome,backend:'unknown',transport:'unknown',count:0};
}
export function domFailure(error:unknown,phase:Phase):Result {
 // Only used at known DOM/storage boundaries, never inspect arbitrary messages/cause.
 try{if(error instanceof DOMException){switch(error.name){
 case 'QuotaExceededError':return result(phase,'quota','quota-exceeded');
 case 'NotAllowedError':case 'SecurityError':return result(phase,'storage-unavailable','storage-denied');
 case 'AbortError':return result(phase,'storage-unavailable','transaction-aborted');
 case 'InvalidStateError':return result(phase,'storage-unavailable','storage-unavailable');
 }}}catch{/* hostile object stays unknown */}
 return result(phase);
}
const batchMap = {
 'invalid-input':['internal','input-invalid'],conflict:['internal','conflict'],empty:['internal','empty-selection'],
 'invalid-relation':['integrity','relations-invalid'],'not-found':['integrity','asset-missing'],busy:['internal','owner-unavailable'],
 'retry-required':['internal','retry-required'],storage:['storage-unavailable','storage-unavailable'],worker:['internal','worker-failed']
} as const satisfies Record<LocalBatchErrorCode,readonly [Family,SafeCode]>;
const backupMap = {
 format:['integrity','backup-format'],version:['unsupported-format','backup-version'],limits:['internal','backup-limits'],relations:['integrity','relations-invalid'],
 'local-corrupt':['integrity','local-corrupt'],busy:['internal','owner-unavailable'],'imports-unresolved':['write-uncertain','imports-unresolved'],
 'stale-preview':['internal','stale-preview'],'plan-expired':['internal','plan-expired'],'invalid-choice':['internal','invalid-choice'],
 'fingerprint-conflict':['integrity','fingerprint-conflict'],'export-reused':['integrity','export-reused'],cancelled:['cancelled','cancelled'],quota:['quota','quota-exceeded'],
 storage:['storage-unavailable','storage-unavailable'],uncertain:['write-uncertain','commit-uncertain']
} as const satisfies Record<OrganizationBackupErrorCode,readonly [Family,SafeCode]>;
export function mapBatch(code:LocalBatchErrorCode,phase:Phase):Result {if(typeof code!=='string'||!Object.hasOwn(batchMap,code))return result(phase);const [family,safe]=batchMap[code];return result(phase,family,safe);}
export function mapBackup(code:OrganizationBackupErrorCode,phase:Phase):Result {if(typeof code!=='string'||!Object.hasOwn(backupMap,code))return result(phase);const [family,safe]=backupMap[code];return result(phase,family,safe,code==='uncertain'?'uncertain':'failed');}
export function importFailure(code:unknown):Result {
 return code==='quota'?result('write','quota','quota-exceeded'):code==='cancelled'?result('write','cancelled','cancelled','cancelled'):result('write');
}
export function failureText(r:Result):string {
 switch(r.code){
 case 'empty-selection':return 'La selección no contiene pistas disponibles. Elige otra selección.';
 case 'autoplay-denied':return 'Toca Reproducir para continuar; el navegador requiere una interacción.';
 case 'owner-unavailable':return 'Otra operación tiene el control. Termínala antes de reintentar.';
 case 'conflict':return 'Los datos han cambiado. Actualiza la vista antes de reintentar.';
 }
 switch(r.family){
 case 'quota':return 'No hay espacio suficiente. Se conserva tu biblioteca. Revisa el espacio y tus copias antes de reintentar.';
 case 'storage-unavailable':return 'No se pudo acceder al almacenamiento. Conserva tus originales y vuelve a comprobar el estado.';
 case 'write-uncertain':return 'No se puede confirmar el resultado. Conserva tus datos y revisa la operación antes de repetirla.';
 case 'cancelled':return 'Operación cancelada; se conservan los resultados ya confirmados.';
 default:return 'No se pudo completar la operación. Conserva tus datos y revisa su estado antes de reintentar.';
 }
}
