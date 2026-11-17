import test from 'node:test';import assert from 'node:assert/strict';
import {createAccountLibraryRouter} from '../../deployment/cloudflare/account-library.mjs';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const env={PULSO_NEON_DATA_API_URL:'https://ep-test.apirest.us-east-2.aws.neon.tech/pulso/rest/v1'};
const token='TESTONLY.'+Buffer.from(JSON.stringify({sub:id})).toString('base64url')+'.TESTONLY',auth=async()=>Response.json({token});
const document={version:1,tracks:[{id,title:'Canción propia',artist:'Artista',album:'Álbum',duration:45,favorite:true,inLibrary:true,createdAt:'2026-11-17T00:00:00Z',localAlbum:null,catalog:null}],playlists:[]};
const req=(value,origin='https://pulso.test')=>new Request('https://pulso.test/api/account-library',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(value)});
test('library boundary blocks anonymous, foreign subject, cross-origin and audio fields before storage',async()=>{
 let calls=0;const route=createAccountLibraryRouter({auth,fetcher:async()=>{calls++;return Response.json([]);}});
 for(const r of [req({accountId:other,revision:null,document}),req({accountId:id,revision:null,document},'https://other.test'),req({accountId:id,revision:null,document:{...document,audio:'bytes'}})])assert.ok((await route(r,env)).status>=400);
 assert.equal(calls,0);const anonymous=createAccountLibraryRouter({auth:async()=>Response.json({token:null}),fetcher:async()=>{calls++;}});assert.equal((await anonymous(new Request('https://pulso.test/api/account-library'),env)).status,401);assert.equal(calls,0);
});
test('library metadata returned only for the authenticated subject and exact revision used for CAS',async()=>{
 let captured;const route=createAccountLibraryRouter({auth,fetcher:async(url,options)=>{captured={url:new URL(url),options,body:options.body&&JSON.parse(options.body)};return Response.json([{user_id:id,revision:4,document}]);}});
 const response=await route(req({accountId:id,revision:3,document}),env);assert.equal(response.status,200);assert.equal(captured.url.searchParams.get('user_id'),'eq.'+id);assert.equal(captured.url.searchParams.get('revision'),'eq.3');assert.equal(captured.body.revision,4);assert.equal(captured.options.method,'PATCH');assert.deepEqual(await response.json(),{accountId:id,revision:4,document});assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Authorization'),null);
});
test('conflict cannot overwrite another device and foreign-row responses are rejected',async()=>{
 let calls=0;const route=createAccountLibraryRouter({auth,fetcher:async()=>{calls++;return Response.json([]);}});assert.equal((await route(req({accountId:id,revision:3,document}),env)).status,409);assert.equal(calls,1);
 const foreign=createAccountLibraryRouter({auth,fetcher:async()=>Response.json([{user_id:other,revision:4,document}])});assert.equal((await foreign(new Request('https://pulso.test/api/account-library'),env)).status,503);
});
test('delayed authentication cannot write after deadline and body reads are bounded',async()=>{
 let release,calls=0;const route=createAccountLibraryRouter({timeoutMs:5,auth:()=>new Promise(r=>{release=r;}),fetcher:async()=>{calls++;return Response.json([]);}});assert.equal((await route(req({accountId:id,revision:null,document}),env)).status,503);release(Response.json({token}));await new Promise(r=>setTimeout(r,10));assert.equal(calls,0);
});
