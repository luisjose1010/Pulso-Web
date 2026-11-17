import {build,preview} from 'vite';
import {chromium,webkit} from 'playwright-core';
import {writeFile} from 'node:fs/promises';
import {createTestWorkspace} from './test-workspace.mjs';
const ws=await createTestWorkspace('download-removal-batch'),report={cases:[],errors:[],external:[]};let server;
try{
 await writeFile(`${ws.dir}/fixture.html`,'<script type="module" src="/tests/integration/download-removal-batch-fixture.ts"></script>');
 await build({configFile:false,logLevel:'error',build:{outDir:`${ws.dir}/bundle`,rolldownOptions:{input:`${ws.dir}/fixture.html`}}});
 await build({configFile:false,logLevel:'error',define:{SHELL_FILES:'[]'},build:{emptyOutDir:false,outDir:`${ws.dir}/bundle`,lib:{entry:'src/service-worker/sw.ts',formats:['es'],fileName:()=> 'sw.js'}}});
 server=await preview({configFile:false,build:{outDir:`${ws.dir}/bundle`},preview:{host:'127.0.0.1',port:0}});const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]){let browser,context;try{
  browser=await launcher.launch(engine==='chromium'?{headless:true,executablePath:'/usr/bin/chromium'}:{headless:true});context=await browser.newContext();
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(report.external.push(route.request().url()),route.abort()));
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));await page.goto(`${origin}/${ws.dir}/fixture.html${engine==='webkit'?'?idb':''}`);
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
  await page.waitForFunction(()=>!!window.batchRun);
  if(process.env.PULSO_BATCH_FOCUS!=='cancel')report.cases.push({engine,batch:await page.evaluate(()=>window.batchRun()),safety:await page.evaluate(()=>window.batchSafety()),ack:await page.evaluate(()=>window.batchAck())});
  report.cases.push({engine,queuedCancel:await page.evaluate(()=>window.batchQueuedCancel())});
 }finally{await context?.close();await browser?.close();}}
 if(report.errors.length||report.external.length)throw Error('Unexpected browser errors/network');report.status='PASS';
}catch(e){report.status='FAIL';report.error=String(e.stack||e);}
finally{if(server)await new Promise(r=>server.httpServer.close(r));report.cleanup=await ws.cleanup();await writeFile(`${ws.evidence}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({evidence:ws.evidence,...report},null,2));if(report.status!=='PASS')process.exitCode=1;}
