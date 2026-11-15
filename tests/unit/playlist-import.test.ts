import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlaylistText,resolvePlaylist,playlistDetail,PLAYLIST_IMPORT_MAX,type PlaylistMatch} from '../../src/library/playlist-import';
import {albumTrackChoice} from '../../src/library/album-acquisition';
import {songChoiceKey} from '../../src/library/selected-song';

const row=(collectionId:number,trackId:number,trackName:string,artistName:string,collectionName:string)=>({wrapperType:'track',kind:'song',collectionId,trackId,discNumber:1,trackNumber:3,trackName,artistName,collectionName,trackTimeMillis:200000});
const batch=(...results:unknown[])=>({resultCount:results.length,results});
const run=(text:string,search:(q:string)=>unknown)=>{
  const {entries}=parsePlaylistText(text),calls:string[]=[];
  return resolvePlaylist(entries,{search:async q=>{calls.push(q);return search(q);},signal:new AbortController().signal,current:()=>true}).then(r=>({...r,calls}));
};
const trackOf=(m:PlaylistMatch)=>{assert.ok(m.status==='catalog'||m.status==='direct');return m.track;};

test('parser: separators, numbering, noise, Topic suffix, comments, duplicates and the per-import cap',()=>{
  const p=parsePlaylistText(`# mi lista
1. Lana Del Rey - Say Yes To Heaven (Official Audio) #lana
Night Tapes - Topic - Swordsman
Daughter\tNeptune [Lyric Video]
solo titulo
Lana Del Rey — Say Yes To Heaven`);
  assert.deepEqual(p.entries.map(e=>[e.artist,e.title]),[['Lana Del Rey','Say Yes To Heaven'],['Night Tapes','Swordsman'],['Daughter','Neptune'],[null,'solo titulo']]);
  assert.equal(p.skipped,1);
  const many=parsePlaylistText(Array.from({length:PLAYLIST_IMPORT_MAX+5},(_,i)=>`A${i} - T${i}`).join('\n'));
  assert.equal(many.entries.length,PLAYLIST_IMPORT_MAX);assert.equal(many.truncated,5);
});
test('catalogue hit keeps its own album and duration; featured credits are ignored, version words are not',async()=>{
  const r=await run('RADWIMPS - Suzume\nGolden Cats - Sheer (Light)',q=>q.includes('Suzume')
    ?batch(row(11,101,'Suzume (feat. Toaka)','RADWIMPS','Suzume OST'))
    :batch(row(12,102,'Sheer','Golden Cats','Sheer EP')));
  assert.equal(r.matches[0].status,'catalog');
  assert.equal(trackOf(r.matches[0]).album,'Suzume OST');
  assert.equal(r.matches[1].status,'direct');   // "(Light)" is a version: no silent match to plain "Sheer"
});
test('no artist is never matched; an artist mismatch in the catalogue falls back to direct',async()=>{
  const r=await run('solo titulo\nNight Tapes - Swordsman',()=>batch(row(1,1,'Swordsman','Another Band','X')));
  assert.equal(r.matches[0].status,'unresolved');
  assert.equal(r.matches[1].status,'direct');
  assert.equal(r.calls.length,1);  // no query for the artist-less line
});
test('catalogue error or throw does not end the batch: the bot is still tried directly',async()=>{
  const r=await run('A One - Song One\nA Two - Song Two',q=>{if(q.includes('One'))throw Error('boom');return null;});
  assert.deepEqual(r.matches.map(m=>m.status),['direct','direct']);
});
test('direct tracks produce a valid lrclib choice without album/duration; catalogue tracks stay iTunes',async()=>{
  const r=await run('Night Tapes - Swordsman\nRADWIMPS - Suzume',q=>q.includes('Suzume')?batch(row(11,101,'Suzume','RADWIMPS','OST')):null);
  const detail=playlistDetail('Mi playlist',r.matches);
  assert.equal(detail.tracks.length,2);
  const [direct,catalog]=detail.tracks.map(t=>albumTrackChoice(t,detail.edition.title));
  assert.equal(direct.source,'lrclib');assert.equal(direct.album,null);assert.equal(direct.duration,null);
  assert.ok(songChoiceKey(direct),'direct choice must pass the app identity check');
  assert.equal(catalog.source,'itunes');assert.equal(catalog.album,'OST');assert.ok(songChoiceKey(catalog));
  // deterministic across imports so a repeat import finds its previous copy
  const again=await run('Night Tapes - Swordsman',()=>null);
  assert.equal(albumTrackChoice(trackOf(again.matches[0]),'x').id,direct.id);
});
test('cancellation stops without reporting a partial result as complete',async()=>{
  const ac=new AbortController(),{entries}=parsePlaylistText('A - One\nB - Two\nC - Three');let n=0;
  const r=await resolvePlaylist(entries,{search:async()=>{if(++n===1)ac.abort();return null;},signal:ac.signal,current:()=>true});
  assert.equal(r.complete,false);assert.ok(r.matches.length<3);
});
