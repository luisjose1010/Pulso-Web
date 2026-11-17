import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseMusicBrainzDetail,parseMusicBrainzEditions,parseMusicBrainzArtists,MusicBrainzCatalog} from '../../src/library/musicbrainz-catalog';
import {albumTrackChoice} from '../../src/library/album-acquisition';
import {songChoiceKey} from '../../src/library/selected-song';
import {musicSearchCatalog} from '../../src/library/music-search-catalog';
const release='266569e4-3060-4f70-be69-beac84d12023',recording='837c16a7-ced0-4020-ab4a-4eea49d567cd',artist='ed5f6556-a20c-45e1-b743-89d2bb4141a3';
const credit=[{name:'Artista',joinphrase:' & ',artist:{id:artist}},{name:'Invitado',joinphrase:'',artist:{id:recording}}];
const fixture=()=>JSON.parse(JSON.stringify({id:release,title:'Disco',date:'2026-01-01','artist-credit':credit,'cover-art-archive':{front:true},media:[{position:2,'track-count':1,tracks:[{position:1,title:'Repetida',length:100000,'artist-credit':credit,recording:{id:recording}}]},{position:1,'track-count':1,tracks:[{position:1,title:'Primera',length:100000,'artist-credit':credit,recording:{id:artist}}]}]}));
test('backup detail verifies discs, repeated recordings and full credits with independent IDs',()=>{
 const result=parseMusicBrainzDetail(fixture(),`musicbrainz:${release}`);assert.ok(result.ok);assert.equal(result.value.tracks.length,2);assert.deepEqual(result.value.tracks.map(t=>t.disc),[1,2]);assert.equal(result.value.tracks[0].artist,'Artista & Invitado');
 const choice=albumTrackChoice(result.value.tracks[0],'Disco');assert.equal(choice.source,'musicbrainz');assert.ok(songChoiceKey(choice));assert.match(choice.id,/^musicbrainz:/);assert.equal(songChoiceKey({...choice,source:'itunes'}),null);
 const changed=structuredClone(choice);changed.artist='Artista';assert.notEqual(songChoiceKey(changed),songChoiceKey(choice));
});
test('missing tracks, duplicate positions, wrong release, video and malformed credits are rejected',()=>{
 let x=fixture();x.media[0].tracks=[];assert.equal(parseMusicBrainzDetail(x,`musicbrainz:${release}`).ok,false);
 x=fixture();x.media[0].position=1;assert.equal(parseMusicBrainzDetail(x,`musicbrainz:${release}`).ok,false);
 assert.equal(parseMusicBrainzDetail(fixture(),`musicbrainz:${artist}`).ok,false);
 const video=fixture();Object.assign(video.media[0].tracks[0].recording,{video:true});assert.equal(parseMusicBrainzDetail(video,`musicbrainz:${release}`).ok,false);
 const bad=fixture();bad.media[0].tracks[0]['artist-credit']=[];assert.equal(parseMusicBrainzDetail(bad,`musicbrainz:${release}`).ok,false);
});
test('candidate lists validate IDs and do not emit duplicate inferred Apple albums',()=>{
 const albums=parseMusicBrainzEditions({releases:[fixture()]});assert.ok(albums.ok);const artists=parseMusicBrainzArtists({artists:[{id:artist,name:'Artista'}]});assert.ok(artists.ok);
 const choices=musicSearchCatalog('Disco Artista',[],[],albums.value,[],[{id:99,title:'Disco',artist:'Artista & Invitado'}]);assert.equal(choices.filter(c=>c.kind==='album').length,1);assert.equal(choices[0].source,'musicbrainz');
 assert.equal(parseMusicBrainzArtists({artists:[{id:'wrong',name:'Artista'}]}).ok,false);
});
test('a cancelled backup performs no network and caller cancellation cuts off an ignored fetch',async()=>{
 let calls=0;const catalog=new MusicBrainzCatalog(async()=>{calls++;return new Promise<Response>(()=>{});});const abort=new AbortController();abort.abort();
 assert.deepEqual(await catalog.search('Disco',null,{signal:abort.signal,current:()=>true}),{ok:false,reason:'cancelled'});assert.equal(calls,0);
 const active=new AbortController(),pending=catalog.load(`musicbrainz:${release}`,{signal:active.signal,current:()=>true});active.abort();assert.deepEqual(await pending,{ok:false,reason:'cancelled'});assert.equal(calls,1);
});
test('backup enforces response bounds, JSON and full requested identity',async()=>{
 for(const response of [new Response('x'.repeat(1048577)),Response.json(fixture())]){
  const catalog=new MusicBrainzCatalog(async()=>response);const result=await catalog.load(`musicbrainz:${artist}`,{signal:new AbortController().signal,current:()=>true});assert.equal(result.ok,false);
 }
 const catalog=new MusicBrainzCatalog(async()=>Response.json({releases:[fixture()]}));const r=await catalog.search('Otro','Artista',{signal:new AbortController().signal,current:()=>true});assert.deepEqual(r,{ok:true,value:[]});
});

test('a throwing caller guard is cancellation, including rejection after dispatch',async()=>{
 const catalog=new MusicBrainzCatalog(async()=>{throw Error('network');});let count=0;
 assert.deepEqual(await catalog.load(`musicbrainz:${release}`,{signal:new AbortController().signal,current:()=>{if(++count>1)throw Error('stale');return true;}}),{ok:false,reason:'cancelled'});
});
