import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogTransport} from '../../src/library/catalog-fetch';
const query='https://itunes.apple.com/search?term=Night&entity=album&country=US';
const enabled=()=>Response.json({version:1,itunes:true,artwork:true});

test('browser metadata and relayed artwork can use independent capability flags',async()=>{
 const calls:{url:string;options:RequestInit|undefined}[]=[];
 const fake:typeof fetch=async(input,options)=>{const url=String(input);calls.push({url,options});return url.endsWith('/catalog-config.json')?Response.json({version:1,itunes:false,artwork:true}):Response.json({});};
 const client=createCatalogTransport({origin:'https://pulso.example',fetcher:fake,metadataIntervalMs:0});
 await client.fetch(query,{credentials:'omit'});await client.fetch('https://is1-ssl.mzstatic.com/own.jpg');
 assert.equal(calls[1].url,query);assert.equal(calls[1].options?.credentials,'omit');
 assert.match(calls[2].url,/^https:\/\/pulso.example\/catalog\/artwork\?/);assert.equal(client.mode(),'direct');
});
test('cancelling a queued metadata request preserves the running predecessor and never dispatches it',async()=>{
 let finish!:(r:Response)=>void;const calls:string[]=[];
 const fake:typeof fetch=async input=>{const url=String(input);if(url.endsWith('/catalog-config.json'))return Response.json({version:1,itunes:false,artwork:true});calls.push(url);return calls.length===1?new Promise<Response>(resolve=>{finish=resolve;}):Response.json({});};
 const client=createCatalogTransport({origin:'https://pulso.example',fetcher:fake,metadataIntervalMs:0});
 const first=client.fetch(query);await new Promise(resolve=>setTimeout(resolve,5));
 const abort=new AbortController(),cancelled=client.fetch(query+'&limit=1',{signal:abort.signal});abort.abort();await assert.rejects(cancelled,{name:'AbortError'});
 const third=client.fetch(query+'&limit=2');await new Promise(resolve=>setTimeout(resolve,5));assert.equal(calls.length,1);
 finish(Response.json({}));await Promise.all([first,third]);assert.equal(calls.length,2);assert.match(calls[1],/limit=2$/);
});
test('a direct metadata limit is shared and returned without a retry or dispatch',async()=>{
 let calls=0;const fake:typeof fetch=async input=>String(input).endsWith('/catalog-config.json')?Response.json({version:1,itunes:false,artwork:false}):(calls++,new Response(null,{status:429,headers:{'Retry-After':'8'}}));
 const client=createCatalogTransport({origin:'https://pulso.example',fetcher:fake,metadataIntervalMs:0});
 assert.equal((await client.fetch(query)).status,429);const later=await client.fetch(query+'&limit=2');assert.equal(later.status,429);assert.ok(Number(later.headers.get('retry-after'))>=7);assert.equal(calls,1);
});

test('capability probe is lazy and shared; public metadata and covers use own origin',async()=>{
 const calls:{url:string;options:RequestInit|undefined}[]=[];
 const fake:typeof fetch=async(input,options)=>{const url=String(input);calls.push({url,options});return url.endsWith('/catalog-config.json')?enabled():Response.json({results:[]});};
 const client=createCatalogTransport({origin:'https://pulso.example',fetcher:fake});assert.equal(calls.length,0);
 await Promise.all([client.fetch(query),client.fetch(query),client.fetch('https://is1-ssl.mzstatic.com/image/own.jpg')]);
 assert.equal(calls.filter(c=>c.url.endsWith('/catalog-config.json')).length,1);assert.equal(client.mode(),'relay');
 assert.ok(calls.slice(1).every(c=>c.url.startsWith('https://pulso.example/catalog/')));
 assert.ok(calls.slice(1).every(c=>c.options?.credentials==='same-origin'&&c.options.redirect==='error'));
});
test('disabled or missing relay retains direct transport',async()=>{
 for(const config of [()=>Response.json({version:1,itunes:false,artwork:false}),()=>new Response('',{status:404})]){
  const urls:string[]=[];const fake:typeof fetch=async input=>{urls.push(String(input));return String(input).endsWith('/catalog-config.json')?config():Response.json({});};
  const client=createCatalogTransport({origin:'https://pulso.example',fetcher:fake});await client.fetch(query);assert.equal(urls[1],query);assert.equal(client.mode(),'direct');
 }
});
test('relay failure is returned without another provider request',async()=>{
 const urls:string[]=[];const fake:typeof fetch=async input=>{urls.push(String(input));return String(input).endsWith('/catalog-config.json')?enabled():new Response('',{status:503,headers:{'Retry-After':'5'}});};
 const client=createCatalogTransport({origin:'https://pulso.example',fetcher:fake});assert.equal((await client.fetch(query)).status,503);assert.equal(urls.length,2);assert.ok(!urls.includes(query));
});
test('aborting while probing never dispatches the cancelled resource',async()=>{
 let finish!:(r:Response)=>void;let resources=0;
 const fake:typeof fetch=async input=>String(input).endsWith('/catalog-config.json')?new Promise<Response>(resolve=>{finish=resolve;}):(resources++,Response.json({}));
 const client=createCatalogTransport({origin:'https://pulso.example',fetcher:fake});const controller=new AbortController();const work=client.fetch(query,{signal:controller.signal});controller.abort();
 await assert.rejects(work,{name:'AbortError'});finish(enabled());await client.fetch(query);assert.equal(resources,1);
});
test('a noncooperative probe is bounded and a late capability cannot change the selected mode',async()=>{
 let finish!:(r:Response)=>void;let resources=0;
 const fake:typeof fetch=async input=>String(input).endsWith('/catalog-config.json')?new Promise<Response>(resolve=>{finish=resolve;}):(resources++,Response.json({}));
 const client=createCatalogTransport({origin:'https://pulso.example',fetcher:fake,capabilityTimeoutMs:5});await client.fetch(query);assert.equal(client.mode(),'direct');finish(enabled());await Promise.resolve();await client.fetch(query);assert.equal(client.mode(),'direct');assert.equal(resources,2);
});
test('oversized capabilities cannot enable relay; server-side imports do not probe',async()=>{
 const urls:string[]=[];const fake:typeof fetch=async input=>{urls.push(String(input));return String(input).endsWith('/catalog-config.json')?new Response(' '.repeat(1025)):Response.json({});};
 await createCatalogTransport({origin:'https://pulso.example',fetcher:fake}).fetch(query);assert.equal(urls[1],query);
 urls.length=0;await createCatalogTransport({origin:null,fetcher:fake}).fetch(query);assert.deepEqual(urls,[query]);
});

test('mobile Apple search uses the explicit music entity without the native-app media route',async()=>{
 for(const entity of ['album','song','musicArtist']){
  const source=`https://itunes.apple.com/search?term=mosca+Nsqk&country=US&media=music&entity=${entity}&limit=20`;
  const calls:{url:string;options:RequestInit|undefined}[]=[];
  const fake:typeof fetch=async(input,options)=>{const url=String(input);calls.push({url,options});return url.endsWith('/catalog-config.json')?Response.json({version:1,itunes:false,artwork:true}):Response.json({});};
  const client=createCatalogTransport({origin:'https://pulso.example',fetcher:fake,metadataIntervalMs:0});
  await client.fetch(source,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
  const actual=new URL(calls[1].url);assert.equal(actual.origin,'https://itunes.apple.com');assert.equal(actual.pathname,'/search');assert.equal(actual.searchParams.get('term'),'mosca Nsqk');assert.equal(actual.searchParams.get('entity'),entity);assert.equal(actual.searchParams.get('country'),'US');assert.equal(actual.searchParams.get('limit'),'20');assert.equal(actual.searchParams.has('media'),false);assert.equal(actual.searchParams.has('callback'),false);
  assert.equal(calls[1].options?.redirect,'error');assert.equal(calls[1].options?.credentials,'omit');
 }
});
test('Safari route normalization leaves lookups, relay and other media unchanged',async()=>{
 for(const [relay,url] of [[false,'https://itunes.apple.com/lookup?id=42&media=music&entity=song'],[false,'https://itunes.apple.com/search?term=Own&media=podcast&entity=podcast'],[true,'https://itunes.apple.com/search?term=Own&media=music&entity=album']] as const){
  const calls:string[]=[];const fake:typeof fetch=async input=>{const u=String(input);calls.push(u);return u.endsWith('/catalog-config.json')?Response.json({version:1,itunes:relay,artwork:true}):Response.json({});};
  const client=createCatalogTransport({origin:'https://pulso.example',fetcher:fake,metadataIntervalMs:0});await client.fetch(url);
  assert.equal(new URL(calls[1]).search,new URL(url).search);assert.equal(new URL(calls[1]).pathname,relay?'/catalog/itunes/search':new URL(url).pathname);
 }
});
