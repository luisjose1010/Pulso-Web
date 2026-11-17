import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireAlbum,albumTrackChoice,type AlbumRow,type AlbumProgress} from '../../src/library/album-acquisition';
import type {AlbumDetail} from '../../src/library/album-catalog';
import type {SongPlaybackAttempt,SongManagement} from '../../src/library/selected-song';

const detail:AlbumDetail={edition:{id:1,title:'Album',artist:'Artist',trackCount:2,releaseDate:null},tracks:[1,2].map(i=>({releaseId:1,trackId:i,disc:1,position:i,title:`Track ${i}`,artist:'Artist',durationMs:60000}))};
const initial=():AlbumRow[]=>detail.tracks.map(()=>({state:'unattempted',trackId:null,confirmed:false,message:''}));
let addCurrent:SongManagement['add']=async()=>true;
const attempt=(lookup:SongPlaybackAttempt['lookup']):SongPlaybackAttempt=>({current:()=>true,lookup,save:async()=>({state:'failed',trackId:null}),addToLibrary:async(_id,current)=>addCurrent(current),play:async()=>{throw Error('unexpected play');}});
const manager=(add:SongManagement['add']):SongManagement=>({current:()=>true,playReady:false,add,addToPlaylist:async()=>false,play:async()=>'failed'});
test('cached album verifies each occurrence and passes original live guard through add, without play',async()=>{
 let result:AlbumProgress|undefined;const calls:string[]=[];addCurrent=async current=>{assert.equal(current?.(),true);return true;};
 await acquireAlbum({detail,attempt:attempt(async c=>{calls.push(c.id);return 'track';}),client:null,provider:null,revision:0,management:()=>manager(async current=>{assert.equal(current?.(),true);return true;}),signal:new AbortController().signal,current:()=>true,rows:initial(),update:v=>{result=v;}});
 assert.equal(calls.length,2);assert.equal(result?.rows.filter(r=>r.confirmed).length,2);assert.equal(result?.message,'Álbum listo en Biblioteca.');
});
test('cancelled add observes original guard and cannot report completion',async()=>{
 const controller=new AbortController();let result:AlbumProgress|undefined;addCurrent=async current=>{controller.abort();return !!current?.();};
 await acquireAlbum({detail,attempt:attempt(async()=> 'track'),client:null,provider:null,revision:0,management:()=>manager(async current=>{controller.abort();return !!current?.();}),signal:controller.signal,current:()=>true,rows:initial(),update:v=>{result=v;}});
 assert.equal(result?.rows.filter(r=>r.confirmed).length,0);assert.match(result!.message,/detenida/);
});
test('uncertain row is checked locally before continuing and is never dispatched again',async()=>{
 addCurrent=async()=>true;const rows=initial();rows[0].state='uncertain';let looked=0;let result:AlbumProgress|undefined;
 await acquireAlbum({detail,attempt:attempt(async()=>{looked++;return looked===2?'verified':null;}),client:null,provider:null,revision:0,management:()=>manager(async()=>true),signal:new AbortController().signal,current:()=>true,rows,update:v=>{result=v;}});
 assert.equal(looked,2);assert.equal(result?.rows[0].state,'uncertain');assert.equal(result?.rows[1].confirmed,true);assert.match(result!.message,/incompleto/);
});
test('album choice retains full credit for local verification and primary artist for query',()=>{
 const choice=albumTrackChoice({...detail.tracks[0],artist:'Artist, Guest',primaryArtist:'Artist'},'Album');assert.equal(choice.artist,'Artist, Guest');assert.equal(choice.searchArtist,'Artist');
});

function noMatchingClient(patch:Record<string,unknown>={}){
 let state:any={queryId:'before',providerRef:'provider',providerRevision:1,pending:false,available:true,error:null,delivery:'acknowledged',retryBlocked:false,retryAt:null,rows:[],expectedTarget:null};let searches=0,downloads=0;
 const target={title:'Track 1',artist:'Artist',album:'Album',durationSeconds:60};
 const bad={rowRef:'returned-audio',kind:'audio',correlation:'reply',title:'Track 1 (Remix)',performer:'Other Artist',durationSeconds:80,mimeType:'audio/wav',bytes:100};
 const client={botsSnapshot:()=>({revision:1}),searchSnapshot:()=>state,captureBotsCurrent:()=>()=>true,captureSearchActionCurrent:()=>()=>true,captureSearchCancel:()=>()=>{throw Error('unexpected cancel');},subscribeSearch:()=>()=>{},searchBot(_input:unknown,current:()=>boolean,started:(v:any)=>void){assert(current());searches++;state={...state,queryId:'after',expectedTarget:target,rows:[{rowRef:'choice',kind:'option',correlation:'reply',label:'Track 1 — Artist'}]};started({queryId:state.queryId,cancel:()=>{}});},async downloadBot(_ref:string,current:()=>boolean,started:(v:any)=>void){assert(current());downloads++;started({queryId:state.queryId,cancel:()=>{}});state={...state,rows:[bad],...patch};return null;}};
 return {client:client as never,get searches(){return searches;},get downloads(){return downloads;}};
}
test('confirmed terminal audio mismatch fails that row and continues the album without retrying it',async()=>{
 addCurrent=async()=>true;const mock=noMatchingClient();let looked=0,result:AlbumProgress|undefined;const uncertainty=new Set<number>();
 await acquireAlbum({detail,attempt:attempt(async()=>++looked===2?'verified-second':null),client:mock.client,provider:'provider',revision:1,management:()=>manager(async()=>true),signal:new AbortController().signal,current:()=>true,rows:initial(),uncertainTracks:uncertainty,update:v=>{result=v;}});
 assert.equal(looked,2);assert.equal(result?.rows[0].state,'failed');assert.equal(result?.rows[0].confirmed,false);assert.equal(result?.rows[1].confirmed,true);assert.equal(mock.searches,1);assert.equal(mock.downloads,1);assert.equal(uncertainty.size,0);assert.match(result!.message,/incompleto/);
});
test('unsettled, quarantined, foreign or still-compatible snapshots cannot be relabelled as confirmed no-match',async()=>{
 for(const patch of [{pending:true},{available:false},{delivery:'uncertain'},{queryId:'foreign'},{expectedTarget:{title:'Other',artist:'Artist',album:'Album',durationSeconds:60}},{rows:[{rowRef:'audio',kind:'audio',correlation:'reply',title:'Track 1',performer:'Artist',durationSeconds:60,mimeType:'audio/wav',bytes:100}]}]){
  addCurrent=async()=>true;const mock=noMatchingClient(patch);let looked=0,result:AlbumProgress|undefined;
  await acquireAlbum({detail,attempt:attempt(async()=>++looked===2?'must-not-add':null),client:mock.client,provider:'provider',revision:1,management:()=>manager(async()=>true),signal:new AbortController().signal,current:()=>true,rows:initial(),update:v=>{result=v;}});
  assert.equal(looked,1);assert.equal(result?.rows[0].state,'uncertain');assert.equal(result?.rows[1].confirmed,false);assert.equal(mock.searches,1);assert.equal(mock.downloads,1);
 }
});

test('terminal byte-validation failure continues only after settlement of the exact target',async()=>{
 for(const unavailable of [false,true]){
  addCurrent=async()=>true;const mock=noMatchingClient({error:'file-invalid',...(unavailable?{available:false}:{})});let looked=0,result:AlbumProgress|undefined;
  await acquireAlbum({detail,attempt:attempt(async()=>++looked===2?'verified-second':null),client:mock.client,provider:'provider',revision:1,management:()=>manager(async()=>true),signal:new AbortController().signal,current:()=>true,rows:initial(),update:v=>{result=v;}});
  assert.equal(looked,unavailable?1:2);assert.equal(result?.rows[0].state,unavailable?'uncertain':'failed');assert.equal(result?.rows[1].confirmed,!unavailable);assert.equal(mock.searches,1);assert.equal(mock.downloads,1);
 }
});

// The fake client reports a pending lane, so every bot attempt settles as unconfirmed without any send.
const stuckClient={captureBotsCurrent:()=>()=>true,botsSnapshot:()=>({revision:0}),searchSnapshot:()=>({pending:true})} as never;
const five:AlbumDetail={edition:{id:2,title:'Lista',artist:'Varios',trackCount:5,releaseDate:null},tracks:[1,2,3,4,5].map(i=>({releaseId:9,trackId:i,disc:1,position:i,title:`Song ${i}`,artist:'Artist',durationMs:60000}))};
const fiveRows=():AlbumRow[]=>five.tracks.map(()=>({state:'unattempted',trackId:null,confirmed:false,message:''}));
test('imported playlist: an unconfirmed bot exchange does not block the row or the batch; three in a row pause it',async()=>{
 let result:AlbumProgress|undefined;const uncertainTracks=new Set<number>();
 await acquireAlbum({resilient:true,detail:five,attempt:attempt(async()=>null),client:stuckClient,provider:'p',providers:[{providerRef:'p',label:'Bot'}],revision:0,management:()=>manager(async()=>true),signal:new AbortController().signal,current:()=>true,rows:fiveRows(),uncertainTracks,update:v=>{result=v;}});
 assert.deepEqual(result?.rows.map(r=>r.state),['failed','failed','failed','unattempted','unattempted']);
 assert.equal(uncertainTracks.size,0);assert.match(result!.message,/pausa/);
});
test('ordinary album keeps the strict stop on the first unconfirmed exchange',async()=>{
 let result:AlbumProgress|undefined;
 await acquireAlbum({detail:five,attempt:attempt(async()=>null),client:stuckClient,provider:'p',providers:[{providerRef:'p',label:'Bot'}],revision:0,management:()=>manager(async()=>true),signal:new AbortController().signal,current:()=>true,rows:fiveRows(),update:v=>{result=v;}});
 assert.deepEqual(result?.rows.map(r=>r.state),['uncertain','unattempted','unattempted','unattempted','unattempted']);
});
