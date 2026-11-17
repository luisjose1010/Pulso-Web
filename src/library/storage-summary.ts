import type {LocalAsset} from './library';

export interface StorageEstimate {usage?:number;quota?:number}
export interface StorageSummary {
 readonly knownAudioBytes:number;
 readonly cachedAudioBytes:number;
 readonly savedAudioBytes:number;
 readonly estimatedUsage:number|null;
 readonly estimatedQuota:number|null;
 readonly estimatedAvailable:number|null;
 readonly estimatedPercent:number|null;
}

/** Audio categories are disjoint: each valid physical asset contributes once. */
export function summarizeStorage(assets:readonly LocalAsset[],cachedAssetIds:ReadonlySet<string>,estimate:StorageEstimate|null|undefined):StorageSummary {
 const knownAudioBytes=assets.reduce((sum,a)=>sum+(Number.isFinite(a.bytes)&&a.bytes>=0?a.bytes:0),0);
 const cachedAudioBytes=assets.reduce((sum,a)=>sum+(cachedAssetIds.has(a.id)&&Number.isFinite(a.bytes)&&a.bytes>=0?a.bytes:0),0);
 const usage=estimate?.usage,quota=estimate?.quota;
 const valid=Number.isFinite(usage)&&Number.isFinite(quota)&&usage!>=0&&quota!>0&&usage!<=quota!;
 return {knownAudioBytes,cachedAudioBytes,savedAudioBytes:knownAudioBytes-cachedAudioBytes,
  estimatedUsage:valid?usage!:null,estimatedQuota:valid?quota!:null,
  estimatedAvailable:valid?quota!-usage!:null,estimatedPercent:valid?Math.min(100,Math.max(0,usage!/quota!*100)):null};
}
