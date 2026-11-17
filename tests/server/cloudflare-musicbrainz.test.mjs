import {test} from 'node:test';import assert from 'node:assert/strict';
import {createMusicBrainzRelay,musicBrainzUpstream,musicBrainzFetch} from '../../deployment/cloudflare/musicbrainz-relay.mjs';
const id='266569e4-3060-4f70-be69-beac84d12023';
test('backup has fixed provider endpoints and closed input; no arbitrary URL, callbacks or duplicates',()=>{
 for(const [path,q] of [['release','id=https://evil.example'],['search','term=x&callback=y'],['artists','term=x&term=y'],['artist-albums','id=1'],['artwork','id='+id+'&u=https://evil.example'],['unknown','id='+id]])assert.throws(()=>musicBrainzUpstream('/catalog/musicbrainz/'+path,q));
 const search=musicBrainzUpstream('/catalog/musicbrainz/search','term='+encodeURIComponent('a" OR artist:*')+'&artist=Nsqk');const u=new URL(search.url);assert.equal(u.origin,'https://musicbrainz.org');assert.match(u.searchParams.get('query'),/^release:"a\\" OR artist:\*" AND artist:"Nsqk"$/);
 assert.equal(new URL(musicBrainzUpstream('/catalog/musicbrainz/release','id='+id).url).searchParams.get('inc'),'recordings+artist-credits');
});
test('backup quota is independent, caches concurrent reads and identifies application',async()=>{
 let now=10000,calls=0;const times=[];const relay=createMusicBrainzRelay({clock:()=>now,sleep:async ms=>{now+=ms;},fetcher:async(url,options)=>{calls++;times.push(now);assert.match(options.headers['User-Agent'],/Pulso-Web\/0.1.*github.com\/Alegark\/Pulso-Web/);assert.equal(options.credentials,'omit');return Response.json({releases:[]});}});
 await Promise.all([relay.get('/catalog/musicbrainz/search','term=a'),relay.get('/catalog/musicbrainz/search','term=a')]);await relay.get('/catalog/musicbrainz/search','term=b');assert.equal(calls,2);assert.deepEqual(times,[10000,11100]);
});
test('backup cooldown stops further dispatch without retry',async()=>{
 let calls=0;const relay=createMusicBrainzRelay({fetcher:async()=>{calls++;return new Response(null,{status:503,headers:{'retry-after':'4'}});}});await assert.rejects(relay.get('/catalog/musicbrainz/search','term=a'),e=>e.status===503);await assert.rejects(relay.get('/catalog/musicbrainz/search','term=b'),e=>e.status===429);assert.equal(calls,1);
});
test('cover redirects are restricted, bounded and never receive visitor credentials',async()=>{
 for(const location of ['http://archive.org/a.jpg','https://evil.example/a.jpg','https://archive.org@127.0.0.1/a.jpg','https://archive.org:444/a.jpg'])await assert.rejects(musicBrainzFetch(async()=>new Response(null,{status:302,headers:{location}}),'https://coverartarchive.org/release/'+id+'/front-500',{}));
 let calls=0;const r=await musicBrainzFetch(async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return calls===1?new Response(null,{status:307,headers:{location:'https://ia800123.us.archive.org/a.jpg'}}):new Response('image');},'https://coverartarchive.org/release/'+id+'/front-500',{credentials:'omit'});assert.equal(await r.text(),'image');assert.equal(calls,2);
});
