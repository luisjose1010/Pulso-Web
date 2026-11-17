import test from 'node:test';import assert from 'node:assert/strict';
import {downloadLibrarySelection} from '../../src/library/library-download';
import type {Track} from '../../src/library/library';
import type {SongPlaybackAttempt} from '../../src/library/selected-song';
const track:Track={id:'11111111-1111-4111-8111-111111111111',title:'Propia',artist:'Artista',album:'Álbum',duration:60,favorite:false,revision:1,createdAt:'2026-11-17T00:00:00Z',manualOverrides:{},assetId:null};
test('downloading a restored selection reuses verified copies, preserves organization and never invokes playback',async()=>{
 let looked=0,saved=0,added=0,played=0,final:any;
 const attempt:SongPlaybackAttempt={current:()=>true,lookup:async c=>{looked++;assert.equal(c.id,'local:'+track.id);return track.id;},save:async()=>{saved++;return {state:'failed',trackId:null};},addToLibrary:async()=>{added++;return true;},play:async()=>{played++;return 'failed';}};
 const client={captureBotsCurrent:()=>()=>true,searchBot:()=>{throw Error('no search');}} as never;
 await downloadLibrarySelection({tracks:[track],attempt,client,providers:[],revision:1,signal:new AbortController().signal,current:()=>true,update:(rows,message)=>{final={rows,message};}});
 assert.equal(looked,1);assert.equal(saved,0);assert.equal(added,0);assert.equal(played,0);assert.equal(final.rows[0].state,'reused');assert.equal(final.rows[0].confirmed,true);
});
test('restored metadata uses its original catalogue credit for a later download',async()=>{
 const selected={...track,artist:'Etiqueta extendida',catalogChoice:{id:'lrclib:1',source:'lrclib' as const,title:'Propia',artist:'Artista',album:'Álbum',duration:60}};
 let artist:string|null=null;const attempt:SongPlaybackAttempt={current:()=>true,lookup:async c=>{artist=c.artist;return track.id;},save:async()=>{throw Error('no save');},addToLibrary:async()=>{throw Error('no add');},play:async()=>{throw Error('no play');}};
 await downloadLibrarySelection({tracks:[selected],attempt,client:{captureBotsCurrent:()=>()=>true} as never,providers:[],revision:1,signal:new AbortController().signal,current:()=>true,update:()=>{}});assert.equal(artist,'Artista');
});
