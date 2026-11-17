import test from 'node:test';
import assert from 'node:assert/strict';
import type {LocalAsset} from '../../src/library/library';
import {summarizeStorage} from '../../src/library/storage-summary';

const asset=(id:string,bytes:number)=>({id,bytes} as LocalAsset);
test('storage summary counts each audio asset once and keeps cache disjoint',()=>{
 const summary=summarizeStorage([asset('saved',2_000_000),asset('cache',1_000_000)],new Set(['cache']),{usage:6_000_000,quota:10_000_000});
 assert.deepEqual(summary,{knownAudioBytes:3_000_000,cachedAudioBytes:1_000_000,savedAudioBytes:2_000_000,estimatedUsage:6_000_000,estimatedQuota:10_000_000,estimatedAvailable:4_000_000,estimatedPercent:60});
});
test('invalid or missing quota estimates never create a percentage or available-space claim',()=>{
 for(const estimate of [undefined,null,{}, {usage:0,quota:0},{usage:2,quota:1},{usage:NaN,quota:10},{usage:1,quota:Infinity}]){
  const value=summarizeStorage([asset('known',123)],new Set(),estimate);
  assert.equal(value.knownAudioBytes,123);assert.equal(value.estimatedPercent,null);assert.equal(value.estimatedAvailable,null);
 }
});
