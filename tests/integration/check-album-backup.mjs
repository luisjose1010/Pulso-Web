import assert from 'node:assert/strict';import {build} from 'vite';import {chromium,webkit} from 'playwright-core';
import {mkdir,cp,readFile,writeFile,symlink} from 'node:fs/promises';import {resolve,dirname} from 'node:path';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';import {once} from 'node:events';
if(!process.env.INTERFACE_FREEZE)throw Error('INTERFACE_FREEZE required');
const frozen=resolve(process.env.INTERFACE_FREEZE),manifest=JSON.parse(await readFile(frozen+'/freeze.json')),run=resolve('.local/album-provider-investigation/browser-'+Date.now()),root=run+'/snapshot',out=run+'/bundle';
const sha=b=>createHash('sha256').update(b).digest('hex');
const release='266569e4-3060-4f70-be69-beac84d12023',recording=['837c16a7-ced0-4020-ab4a-4eea49d567cd','8ee26605-e780-4ede-8e78-b8f60443ab5f'],artist='ed5f6556-a20c-45e1-b743-89d2bb4141a3';
const credit=[{name:'Artista sintético',joinphrase:'',artist:{id:artist}}];
const mb=()=>({id:release,title:'Álbum sintético','artist-credit':credit,'cover-art-archive':{front:true},media:[{position:1,'track-count':2,tracks:[0,1].map(i=>({position:i+1,title:'Sintética '+i,length:30000,'artist-credit':credit,recording:{id:recording[i]}}))}]});
const album={wrapperType:'collection',collectionType:'Album',collectionId:201,collectionName:'Álbum sintético',artistName:'Artista sintético',artistId:101,trackCount:2};
const tracks=[0,1].map(i=>({wrapperType:'track',kind:'song',collectionId:201,trackId:301+i,trackName:'Sintética '+i,artistName:'Artista sintético',artistId:101,discNumber:1,discCount:1,trackNumber:i+1,trackCount:2,trackTimeMillis:30000}));
const report={status:'INCOMPLETE',cases:[],errors:[],external:[],cleanup:false,syntheticMetadata:true,realTelegram:false};let server;
const verify=async()=>{for(const [p,x] of Object.entries(manifest.sources)){const b=await readFile(frozen+'/frozen-root/'+p);assert.equal(b.length,x.bytes,p);assert.equal(sha(b),x.sha256,p);}return Object.keys(manifest.sources).length;};
try{
 report.beforeHashes=await verify();await mkdir(root,{recursive:true});for(const p of Object.keys(manifest.sources)){await mkdir(dirname(root+'/'+p),{recursive:true});await cp(frozen+'/frozen-root/'+p,root+'/'+p);}
 const fixture='tests/integration/interface-main-fixture';await mkdir(dirname(root+'/'+fixture),{recursive:true});for(const ext of ['.ts','.html'])await cp(fixture+ext,root+'/'+fixture+ext);await cp(fixture+'.ts',root+'/tests/integration/collection-removal-final-main-fixture.ts');await symlink(resolve('node_modules'),root+'/node_modules','dir');
 await build({root,configFile:false,logLevel:'error',build:{outDir:out,rolldownOptions:{input:{main:root+'/index.html',fixture:root+'/'+fixture+'.html'}}}});
 const py="import sys; from http.server import ThreadingHTTPServer; from functools import partial; from pathlib import Path; from scripts.serve_review import Handler; s=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=Path(sys.argv[1]))); print(s.server_port,flush=True); s.serve_forever()";
 server=spawn('python3',['-u','-c',py,out],{stdio:['ignore','pipe','pipe']});const [port]=await once(server.stdout,'data');const origin=`http://127.0.0.1:${String(port).trim()}`;
 for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]){
  let browser;try{
   browser=await launcher.launch({headless:true,...(engine==='chromium'?{executablePath:'/usr/bin/chromium',chromiumSandbox:true}:{}),proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});
   for(const mode of ['healthy','search-http','search-rate','search-network','detail-http','both-fail','empty-search','malformed','cancel','cached']){
    let context;try{
     context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});context.setDefaultTimeout(15000);const requests=[];let releaseHeld,markStarted;const started=new Promise(r=>markStarted=r);
     const held=new Promise(r=>releaseHeld=r);
     await context.addInitScript(()=>{try{delete Navigator.prototype.serviceWorker}catch{};window.__audio=[];window.__sessionWorkers=0;const A=window.Audio,W=window.Worker;window.Audio=class extends A{constructor(...a){super(...a);window.__audio.push(this);}};window.Worker=class extends W{constructor(url,...args){super(url,...args);if(String(url).includes('session.worker'))window.__sessionWorkers++;}};});
     const page=await context.newPage();const cover=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=500;const ctx=c.getContext('2d');ctx.fillStyle='#246386';ctx.fillRect(0,0,500,500);return c.toDataURL('image/png').split(',')[1];}),'base64');page.on('pageerror',e=>report.errors.push({engine,mode,error:String(e)}));
     await context.route('**/*',async route=>{const u=new URL(route.request().url());
      const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
      if(u.origin===origin&&u.pathname==='/catalog-config.json')return json({version:1,itunes:false,artwork:true,musicbrainz:true});
      if(u.origin==='https://lrclib.net')return json([]);
      if(u.origin==='https://itunes.apple.com'){
       requests.push('itunes:'+u.pathname);
       if(mode==='search-network')return route.abort();if(mode==='search-rate')return json({},429);if(mode==='empty-search')return json({resultCount:0,results:[]});
       if(!['healthy','detail-http'].includes(mode))return json({},500);
       if(u.pathname==='/lookup')return mode==='detail-http'?json({},502):json({resultCount:3,results:[album,...tracks]});
       const entity=u.searchParams.get('entity');const results=entity==='album'?[album]:entity==='song'?tracks:[];return json({resultCount:results.length,results});
      }
      if(u.origin===origin&&u.pathname.startsWith('/catalog/musicbrainz/')){
       requests.push('musicbrainz:'+u.pathname.split('/').at(-1));
       if(['both-fail','empty-search'].includes(mode))return json({},503);
       if(u.pathname.endsWith('/search')){markStarted();if(mode==='cancel')await held;return json({releases:[mb()]});}
       if(u.pathname.endsWith('/artists'))return json({artists:[]});
       if(u.pathname.endsWith('/release')){const value=mb();if(mode==='malformed')value.media[0].tracks.pop();return json(value);}
       if(u.pathname.endsWith('/artwork'))return route.fulfill({status:200,contentType:'image/png',body:cover});
      }
      if(u.origin===origin||['blob:','data:'].includes(u.protocol))return route.continue();report.external.push({engine,mode,origin:u.origin});return route.abort();
     });
     const inventory=()=>page.evaluate(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('pulso-web-local-v1');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});try{const result={};for(const name of ['assets','tracks','playlists'])result[name]=await new Promise((r,j)=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});return JSON.stringify(result);}finally{db.close();}});
     if(mode==='cached'){await page.goto(origin+'/'+fixture+'.html');await page.waitForFunction(()=>!!window.setupCollectionFixture);await page.evaluate(()=>window.setupCollectionFixture());}
     await page.goto(origin);const before=mode==='cached'?await inventory():null;
     await page.locator('.shell-nav').getByRole('button',{name:'Buscar',exact:true}).click();await page.locator('.music-search input[type=search]').fill('Álbum sintético');
     const row=page.locator('.music-search-catalog [data-catalog-kind=album]').filter({hasText:'Álbum sintético'});
     if(mode==='cancel'){
      await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error('backup did not start')),10000))]);await page.locator('.music-search input[type=search]').fill('');releaseHeld();await page.waitForTimeout(400);assert.equal(await row.count(),0);assert.equal(await page.locator('.album-tracks>li').count(),0);
     }else if(['both-fail','empty-search'].includes(mode)){
      await page.getByText('No se pudieron consultar algunos álbumes o artistas.',{exact:false}).first().waitFor();assert.equal(await row.count(),0);assert.equal(await page.getByText(/No se encontraron ediciones/).count(),0);
     }else{
      await row.first().waitFor();await row.first().click();
      if(mode==='malformed'){
       await page.locator('.album-page').getByText(/No se pudo verificar la lista completa/).waitFor();assert.equal(await page.locator('.album-tracks>li').count(),0);
      }else{
       await page.waitForFunction(()=>document.querySelectorAll('.album-tracks>li').length===2);
       if(mode==='healthy')assert.equal(requests.filter(x=>x.startsWith('musicbrainz:')).length,0);
       else{assert.ok(requests.some(x=>x==='musicbrainz:release'));await page.waitForFunction(()=>document.querySelector('.album-art img')?.naturalWidth===500);await page.locator('.catalog-sources>summary').last().click();assert.ok((await page.locator('.album-page').innerText()).includes('MusicBrainz'));}
       assert.equal(await page.evaluate(()=>window.__sessionWorkers),0,'opening album must not contact Telegram');
       if(mode==='cached'){
        await page.waitForFunction(()=>[...document.querySelectorAll('.album-track-badges')].every(e=>e.textContent.includes('Descargada')));
        await page.getByRole('button',{name:'Añadir álbum',exact:true}).click();await page.getByText('2/2 en Biblioteca',{exact:false}).waitFor();assert.equal(await inventory(),before,'reusing album copies must not alter audio or metadata');
        await page.locator('.album-tracks>li').first().getByRole('button').click();await page.waitForFunction(()=>window.__audio.length===1&&!window.__audio[0].paused&&window.__audio[0].currentTime>.05);assert.equal(await page.evaluate(()=>window.__sessionWorkers),0);assert.equal(await inventory(),before);
        await page.locator('.mini-player').getByRole('button',{name:'Pausar desde minirreproductor',exact:true}).click();
       }
      }
     }
     report.cases.push({name:engine+': '+mode,status:'PASS',requests});releaseHeld();await writeFile(run+'/progress.json',JSON.stringify(report,null,2));
    }catch(error){report.cases.push({name:engine+': '+mode,status:'FAIL',error:String(error.stack??error)});await writeFile(run+'/progress.json',JSON.stringify(report,null,2));}finally{await context?.close();}
   }
   report[engine]={version:browser.version()};
  }finally{await browser?.close();}
 }
 report.status=report.cases.some(c=>c.status==='FAIL')||report.errors.length||report.external.length?'FAIL':'PASS';
}finally{try{report.afterHashes=await verify();}catch(error){report.status='FAIL';report.hashError=String(error);}if(server){server.kill();await once(server,'exit').catch(()=>{});}report.cleanup=true;await writeFile(run+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({run,...report},null,2));if(report.status!=='PASS')process.exitCode=1;}
