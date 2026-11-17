import test from 'node:test';
import assert from 'node:assert/strict';
import {musicSearchCatalog} from '../../src/library/music-search-catalog';
import {resolveSearchSingle} from '../../src/library/music-search-single';
import {songChoiceKey} from '../../src/library/selected-song';
import type {Track} from '../../src/library/library';
import type {AlbumDetail,AlbumEdition} from '../../src/library/album-catalog';
const edition=(trackCount:number,id:AlbumEdition['id']=42,artist='Artist'):AlbumEdition=>({id,title:'Release',artist,trackCount,releaseDate:null});
const hint={releaseId:42,trackId:81,disc:1,position:1,title:'Real Song',artist:'Artist; Guest',primaryArtist:'Artist',album:'Release',durationMs:45000,artworkUrl:'https://example.test/cover.jpg'};
const local={id:'own',title:hint.title,artist:hint.artist,album:'Release',duration:45} as Track;
test('confirmed single uses real batch recording metadata and suppresses collection hints, preserving full credit and search artist',()=>{
 const rows=musicSearchCatalog('Release',[],[],[edition(1)],[],[{id:42,title:'Release',artist:'Artist'}],[hint]);
 assert.equal(rows.length,1);const song=rows[0];assert.equal(song.kind,'track');assert.equal(song.id,'itunes:42:1:1:81');assert.equal(song.title,hint.title);assert.equal(song.artist,hint.artist);assert.equal(song.duration,45);assert.equal(song.artworkUrl,hint.artworkUrl);assert(song.kind==='track'&&song.searchArtist==='Artist');assert(songChoiceKey(song));
});
test('single local and remote collaboration is one row, with no inferred album',()=>{
 const rows=musicSearchCatalog('Release',[local],[{id:1,trackName:hint.title,artistName:hint.artist,albumName:'Release',duration:45}],[edition(1)],[],[{id:42,title:'Release',artist:'Artist'}],[hint]);
 assert.deepEqual(rows.map(r=>r.id),['local:own']);
});
test('pending single carries collection identity only and cannot become a recording alias',()=>{
 const rows=musicSearchCatalog('Release',[],[],[edition(1)]);
 assert.equal(rows.length,1);assert.equal(rows[0].kind,'track');assert.equal(rows[0].duration,null);assert.equal(songChoiceKey(rows[0]),null);assert(rows[0].kind==='track'&&rows[0].pendingEditionId===42);
});
test('two tracks, a three track EP and unknown totals remain albums; Single suffix has no authority',()=>{
 for(const count of [2,3,0]){
  const rows=musicSearchCatalog('Release',[],[],[{...edition(count),title:'Release - Single'}]);
  assert.equal(rows.length,1);assert.equal(rows[0].kind,'album');
 }
});
test('one local copy and one batch hit out of seventeen do not classify an album as a single',()=>{
 const rows=musicSearchCatalog('Release',[local],[],[edition(17)],[],[{id:42,title:'Release',artist:'Artist'}],[hint]);
 assert.equal(rows.filter(r=>r.kind==='album').length,1);assert.equal(rows.filter(r=>r.kind==='track').length,1);
 const unknown=musicSearchCatalog('Release',[local],[],[],[],[{id:42,title:'Release',artist:'Artist'}],[hint]);assert(unknown.some(r=>r.kind==='album'));
});
test('homonymous editions and distinct complete credits remain separate',()=>{
 const rows=musicSearchCatalog('Release',[],[],[edition(1),edition(2,43),edition(1,44,'Other Artist')],[],[{id:42,title:'Release',artist:'Artist'},{id:43,title:'Release',artist:'Artist'}],[hint]);
 assert(rows.some(r=>r.kind==='album'&&r.editionId===43));assert(!rows.some(r=>r.kind==='album'&&r.editionId===42));assert(rows.some(r=>r.kind==='track'&&r.pendingEditionId===44));assert(rows.some(r=>r.id==='itunes:42:1:1:81'));
});
const mb='musicbrainz:11111111-1111-4111-8111-111111111111' as const;
const detail=(id:AlbumEdition['id']=42):AlbumDetail=>({edition:edition(1,id),tracks:[{...hint,releaseId:id,trackId:typeof id==='string'?'musicbrainz:22222222-2222-4222-8222-222222222222':81}]});
const request=()=>({signal:new AbortController().signal,current:()=>true});
test('MusicBrainz single is a song candidate while multi-track release remains an album; resolution keeps namespace and credits',async()=>{
 const rows=musicSearchCatalog('Release',[],[],[edition(1,mb),edition(17,'musicbrainz:33333333-3333-4333-8333-333333333333')]);assert.equal(rows[0].kind,'track');assert.equal(rows[1].kind,'album');
 const result=await resolveSearchSingle({load:async()=>({ok:true,value:detail(mb)})},mb,request());assert.equal(result.state,'song');if(result.state!=='song')return;assert.equal(result.choice.id,'musicbrainz:11111111-1111-4111-8111-111111111111:1:1:22222222-2222-4222-8222-222222222222');assert.equal(result.choice.artist,hint.artist);assert.equal(result.choice.searchArtist,'Artist');assert(songChoiceKey(result.choice));
});
test('single resolution rejects contradictory totals, missing rows, foreign release, positions and late cancellation',async()=>{
 const d=detail();const changed=await resolveSearchSingle({load:async()=>({ok:true,value:{...d,edition:edition(2)}})},42,request());assert.equal(changed.state,'changed');
 for(const tracks of [[],[d.tracks[0],d.tracks[0]],[{...d.tracks[0],releaseId:43}],[{...d.tracks[0],position:2}]])assert.equal((await resolveSearchSingle({load:async()=>({ok:true,value:{...d,tracks}})},42,request())).state,'unavailable');
 const abort=new AbortController();let calls=0;const result=await resolveSearchSingle({load:async()=>{calls++;abort.abort();return {ok:true,value:d};}},42,{signal:abort.signal,current:()=>true});assert.equal(result.state,'cancelled');assert.equal(calls,1);
 assert.equal((await resolveSearchSingle({load:async()=>{throw Error('must not load');}},42,{signal:abort.signal,current:()=>true})).state,'cancelled');
 assert.equal((await resolveSearchSingle({load:async()=>{throw Error('network');}},42,request())).state,'unavailable');
});
test('single search may match collection credit while preserving a different full track credit',()=>{
 const guest={...hint,artist:'Guest',primaryArtist:'Artist'};
 const rows=musicSearchCatalog('Release Artist',[],[],[edition(1)],[],[],[guest]);
 assert.equal(rows.length,1);assert.equal(rows[0].title,'Real Song');assert.equal(rows[0].artist,'Guest');assert(rows[0].kind==='track'&&rows[0].searchArtist==='Artist');
});
test('scope revocation and a throwing current guard cannot publish a late recording',async()=>{
 let current=true;
 const result=await resolveSearchSingle({load:async()=>{current=false;return {ok:true,value:detail()};}},42,{signal:new AbortController().signal,current:()=>current});assert.equal(result.state,'cancelled');
 assert.equal((await resolveSearchSingle({load:async()=>{throw Error('must not call');}},42,{signal:new AbortController().signal,current:()=>{throw Error('revoked');}})).state,'cancelled');
});
test('pending single candidates share the existing song row limit',()=>{
 const editions=Array.from({length:100},(_,i)=>edition(1,i+1));
 const rows=musicSearchCatalog('Release',[],[],editions);
 assert.equal(rows.filter(r=>r.kind==='track').length,70);assert.equal(rows.some(r=>r.kind==='album'),false);
});
test('ambiguous or durationless local collection rows cannot hide a pending single',()=>{
 for(const tracks of [[{...local,artist:'Artist',duration:NaN}], [{...local,artist:'Artist'},{...local,id:'other',artist:'Artist',title:'Other Song'}]]){
  const rows=musicSearchCatalog('Release',tracks,[],[edition(1)]);
  assert(rows.some(r=>r.kind==='track'&&r.pendingEditionId===42));
 }
});
test('a MusicBrainz single does not reclassify a homonymous iTunes hint with an unknown total',()=>{
 const rows=musicSearchCatalog('Release',[],[],[edition(1,mb)],[],[{id:43,title:'Release',artist:'Artist'}]);
 assert(rows.some(r=>r.kind==='track'&&r.pendingEditionId===mb));
 assert(rows.some(r=>r.kind==='album'&&r.editionId===43));
});
