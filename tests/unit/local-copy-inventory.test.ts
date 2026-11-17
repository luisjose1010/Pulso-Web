import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWorkerRequest,parseWorkerReply,copyAsset,sameAsset,COPY_LIMITS} from '../../src/library/local-copy-protocol';
import {checkCopyContext,localCopyFailureReason} from '../../src/library/local-copy-inventory';
import {AppFailure,issuedFailure,makeFailure} from '../../src/errors/app-failure';
const requestId='11111111-1111-1111-1111-111111111111',token='22222222-2222-2222-2222-222222222222';
const head={version:1,requestId,token};
const asset={id:requestId,storageKey:token,namespace:'local',backend:'idb',bytes:1,mime:'audio/wav',sha256:'1'.repeat(64),state:'complete',retention:'kept',revision:1,chunkSize:65536,chunks:1};
test('protocol accepts only data descriptors and closed worker shapes',()=>{
 let read=0;const hostile={get type(){read++;throw Error('private');}};
 assert.equal(parseWorkerRequest(hostile),null);assert.equal(parseWorkerReply(hostile),null);assert.equal(read,0);
 assert.ok(parseWorkerRequest({...head,type:'inventory'}));assert.equal(parseWorkerRequest({...head,type:'inventory',unknown:0}),null);
 assert.equal(parseWorkerRequest({...head,type:'credit',offset:COPY_LIMITS.exportBytes+1}),null);assert.equal(parseWorkerRequest({...head,type:'credit',offset:0.5}),null);
 assert.equal(parseWorkerReply({...head,type:'chunk',offset:0,buffer:new ArrayBuffer(65537)}),null);
 assert.equal(parseWorkerReply({...head,type:'chunk',offset:0,buffer:new Uint8Array(1)}),null);
});
test('copy DTO validates every physical identity field without coercion/getters',()=>{
 const copied=copyAsset(asset);assert.ok(copied);assert.ok(sameAsset(copied,copied));
 for(const [key,value] of Object.entries({id:'bad',storageKey:'../bad',revision:0,bytes:0,sha256:'bad',namespace:'other',backend:'disk',mime:'text/html',retention:'temporary',chunks:2}))assert.equal(copyAsset({...asset,[key]:value}),null,key);
 let called=0;assert.equal(copyAsset({...asset,get bytes(){called++;return 1;}}),null);assert.equal(called,0);
 assert.equal(copyAsset({...asset,extra:'private'}),null);
});
test('verified result requires matching availability/integrity/failure semantics',()=>{
 const result={availability:'present',integrity:'verified',bytes:1,failure:null};assert.ok(parseWorkerReply({...head,type:'verified',result}));
 assert.equal(parseWorkerReply({...head,type:'verified',result:{...result,integrity:'unknown'}}),null);
 assert.equal(parseWorkerReply({...head,type:'verified',result:{...result,availability:'missing',integrity:'unknown'}}),null);
 assert.equal(parseWorkerReply({...head,type:'failure',failure:{version:1,phase:'read',family:'internal',code:'asset-missing',backend:'idb'}}),null);
});
test('context and UI mapping never inspect hostile errors',()=>{
 let called=0;const error={get message(){called++;throw Error();},get name(){called++;throw Error();},get cause(){called++;throw Error();}};
 const text=localCopyFailureReason(error);assert.match(text,/datos se conservan/);assert.equal(called,0);
 assert.throws(()=>checkCopyContext({signal:new AbortController().signal,current:()=>{throw error;}}),e=>issuedFailure(e)?.code==='unknown');assert.equal(called,0);
 assert.throws(()=>checkCopyContext({signal:new AbortController().signal,current:()=>false}),e=>issuedFailure(e)?.code==='owner-unavailable');
});
test('cancellation guard precedes user current callback',()=>{
 const ac=new AbortController();ac.abort();let calls=0;assert.throws(()=>checkCopyContext({signal:ac.signal,current:()=>{calls++;return true;}}),e=>issuedFailure(e)?.code==='cancelled');assert.equal(calls,0);
});
test('export limit displays its real size in MB and keeps the safe original-file guidance',()=>{
 const error=AppFailure.create(makeFailure('validate','internal','limit-exceeded','idb'));assert.match(localCopyFailureReason(error),/8,39 MB/);assert.match(localCopyFailureReason(error),/original/);
});
