import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlaylistId,youtubeItemsToLines,loadYoutubePlaylist} from '../../src/library/youtube-playlist';
import {parsePlaylistText,PLAYLIST_IMPORT_MAX} from '../../src/library/playlist-import';
import handler from '../../api/youtube-playlist.js';

const ID='PLymdogRYFRdJDRc2TzZnE5OCw-sRpyXEm';

test('playlist id: full links, watch links with list, bare id; anything else is rejected',()=>{
  assert.equal(parsePlaylistId(`https://www.youtube.com/playlist?list=${ID}`),ID);
  assert.equal(parsePlaylistId(`https://www.youtube.com/watch?v=abc123&list=${ID}&index=2`),ID);
  assert.equal(parsePlaylistId(`https://music.youtube.com/playlist?list=${ID}#x`),ID);
  assert.equal(parsePlaylistId(` ${ID} `),ID);
  for(const bad of ['','hola','https://example.com/','https://www.youtube.com/watch?v=abc','list=corto','x'.repeat(80)])assert.equal(parsePlaylistId(bad),null,bad);
});
test('items to lines: Topic channel is the artist, "Artist - Title" kept, shorts/mixes ignored',()=>{
  const {lines,ignored}=youtubeItemsToLines([
    {title:'Melatonin',channel:'TUZI - Topic'},
    {title:'Lana Del Rey - Say Yes To Heaven (Official Audio)',channel:'Lana Del Rey'},
    {title:'Suzume (feat. Toaka)',channel:'RADWIMPS'},
    {title:'¿Quién programó este juego 💀 #shorts #gracioso',channel:'Burly VODs'},
    {title:'I WANT YOU | Bedroom R&B After Hours | Late Night Lovers Playlist (pt.21)',channel:'ONLYOU'},
    {title:'Solo titulo',channel:''},
  ]);
  assert.deepEqual(lines,['TUZI - Melatonin','Lana Del Rey - Say Yes To Heaven (Official Audio)','RADWIMPS - Suzume (feat. Toaka)','Solo titulo']);
  assert.equal(ignored,2);
});
test('the importer takes 30 per batch and keeps the rest ready for the next one',()=>{
  const lines=Array.from({length:70},(_,i)=>`A${i} - T${i}`);
  const first=parsePlaylistText(lines.join('\n'));
  assert.equal(first.entries.length,PLAYLIST_IMPORT_MAX);assert.equal(first.truncated,40);
  const second=parsePlaylistText(first.remaining);
  assert.equal(second.entries[0].raw,'A30 - T30');assert.equal(second.entries.length,30);
  const third=parsePlaylistText(second.remaining);
  assert.equal(third.entries.length,10);assert.equal(third.remaining,'');
});
const reply=(status:number,body:unknown)=>async()=>new Response(JSON.stringify(body),{status});
const signal=()=>new AbortController().signal;
test('client: maps API failures to specific reasons and validates the payload',async()=>{
  const ok={name:'HIGH & TRIP',total:2,truncated:false,items:[{title:'a',channel:'b'}]};
  assert.deepEqual((await loadYoutubePlaylist(ID,{signal:signal(),fetcher:reply(200,ok) as typeof fetch}) as {value:{name:string}}).value.name,'HIGH & TRIP');
  const reason=async(status:number,body:unknown)=>(await loadYoutubePlaylist(ID,{signal:signal(),fetcher:reply(status,body) as typeof fetch}) as {reason:string}).reason;
  assert.equal(await reason(503,{error:'not-configured'}),'not-configured');
  assert.equal(await reason(404,{error:'not-found'}),'not-found');
  assert.equal(await reason(403,{error:'private'}),'private');
  assert.equal(await reason(429,{error:'quota'}),'quota');
  assert.equal(await reason(200,{name:'x',total:1,truncated:false,items:[{title:1,channel:''}]}),'invalid');
  assert.equal(await reason(200,{...ok,items:Array.from({length:1501},()=>({title:'a',channel:''}))}),'invalid');
  assert.equal((await loadYoutubePlaylist('nope',{signal:signal(),fetcher:reply(200,ok) as typeof fetch}) as {reason:string}).reason,'bad-link');
});

// --- serverless function, with Google mocked ---
function call(url:string,headers:Record<string,string>={},method='GET'){
  const out:{status?:number;body?:string}={};
  const res={setHeader(){},status(code:number){out.status=code;return res;},send(body:string){out.body=body;return res;}};
  return handler({method,url,headers} as never,res as never).then(()=>({status:out.status,body:out.body?JSON.parse(out.body):null}));
}
test('function: not configured, bad id, cross-site and wrong method are rejected before any request',async()=>{
  const realFetch=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;return new Response('{}');}) as typeof fetch;
  try{
    delete process.env.YOUTUBE_API_KEY;
    assert.equal((await call(`/api/youtube-playlist?list=${ID}`)).status,503);
    process.env.YOUTUBE_API_KEY='k';
    assert.equal((await call('/api/youtube-playlist?list=x')).status,400);
    assert.equal((await call(`/api/youtube-playlist?list=${ID}`,{'sec-fetch-site':'cross-site'})).status,403);
    assert.equal((await call(`/api/youtube-playlist?list=${ID}`,{},'POST')).status,405);
    assert.equal(calls,0);
  }finally{globalThis.fetch=realFetch;delete process.env.YOUTUBE_API_KEY;}
});
test('function: pages through the playlist, hides deleted/private videos, returns only titles and channels',async()=>{
  const realFetch=globalThis.fetch;const seen:string[]=[];
  globalThis.fetch=(async(url:string)=>{
    seen.push(url);const u=new URL(url);
    if(u.pathname.endsWith('/playlists'))return new Response(JSON.stringify({items:[{snippet:{title:'HIGH & TRIP'}}]}));
    const second=u.searchParams.get('pageToken')==='p2';
    return new Response(JSON.stringify(second
      ?{pageInfo:{totalResults:3},items:[{snippet:{title:'Last',videoOwnerChannelTitle:'Z - Topic',resourceId:{videoId:'secret'}}}]}
      :{pageInfo:{totalResults:3},nextPageToken:'p2',items:[{snippet:{title:'One',videoOwnerChannelTitle:'A'}},{snippet:{title:'Deleted video'}},{snippet:{title:'Private video'}}]}));
  }) as unknown as typeof fetch;
  try{
    process.env.YOUTUBE_API_KEY='k';
    const {status,body}=await call(`/api/youtube-playlist?list=${ID}`);
    assert.equal(status,200);assert.equal(body.name,'HIGH & TRIP');assert.equal(body.total,3);assert.equal(body.truncated,false);
    assert.deepEqual(body.items,[{title:'One',channel:'A'},{title:'Last',channel:'Z - Topic'}]);
    assert.ok(!JSON.stringify(body).includes('secret'));
    assert.ok(seen.every(u=>u.startsWith('https://www.googleapis.com/youtube/v3/')));
  }finally{globalThis.fetch=realFetch;delete process.env.YOUTUBE_API_KEY;}
});
test('function: upstream errors map to not-found, private and quota without leaking the key',async()=>{
  const realFetch=globalThis.fetch;process.env.YOUTUBE_API_KEY='secret-key';
  const upstream=(status:number,reason:string)=>{globalThis.fetch=(async()=>new Response(JSON.stringify({error:{errors:[{reason}]}}),{status})) as typeof fetch;};
  try{
    upstream(404,'playlistNotFound');assert.equal((await call(`/api/youtube-playlist?list=${ID}`)).status,404);
    upstream(403,'playlistItemsNotAccessible');assert.equal((await call(`/api/youtube-playlist?list=${ID}`)).status,403);
    upstream(403,'quotaExceeded');const quota=await call(`/api/youtube-playlist?list=${ID}`);assert.equal(quota.status,429);
    assert.ok(!JSON.stringify(quota).includes('secret-key'));
  }finally{globalThis.fetch=realFetch;delete process.env.YOUTUBE_API_KEY;}
});
