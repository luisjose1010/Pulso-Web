import {chromium,webkit} from 'playwright-core';
import {createServer} from 'vite';
import {writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import assert from 'node:assert/strict';
import {createTestWorkspace} from './test-workspace.mjs';
const work=await createTestWorkspace('account-library'),report={cases:[],errors:[],cleanup:false};let server;
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
try{
 await writeFile(resolve(work.dir,'index.html'),'<html><body><h1>TESTONLY account library</h1><script type="module" src="/tests/integration/account-library-fixture.ts"></script></body></html>');
 server=await createServer({configFile:false,cacheDir:resolve(work.dir,'vite-cache'),optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0,strictPort:false,watch:null},logLevel:'error'});await server.listen();const address=server.httpServer.address(),origin=`http://127.0.0.1:${address.port}`;
 for(const engine of ['chromium','webkit']){let browser,contexts=[];try{
  browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:true}:{headless:true});
  const cloud=new Map();const pages=[];
  for(let device=0;device<2;device++){
   const context=await browser.newContext();contexts.push(context);let user=id(100);
   await context.route(origin+'/api/account-library',async route=>{const req=route.request();const input=req.method()==='PUT'?req.postDataJSON():null;if(input)user=input.accountId;const old=cloud.get(user);if(input){if(input.revision!==(old?.revision??null))return route.fulfill({status:409,json:{code:'LIBRARY_CHANGED'}});cloud.set(user,{accountId:user,revision:(old?.revision??0)+1,document:input.document});}return route.fulfill({json:cloud.get(user)??{accountId:user,revision:null,document:{version:1,tracks:[],playlists:[]}}});});
   // All fixture traffic is loopback. No account, Telegram or public provider.
   await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.fallback():route.abort());
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push({engine,message:String(e)}));await page.goto(origin+'/'+work.dir+'/index.html');await page.waitForFunction(()=>window.libraryFixture);pages.push(page);
  }
  const [a,b]=pages;
  await a.evaluate(async()=>{const f=window.libraryFixture;await f.seed(1);await f.seed(2);await f.seed(3,false,true);await f.prepare(100);await f.list(10,[1,2]);});
  const before=await a.evaluate(()=>window.libraryFixture.physical());assert.equal(await a.evaluate(()=>window.libraryFixture.sync()),'saved');assert.equal(cloud.get(id(100)).document.tracks.length,2);
  await b.evaluate(()=>window.libraryFixture.prepare(100));assert.equal(await b.evaluate(()=>window.libraryFixture.sync()),'saved');let restored=await b.evaluate(()=>window.libraryFixture.snapshot());
  assert.equal(restored.document.tracks.length,2);assert.equal(restored.document.playlists[0].entries.length,2);assert.equal(restored.albums.length,1);assert.equal(restored.artists.length,1);assert.equal((await b.evaluate(()=>window.libraryFixture.physical())).assets,0);assert.ok((await b.evaluate(()=>window.libraryFixture.rows('tracks'))).every(t=>t.assetId===null));report.cases.push({engine,test:'new device restores metadata, playlist, album and artist without any audio',status:'PASS'});
  await b.evaluate(async()=>{const f=window.libraryFixture;await f.seed(4,true);await f.list(10,[1,2,4]);});await a.evaluate(()=>window.libraryFixture.mutate('tracks',window.libraryFixture.id(1),{favorite:true}));
  await b.evaluate(()=>window.libraryFixture.sync());await a.evaluate(()=>window.libraryFixture.sync());restored=cloud.get(id(100)).document;assert.equal(restored.tracks.length,3);assert.equal(restored.tracks.find(t=>t.id===id(1)).favorite,true);assert.equal(restored.playlists[0].entries.length,3);report.cases.push({engine,test:'concurrent device addition and favorite both survive',status:'PASS'});
  await a.evaluate(()=>window.libraryFixture.deleteList(10));await a.evaluate(()=>window.libraryFixture.sync());await b.evaluate(()=>window.libraryFixture.sync());assert.equal(cloud.get(id(100)).document.playlists.length,0);assert.deepEqual(await a.evaluate(()=>window.libraryFixture.physical()),before);report.cases.push({engine,test:'playlist deletion propagates without touching local bytes',status:'PASS'});
  // Account B cannot read or upload A's local organization. B is seeded with an
  // empty independent cloud response; no browser auth is involved in this fixture.
  await a.evaluate(()=>window.libraryFixture.prepare(101));const isolated=await a.evaluate(()=>window.libraryFixture.snapshot());assert.equal(isolated.document.tracks.length,0);assert.equal(isolated.document.playlists.length,0);await a.evaluate(()=>window.libraryFixture.prepare(100));assert.equal((await a.evaluate(()=>window.libraryFixture.snapshot())).document.tracks.length,3);report.cases.push({engine,test:'account switch preserves and isolates each local metadata set',status:'PASS'});
  await b.evaluate(async()=>{const f=window.libraryFixture;await f.seed(5,true,true);});const physicalBefore=await b.evaluate(()=>window.libraryFixture.physical());const linked=await b.evaluate(()=>window.libraryFixture.attach(1,5));assert.equal(linked,id(1));assert.equal((await b.evaluate(()=>window.libraryFixture.rows('tracks'))).some(t=>t.id===id(5)),false);assert.deepEqual(await b.evaluate(()=>window.libraryFixture.physical()),physicalBefore);report.cases.push({engine,test:'redownload attaches bytes to the restored identity without a second asset or dangling playlist',status:'PASS'});
 }catch(e){report.cases.push({engine,status:'FAIL',error:String(e.stack||e)});}finally{for(const c of contexts){for(const p of c.pages())await p.evaluate(()=>window.libraryFixture?.dispose()).catch(()=>{});await c.close();}await browser?.close();}}
}finally{await server?.close();report.cleanup=await work.cleanup();report.status=report.cases.some(c=>c.status==='FAIL')||report.errors.length?'FAIL':'PASS';await writeFile(resolve(work.evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({report:resolve(work.evidence,'report.json'),...report},null,2));}
if(report.status!=='PASS')process.exitCode=1;
