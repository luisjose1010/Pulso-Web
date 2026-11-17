import {build,preview} from 'vite';
import {chromium,webkit} from 'playwright-core';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='.local/design-search-mobile/focal';await mkdir(dir,{recursive:true});
const report={status:'INCOMPLETE',cases:[],errors:[],external:[],cleanup:false};
const check=async(name,fn)=>{try{await fn();report.cases.push({name,status:'PASS'});}catch(error){report.cases.push({name,status:'FAIL',error:String(error.stack||error)});}};
let server;
try{
 await writeFile(`${dir}/fixture.html`,'<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Buscar · datos sintéticos</title><div id="root"></div><script type="module" src="/tests/integration/search-mobile-ui-fixture.tsx"></script></html>');
 await build({configFile:false,logLevel:'error',build:{outDir:`${dir}/bundle`,rolldownOptions:{input:`${dir}/fixture.html`}}});
 server=await preview({configFile:false,build:{outDir:`${dir}/bundle`},preview:{host:'127.0.0.1',port:0,strictPort:true}});
 const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await launcher.launch(engine==='chromium'?{executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:true}:{headless:true});let context;
  try{
   context=await browser.newContext({viewport:{width:390,height:664},isMobile:true,hasTouch:true,serviceWorkers:'block'});
   await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();report.external.push({engine,url:route.request().url()});return route.abort();});
   await context.addInitScript(()=>{window.uiIO=[];const deny=name=>()=>{window.uiIO.push(name);throw Error('Forbidden fixture IO: '+name);};window.fetch=deny('fetch');window.WebSocket=deny('WebSocket');indexedDB.open=deny('idb');HTMLMediaElement.prototype.play=deny('play');});
   const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',error=>report.errors.push({engine,error:String(error)}));
   await page.goto(`${origin}/${dir}/fixture.html`);await page.waitForFunction(()=>window.searchUI);
   const host=(method,...args)=>page.evaluate(({method,args})=>window.searchUI[method](...args),{method,args});
   const calls=()=>page.evaluate(()=>window.searchUI.calls);
   const input=page.getByRole('searchbox');const reset=async()=>{await host('reset');await page.setViewportSize({width:390,height:664});await page.evaluate(()=>document.documentElement.style.fontSize='100%');};
   await check(`${engine}: typing produces a mixed in-flow list and keeps focus`,async()=>{
    await input.fill('Luna Norte');assert.deepEqual(await calls(),[['query','Luna Norte']]);
    assert.equal(await page.locator('input:focus').count(),1);assert.equal(await page.locator('[role=combobox],[role=listbox],.music-search-dropdown').count(),0);
    assert.deepEqual(await page.locator('.catalog-mixed-list [data-suggestion-id]').evaluateAll(rows=>rows.map(r=>r.dataset.suggestionId)),['artist','album','track']);
    for(const text of ['Artista','Álbum · Luna Norte','Canción · Luna Norte · Órbita lenta'])await page.locator('.catalog-row-meta').getByText(text,{exact:true}).waitFor();
    const geometry=await page.evaluate(()=>{const field=document.querySelector('.catalog-search-form').getBoundingClientRect(),list=document.querySelector('.catalog-mixed-list').getBoundingClientRect();return {fieldBottom:field.bottom,listTop:list.top,position:getComputedStyle(document.querySelector('.music-search-catalog')).position,fieldTop:field.top};});
    assert.ok(geometry.listTop>=geometry.fieldBottom);assert.ok(!['fixed','absolute'].includes(geometry.position));assert.ok(geometry.fieldTop<48);
    await host('set',{suggestionsPending:true});await host('set',{suggestionsPending:false});assert.equal(await input.evaluate(e=>document.activeElement===e),true);
    await page.screenshot({path:`${dir}/${engine}-mixed.png`});
   });
   await check(`${engine}: type filters and native Enter keep distinct callbacks`,async()=>{
    await page.getByRole('button',{name:'Álbumes',exact:true}).click();assert.deepEqual(await page.locator('[data-suggestion-id]').evaluateAll(rows=>rows.map(r=>r.dataset.suggestionId)),['album']);
    await page.getByRole('button',{name:'Todo',exact:true}).click();await host('clear');await input.press('Enter');assert.deepEqual(await calls(),[['search']]);
    await page.locator('[data-suggestion-id=artist]').click();await page.locator('[data-suggestion-id=album]').click();await page.locator('[data-suggestion-id=track]').click();assert.deepEqual(await calls(),[['search'],['choose','artist','artist'],['choose','album','album'],['choose','track','track']]);
   });
   await check(`${engine}: clear keeps editing; Cancel exits without submitting`,async()=>{
    await host('clear');await page.getByRole('button',{name:'Borrar búsqueda'}).click();assert.equal(await input.inputValue(),'');assert.equal(await input.evaluate(e=>e===document.activeElement),true);assert.equal(await page.locator('[data-suggestion-id]').count(),0);assert.deepEqual(await calls(),[['query','']]);
    await input.fill('Luna Norte');await host('clear');await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(await input.inputValue(),'');assert.deepEqual(await calls(),[['query','']]);assert.equal(await page.getByRole('heading',{name:'Buscar música',exact:true}).evaluate(e=>e===document.activeElement),true);assert.equal(await page.locator('.pulso-wordmark').isVisible(),true);
    await input.fill('Luna Norte');await host('show',false);assert.equal(await page.locator('.pulso-wordmark').isVisible(),true);await host('show',true);await page.locator('.fixture-search-parent').evaluate(e=>e.hidden=true);assert.equal(await page.locator('.pulso-wordmark').isVisible(),true);await page.locator('.fixture-search-parent').evaluate(e=>e.hidden=false);
   });
   await check(`${engine}: pending selection, stale handlers and retry are guarded`,async()=>{
    await host('set',{searchPending:true});await host('clear');assert.equal(await page.locator('[data-suggestion-id=track]').isDisabled(),true);
    await host('set',{searchPending:false,suggestionsError:'Error sintético'});await page.getByRole('button',{name:'Reintentar sugerencias'}).click();assert.deepEqual(await calls(),[['retry']]);
    await page.evaluate(()=>{const e=document.querySelector('.catalog-clear');const key=Object.keys(e).find(k=>k.startsWith('__reactProps$'));window.oldClear=e[key].onClick;});await host('clear');await host('revoke');await page.evaluate(()=>window.oldClear());assert.deepEqual(await calls(),[]);
    await reset();
   });
   await check(`${engine}: long mixed rows, text 200%, short keyboard viewport and themes`,async()=>{
    const longRows=[{id:'long',kind:'track',title:'Título sin espacios '+('Música'.repeat(70)),subtitle:'Intérprete 日本語 العربية '+('Autor'.repeat(50)),source:'lrclib'},{id:'missing',kind:'album',title:'Sin intérprete',subtitle:null,source:'itunes'}];
    // Mobile WebKit can retain the previous layout viewport after setViewportSize
    // even on a blank HTML page. Navigate at each target size so these cases
    // measure that actual mobile viewport, not an inconsistent emulation state.
    // Live resize is covered separately by the integrated non-mobile matrix.
    const mobileDocument=async(width,height,font)=>{
     await page.setViewportSize({width,height});await page.reload();await page.waitForFunction(()=>window.searchUI);
     await input.fill('Luna Norte');await host('set',{suggestions:longRows});
     await page.evaluate(font=>document.documentElement.style.fontSize=`${font}%`,font);
     assert.equal(await page.evaluate(()=>document.documentElement.clientWidth),width,'Target mobile layout viewport must match requested width');
    };
    for(const [width,height,font] of [[320,568,100],[320,480,200],[390,330,100],[844,390,200],[1366,768,100]]){
     await mobileDocument(width,height,font);
     const g=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,input:document.querySelector('input').getBoundingClientRect().width,targets:[...document.querySelectorAll('.catalog-clear,.catalog-cancel,[data-suggestion-id]')].map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height];})}));assert.equal(g.overflow,false,JSON.stringify({width,height,font,...g,offenders:await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right})).slice(0,12))}));assert.ok(g.input>=40,JSON.stringify({width,height,font,...g}));for(const [w,h] of g.targets)assert.ok(w>=44&&h>=44,JSON.stringify(g));
     await input.focus();assert.equal(await input.evaluate(e=>document.activeElement===e),true);
    }
    await mobileDocument(390,664,100);await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:`${dir}/${engine}-dark-long.png`});await page.evaluate(()=>document.documentElement.dataset.theme='light');await reset();
   });
   await check(`${engine}: optional fields and zero side effects`,async()=>{
    await reset();await input.fill('Luna Norte');
    await host('set',{suggestions:[{id:'only-artist',kind:'artist',title:'Luna Norte',subtitle:null,source:'itunes'}]});
    await page.getByRole('button',{name:'Álbumes',exact:true}).click();await page.getByRole('button',{name:'Ver todos los resultados'}).click();assert.equal(await page.locator('[data-suggestion-id=only-artist]').count(),1);
    await host('set',{suggestionsNotice:'No hay sugerencias para este nombre.'});assert.equal(await page.locator('.catalog-search-status').innerText(),'');
    await host('set',{suggestions:[],suggestionsPending:true});assert.equal(await page.locator('.catalog-empty').count(),0);
    await host('set',{suggestionsPending:false,suggestionsError:'Error sintético'});assert.equal(await page.locator('.catalog-empty').count(),0);
    await host('set',{suggestionsError:null,suggestionsNotice:'Escribe entre 3 y 160 caracteres para obtener sugerencias.'});assert.equal(await page.locator('.catalog-empty').count(),0);
    await host('set',{suggestionsNotice:null});await page.locator('.catalog-empty').waitFor();await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.uiIO),[]);
    await page.setViewportSize({width:320,height:480});await page.reload();await page.waitForFunction(()=>window.searchUI);await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.equal(await page.evaluate(()=>document.documentElement.clientWidth),320);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(await page.evaluate(()=>window.uiIO),[]);
   });
   report[engine]={version:browser.version()};
  }finally{await context?.close();await browser.close();}
 }
 report.status=report.cases.some(c=>c.status==='FAIL')||report.errors.length||report.external.length?'FAIL':'PASS';
}catch(error){report.status='FAIL';report.error=String(error.stack||error);}finally{
 if(server)await new Promise(resolve=>server.httpServer.close(resolve));report.cleanup=true;
 report.sources={};for(const path of ['src/ui/MusicSearchPanel.tsx','src/ui/music-search.css','tests/integration/search-mobile-ui-fixture.tsx','tests/integration/check-search-mobile-ui.mjs']){const data=await readFile(path);report.sources[path]={bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};}
 await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;
}
