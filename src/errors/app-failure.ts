import {backendValues,phaseValues,plain,type Backend,type Family,type Phase,type SafeCode} from '../diagnostics/contract';
export interface FailureV1 {readonly version:1;readonly phase:Phase|null;readonly family:Family;readonly code:Exclude<SafeCode,'none'>;readonly backend:Backend}
// Closed pairs: membership in two unrelated enums is insufficient.
const pairs={
 unknown:'internal','input-invalid':'internal','limit-exceeded':'internal','metadata-invalid':'integrity','metadata-title-mismatch':'integrity','metadata-artist-mismatch':'integrity','metadata-duration-mismatch':'integrity','audio-duration-invalid':'integrity','audio-codec-missing':'integrity',
 'format-unsupported':'unsupported-format','quota-exceeded':'quota','storage-denied':'storage-unavailable',
 'storage-unavailable':'storage-unavailable','database-blocked':'storage-unavailable','transaction-aborted':'storage-unavailable',
 'asset-missing':'integrity','asset-changed':'integrity','length-mismatch':'integrity','digest-mismatch':'integrity','local-corrupt':'integrity',
 'relations-invalid':'integrity',conflict:'internal',cancelled:'cancelled','imports-unresolved':'write-uncertain',
 'write-uncertain':'write-uncertain','close-uncertain':'write-uncertain','commit-uncertain':'write-uncertain',
 'cleanup-failed':'internal','worker-failed':'internal','worker-protocol':'internal','owner-unavailable':'internal'
} as const;
export function copyFailureV1(value:unknown):FailureV1|null {
 const f=plain(value,['version','phase','family','code','backend']);
 if(!f||f.version!==1||!(f.phase===null||typeof f.phase==='string'&&phaseValues.includes(f.phase as Phase))||
 typeof f.code!=='string'||!Object.hasOwn(pairs,f.code)||pairs[f.code as keyof typeof pairs]!==f.family||
 typeof f.backend!=='string'||!backendValues.includes(f.backend as Backend))return null;
 return Object.freeze({...f}) as unknown as FailureV1;
}
export const validFailureV1=(value:unknown):value is FailureV1=>copyFailureV1(value)!==null;
export function makeFailure(phase:Phase|null,family:Family,code:Exclude<SafeCode,'none'>,backend:Backend):FailureV1 {
 const f=copyFailureV1({version:1,phase,family,code,backend});if(!f)throw new TypeError('Invalid failure contract');return f;
}
const emitted=new WeakMap<object,FailureV1>();
export class AppFailure extends Error {
 private constructor(failure:FailureV1){super(failure.phase==='read'&&['asset-missing','length-mismatch','local-corrupt'].includes(failure.code)?'Copia local incompleta.':'No se pudo completar la operación. Conserva tus datos y revisa su estado.');this.name='AppFailure';emitted.set(this,failure);}
 static create(failure:FailureV1){const f=copyFailureV1(failure);if(!f)throw new TypeError('Invalid failure contract');return new AppFailure(f);}
}
export function issuedFailure(error:unknown):FailureV1|null {
 return (typeof error==='object'&&error!==null||typeof error==='function')?emitted.get(error as object)??null:null;
}
// Invoke the native brand-checking getter directly. Neither instanceof nor reading
// error.name is safe: proxies, forged prototypes and shadowing accessors are inputs.
const domName=typeof DOMException==='undefined'?undefined:Object.getOwnPropertyDescriptor(DOMException.prototype,'name')?.get;
export function nativeDOMName(error:unknown):string|null {try{return domName?.call(error)??null;}catch{return null;}}
export function fromKnownError(error:unknown,context:{phase:Phase|null;backend:Backend;cancelRequested?:boolean}):FailureV1 {
 const issued=issuedFailure(error);if(issued)return issued;
 const {phase,backend}=context;
 switch(nativeDOMName(error)){
 case 'QuotaExceededError':return makeFailure(phase,'quota','quota-exceeded',backend);
 case 'SecurityError':case 'NotAllowedError':return makeFailure(phase,'storage-unavailable','storage-denied',backend);
 case 'InvalidStateError':return makeFailure(phase,'storage-unavailable','storage-unavailable',backend);
 case 'AbortError':if(backend==='idb')return context.cancelRequested?makeFailure(phase,'cancelled','cancelled',backend):makeFailure(phase,'storage-unavailable','transaction-aborted',backend);break;
 }
 return makeFailure(phase,'internal','unknown',backend);
}
export function fail(phase:Phase|null,family:Family,code:Exclude<SafeCode,'none'>,backend:Backend):never {throw AppFailure.create(makeFailure(phase,family,code,backend));}
export async function atBoundary<T>(phase:Phase,backend:Backend,work:()=>Promise<T>|T):Promise<T>{
 try{return await work();}catch(error){const known=issuedFailure(error);if(known?.phase!==null&&known)throw error;throw AppFailure.create(known?makeFailure(phase,known.family,known.code,known.backend):fromKnownError(error,{phase,backend}));}
}

/** Transitional native throw adapter for legacy OPFS callers (restore/batch).
 * Issued identity is still private; its fixed message contains no filesystem data.
 * Remove only when those consumers migrate to detailed discriminants in B.
 */
export function missingAssetException():DOMException {
 const error=new DOMException('No hay una copia local disponible.','NotFoundError');
 emitted.set(error,makeFailure('open','integrity','asset-missing','opfs'));return error;
}
