import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireFromOrderedBots,orderedProviders} from '../../src/library/ordered-bot-acquisition';
import {acquireAlbum,type AlbumProgress} from '../../src/library/album-acquisition';
import type {TelegramSessionClient} from '../../src/telegram/session-client';
import {matchingSongRows,type SongPlaybackAttempt} from '../../src/library/selected-song';

const target={title:'Song',artist:'Artist',album:'Album',durationSeconds:60};
const providers=[{providerRef:'one',label:'One'},{providerRef:'two',label:'Two'}];
const audio={blob:new Blob(['x'],{type:'audio/wav'}),bytes:1,mime:'audio/wav' as const,sha256:'a'.repeat(64),target};
type Scenario='conflict-before'|'conflict-after'|'conflict-uncertain'|'empty'|'mismatch'|'large'|'invalid'|'success'|'uncertain'|'rate-limit'|'timeout'|'busy'|'network'|'session-expired'|'identity-changed'|'wrong-provider'|'wrong-query'|'wrong-target'|'revoked';
function fixture(scenarios:Scenario[]){
 let state:any={queryId:'initial',providerRef:null,providerRevision:4,expectedTarget:null,pending:false,available:true,error:null,delivery:'acknowledged',retryBlocked:false,retryAt:null,rows:[]};
 let valid=true,index=-1;const searches:string[]=[],downloads:string[]=[],targets:string[]=[];
 const client={botsSnapshot:()=>({revision:4}),searchSnapshot:()=>({...state}),captureBotsCurrent:()=>()=>valid,captureSearchActionCurrent:()=>()=>valid,captureSearchCancel:()=>undefined,subscribeSearch:()=>()=>{},searchBot(input:any,_allowed:unknown,started:(v:any)=>void){index++;searches.push(input.providerRef);targets.push(input.target.artist);const kind=scenarios[index];state={...state,queryId:`q${index}`,providerRef:input.providerRef,expectedTarget:input.target,delivery:'acknowledged',error:null,rows:kind==='empty'?[]:[{kind:'option',rowRef:`row${index}`,correlation:'reply',label:`Song — ${input.target.artist}`} ]};if(kind==='wrong-provider')state.providerRef='foreign';if(kind==='wrong-target')state.expectedTarget={...target,title:'Other'};if(kind==='busy'||kind==='network'||kind==='session-expired'||kind==='identity-changed')state.error=kind;if(kind==='timeout')state.error='timeout';if(kind==='rate-limit'){state.error='rate-limit';state.retryBlocked=true;}if(kind==='uncertain')state.delivery='uncertain';if(kind==='revoked')valid=false;started({queryId:state.queryId,cancel:()=>{}});},async downloadBot(row:string,_allowed:unknown,started:(v:any)=>void){downloads.push(row);started({queryId:state.queryId,cancel:()=>{}});const kind=scenarios[index];if(kind==='success'){state.delivery='uncertain';return {...audio,target:state.expectedTarget};}if(kind.startsWith('conflict-')){state.error='conflict';state.delivery=kind==='conflict-before'?'not-dispatched':kind==='conflict-after'?'acknowledged':'uncertain';}if(kind==='large')state.error='file-too-large';if(kind==='invalid')state.error='file-invalid';if(kind==='wrong-query')state.queryId='foreign';if(kind==='mismatch')state.rows=[{kind:'audio',rowRef:'different',correlation:'reply',title:'Song remix',performer:'Artist',durationSeconds:60,mimeType:'audio/wav',bytes:1}];return null;}} as unknown as TelegramSessionClient;
 return {client,searches,downloads,targets,revoke:()=>{valid=false;}};
}
async function run(scenarios:Scenario[]){const f=fixture(scenarios),abort=new AbortController();const result=await acquireFromOrderedBots({client:f.client,providers,revision:4,target,signal:abort.signal,current:()=>true,networkCurrent:f.client.captureBotsCurrent(),progress:()=>{}});return {...f,result};}
for(const first of ['empty','mismatch','large','invalid','conflict-before'] as const)test(`${first} advances once and accepts valid audio despite residual delivery state`,async()=>{const f=await run([first,'success']);assert.equal(f.result.state,'audio');assert.deepEqual(f.searches,['one','two']);assert.deepEqual(f.downloads,first==='empty'?['row1']:['row0','row1']);});
test('all confirmed failures exhaust providers once',async()=>{const f=await run(['empty','empty']);assert.equal(f.result.state,'known-failure');assert.deepEqual(f.searches,['one','two']);assert.deepEqual(f.downloads,[]);});
test('exhaustion retains the actual failure per provider without exposing rows or notice text',async()=>{
 for(const [scenario,reason] of [['empty','no-compatible-row'],['mismatch','returned-audio-mismatch'],['large','file-too-large'],['invalid','file-invalid'],['conflict-before','selection-changed']] as const){
  const f=await run([scenario,scenario]);
  assert.deepEqual(f.result,{state:'known-failure',reasons:scenario==='mismatch'?[reason,'audio-title-version-mismatch',reason,'audio-title-version-mismatch']:[reason,reason]});
 }
 const mixed=await run(['large','mismatch']);
 assert.deepEqual(mixed.result,{state:'known-failure',reasons:['file-too-large','returned-audio-mismatch','audio-title-version-mismatch']});
});
for(const first of ['conflict-after','conflict-uncertain','uncertain','rate-limit','timeout','busy','network','session-expired','identity-changed','wrong-provider','wrong-query','wrong-target','revoked'] as const)test(`${first} stops without trying a second provider`,async()=>{const f=await run([first,'success']);assert.equal(f.result.state,'uncertain');assert.deepEqual(f.searches,['one']);});
test('album uses the real coordinator, tries ordered bots and retains full credit during save',async()=>{
 const f=fixture(['empty','success']);let result:AlbumProgress|undefined,savedArtist:string|null=null;
 const attempt:SongPlaybackAttempt={current:()=>true,lookup:async()=>null,save:async(_audio,choice)=>{savedArtist=choice.artist;return {state:'saved',trackId:'track'};},addToLibrary:async()=>true,play:async()=>{throw Error('unexpected');}};
 await acquireAlbum({detail:{edition:{id:1,title:'Album',artist:'Artist',trackCount:1,releaseDate:null},tracks:[{releaseId:1,trackId:1,disc:1,position:1,title:'Song',artist:'Artist, Guest',primaryArtist:'Artist',durationMs:60000}]},attempt,client:f.client,provider:'one',providers,revision:4,management:()=>null,signal:new AbortController().signal,current:()=>true,rows:[{state:'unattempted',trackId:null,confirmed:false,message:''}],update:v=>{result=v;}});
 assert.equal(savedArtist,'Artist, Guest');assert.deepEqual(f.targets,['Artist, Guest','Artist, Guest']);assert.equal(result?.rows[0].confirmed,true);assert.deepEqual(f.searches,['one','two']);
});
test('cancellation during an in-flight query waits for settlement and sends no next query',async()=>{
 let state:any={queryId:'before',providerRef:null,providerRevision:4,expectedTarget:null,pending:false,available:true,error:null,delivery:'not-dispatched',retryBlocked:false,retryAt:null,rows:[]},listener:(snapshot:any)=>void=()=>{},cancelled=0,searches=0;
 const client={botsSnapshot:()=>({revision:4}),searchSnapshot:()=>state,captureBotsCurrent:()=>()=>true,captureSearchActionCurrent:()=>()=>true,captureSearchCancel:()=>()=>{cancelled++;},subscribeSearch:(fn:(snapshot:any)=>void)=>{listener=fn;return()=>{};},searchBot(input:any,_allowed:unknown,started:(v:any)=>void){searches++;state={...state,queryId:'pending',providerRef:input.providerRef,expectedTarget:input.target,pending:true};started({queryId:state.queryId,cancel:()=>{cancelled++;}});},downloadBot:async()=>{throw Error('unexpected');}} as unknown as TelegramSessionClient;
 const abort=new AbortController(),task=acquireFromOrderedBots({client,providers,revision:4,target,signal:abort.signal,current:()=>true,networkCurrent:client.captureBotsCurrent(),progress:()=>{}});
 await Promise.resolve();abort.abort();assert.equal(cancelled,1);state={...state,pending:false,error:'cancelled',delivery:'acknowledged'};listener(state);assert.equal((await task).state,'uncertain');assert.equal(searches,1);
});
test('total deadline cancels the original lane and does not dispatch another provider',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 let state:any={queryId:'before',providerRef:null,providerRevision:4,expectedTarget:null,pending:false,available:true,error:null,delivery:'not-dispatched',retryBlocked:false,retryAt:null,rows:[]},listener:(snapshot:any)=>void=()=>{},cancelled=0,searches=0;
 const client={botsSnapshot:()=>({revision:4}),searchSnapshot:()=>state,captureBotsCurrent:()=>()=>true,captureSearchActionCurrent:()=>()=>true,captureSearchCancel:()=>()=>{cancelled++;},subscribeSearch:(fn:(snapshot:any)=>void)=>{listener=fn;return()=>{};},searchBot(input:any,_allowed:unknown,started:(v:any)=>void){searches++;state={...state,queryId:'pending',providerRef:input.providerRef,expectedTarget:input.target,pending:true};started({queryId:state.queryId,cancel:()=>{cancelled++;}});},downloadBot:async()=>{throw Error('unexpected');}} as unknown as TelegramSessionClient;
 const task=acquireFromOrderedBots({client,providers,revision:4,target,signal:new AbortController().signal,current:()=>true,networkCurrent:client.captureBotsCurrent(),progress:()=>{}});
 for(let i=0;i<5;i++)await Promise.resolve();assert.equal(searches,1);t.mock.timers.tick(180000);assert.equal(cancelled,1);state={...state,pending:false,error:'timeout',delivery:'uncertain'};listener(state);assert.equal((await task).state,'uncertain');assert.equal(searches,1);
});
test('album shared cooldown spaces searches and callback across providers and gestures',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 let state:any={queryId:'initial',providerRef:null,providerRevision:4,expectedTarget:null,pending:false,available:true,error:null,delivery:'acknowledged',retryBlocked:false,retryAt:null,rows:[]},count=0;const times:number[]=[];
 const client={botsSnapshot:()=>({revision:4}),searchSnapshot:()=>state,captureBotsCurrent:()=>()=>true,captureSearchActionCurrent:()=>()=>true,captureSearchCancel:()=>undefined,subscribeSearch:()=>()=>{},searchBot(input:any,_allowed:unknown,started:(v:any)=>void){times.push(Date.now());count++;state={...state,queryId:`q${count}`,providerRef:input.providerRef,expectedTarget:input.target,rows:count===1?[]:[{kind:'option',rowRef:'row',correlation:'reply',label:'Song — Artist'}]};started({queryId:state.queryId,cancel:()=>{}});},async downloadBot(_row:unknown,_allowed:unknown,started:(v:any)=>void){times.push(Date.now());started({queryId:state.queryId,cancel:()=>{}});return audio;}} as unknown as TelegramSessionClient;
 const clock={settledAt:0};
 const task=acquireFromOrderedBots({client,providers,revision:4,target,signal:new AbortController().signal,current:()=>true,networkCurrent:client.captureBotsCurrent(),remoteClock:clock,progress:()=>{}});
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 await flush();t.mock.timers.tick(1000);await flush();t.mock.timers.tick(1000);await flush();t.mock.timers.tick(1000);await flush();assert.equal((await task).state,'audio');
 assert.equal(times.length,3);assert.ok(times[1]-times[0]>=1000);assert.ok(times[2]-times[1]>=1000);
 const next=acquireFromOrderedBots({client,providers:providers.slice(0,1),revision:4,target,signal:new AbortController().signal,current:()=>true,networkCurrent:client.captureBotsCurrent(),remoteClock:clock,progress:()=>{}});
 await flush();assert.equal(times.length,3);t.mock.timers.tick(1000);await flush();t.mock.timers.tick(1000);await flush();assert.equal((await next).state,'audio');assert.ok(times[3]-times[2]>=1000);assert.ok(times[4]-times[3]>=1000);
});

test('unsupported first provider is skipped while preserving configured order and deduplicating',()=>{
 const bots={providers:[{providerRef:'unsupported',username:'unknown',label:'Unknown'},{providerRef:'kd',username:'KDMUSIC_BOT',label:'KD'},{providerRef:'iv',username:'ivkmbot',label:'IV'},{providerRef:'kd',username:'kdmusic_bot',label:'KD'}]};
 assert.deepEqual(orderedProviders(bots as never),[{providerRef:'kd',label:'KD'},{providerRef:'iv',label:'IV'}]);
});
test('album cancellation after dispatch quarantines the row before any retry',async()=>{
 const f=fixture(['success']),abort=new AbortController(),prior=f.client.downloadBot.bind(f.client),uncertain=new Set<number>();
 f.client.downloadBot=async(ref,allowed,started)=>{const value=await prior(ref,allowed,started);abort.abort();return value;};
 let result:AlbumProgress|undefined;const attempt:SongPlaybackAttempt={current:()=>true,lookup:async()=>null,save:async()=>{throw Error('must not save');},addToLibrary:async()=>{throw Error('must not add');},play:async()=>{throw Error('must not play');}};
 await acquireAlbum({detail:{edition:{id:1,title:'Album',artist:'Artist',trackCount:1,releaseDate:null},tracks:[{releaseId:1,trackId:1,disc:1,position:1,title:'Song',artist:'Artist',durationMs:60000}]},attempt,client:f.client,provider:'one',providers,revision:4,management:()=>null,signal:abort.signal,current:()=>true,rows:[{state:'unattempted',trackId:null,confirmed:false,message:''}],uncertainTracks:uncertain,update:v=>{result=v;}});
 assert.equal(result?.rows[0].state,'uncertain');assert.equal(uncertain.has(1),true);assert.deepEqual(f.searches,['one']);
});

test('collaboration matching requires the complete artist credit',()=>{
 const collaboration={...target,artist:'Artist & Guest'};
 const row=(performer:string)=>({kind:'audio' as const,rowRef:performer,correlation:'reply' as const,title:'Song',performer,durationSeconds:60,mimeType:'audio/wav',bytes:1});
 assert.equal(matchingSongRows([row('Artist')],collaboration).length,0);
 assert.equal(matchingSongRows([row('Artist & Guest')],collaboration).length,1);
});
test('changed pool revision before dispatch sends zero queries',async()=>{
 const f=fixture(['success']);f.client.botsSnapshot=()=>({revision:5} as never);
 const result=await acquireFromOrderedBots({client:f.client,providers,revision:4,target,signal:new AbortController().signal,current:()=>true,networkCurrent:f.client.captureBotsCurrent(),progress:()=>{}});
 assert.equal(result.state,'uncertain');assert.deepEqual(f.searches,[]);
});
test('provider list is copied before the first await and capped at five',async()=>{
 const f=fixture(['empty','empty','empty','empty','empty','success']);
 const mutable=Array.from({length:6},(_,i)=>({providerRef:`p${i}`,label:`P${i}`}));
 const task=acquireFromOrderedBots({client:f.client,providers:mutable,revision:4,target,signal:new AbortController().signal,current:()=>true,networkCurrent:f.client.captureBotsCurrent(),progress:()=>{}});
 mutable[0].providerRef='changed';mutable.push({providerRef:'injected',label:'Injected'});
 assert.equal((await task).state,'known-failure');assert.deepEqual(f.searches,['p0','p1','p2','p3','p4']);
});
test('failed admission never cancels another producer after abort',async()=>{
 const abort=new AbortController();let foreignCancels=0,searches=0;
 const snapshot={queryId:'before',providerRef:'foreign',providerRevision:4,expectedTarget:target,pending:false,available:true,error:null,delivery:'acknowledged',retryBlocked:false,retryAt:null,rows:[]};
 const client={botsSnapshot:()=>({revision:4}),searchSnapshot:()=>snapshot,captureBotsCurrent:()=>()=>true,captureSearchActionCurrent:()=>()=>true,captureSearchCancel:()=>()=>{foreignCancels++;},subscribeSearch:()=>()=>{},searchBot(){searches++;abort.abort();},downloadBot:async()=>null} as unknown as TelegramSessionClient;
 const result=await acquireFromOrderedBots({client,providers,revision:4,target,signal:abort.signal,current:()=>true,networkCurrent:client.captureBotsCurrent(),progress:()=>{}});
 assert.equal(result.state,'uncertain');assert.equal(searches,1);assert.equal(foreignCancels,0);
});

// Even a non-dispatched selection failure must retain the exact attempt guards.
test('pre-callback conflict with a changed query never advances to another provider',async()=>{
 const f=fixture(['conflict-before','success']),download=f.client.downloadBot.bind(f.client);
 f.client.downloadBot=async(...args)=>{await download(...args);const snapshot=f.client.searchSnapshot();f.client.searchSnapshot=()=>({...snapshot,queryId:'foreign'});return null;};
 const result=await acquireFromOrderedBots({client:f.client,providers,revision:4,target,signal:new AbortController().signal,current:()=>true,networkCurrent:f.client.captureBotsCurrent(),progress:()=>{}});
 assert.equal(result.state,'uncertain');assert.deepEqual(f.searches,['one']);
});

test('acknowledged incompatible full credit reports artist only and never returns audio',async()=>{
 const f=fixture(['mismatch']),download=f.client.downloadBot.bind(f.client);
 f.client.downloadBot=async(...args)=>{await download(...args);const state=f.client.searchSnapshot();f.client.searchSnapshot=()=>({...state,rows:[{kind:'audio',rowRef:'synthetic',correlation:'reply',title:target.title,performer:'Other',durationSeconds:target.durationSeconds,mimeType:'audio/wav',bytes:1}]});return null;};
 const result=await acquireFromOrderedBots({client:f.client,providers:providers.slice(0,1),revision:4,target,signal:new AbortController().signal,current:()=>true,networkCurrent:()=>true,progress:()=>{}});
 assert.deepEqual(result,{state:'known-failure',reasons:['returned-audio-mismatch','audio-artist-mismatch']});
 assert.deepEqual(f.downloads,['row0']);assert.deepEqual(f.searches,['one']);
});
