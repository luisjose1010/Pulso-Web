import {createTestWorkspace} from './test-workspace.mjs';
import {build,preview} from 'vite';
import {chromium,webkit} from 'playwright-core';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const workspace=await createTestWorkspace('notification-settings'),{dir,evidence}=workspace;
const report={cases:[],errors:[],external:[],scope:'Synthetic browser permissions; native Chromium local registration separately. No physical iPhone/Android.'};let server;
try{
await writeFile(`${dir}/fixture.html`,'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/integration/notification-settings-fixture.tsx"></script>');

await build({configFile:false,logLevel:'error',build:{outDir:`${dir}/bundle`,rolldownOptions:{input:`${dir}/fixture.html`}}});
await build({configFile:false,logLevel:'error',define:{SHELL_FILES:'[]'},build:{emptyOutDir:false,outDir:`${dir}/bundle`,lib:{entry:'src/service-worker/sw.ts',formats:['es'],fileName:()=> 'sw.js'}}});
if(process.env.PULSO_TEST_FAIL_AFTER_BUILD==='1')throw Error('Injected teardown verification failure after build');
server=await preview({configFile:false,build:{outDir:`${dir}/bundle`},preview:{host:'127.0.0.1',port:0}});const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
for(const [engine,launcher]of [['chromium',chromium],['webkit',webkit]]){const browser=await launcher.launch(engine==='chromium'?{executablePath:'/usr/bin/chromium',headless:true}:{headless:true});try{
for(const mode of ['android','ios-tab','ios-installed','denied','unsupported']){
const context=await browser.newContext({viewport:{width:390,height:664},userAgent:mode.startsWith('ios')?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':'Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0.0 Mobile Safari/537.36'});
await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():(report.external.push(r.request().url()),r.abort()));
await context.addInitScript(mode=>{
 window.__requests=0;window.__shown=[];window.__permission=mode==='denied'?'denied':'default';
 Object.defineProperty(navigator,'standalone',{value:mode==='ios-installed'});
 if(mode==='unsupported'){delete window.Notification;return;}
 Object.defineProperty(window,'Notification',{configurable:true,value:{get permission(){return window.__permission;},requestPermission:async()=>{window.__requests++;window.__permission='granted';return 'granted';}}});
 if(!('showNotification'in ServiceWorkerRegistration.prototype))ServiceWorkerRegistration.prototype.showNotification=()=>Promise.resolve();
 navigator.serviceWorker.getRegistration=async()=>({active:{},showNotification:async(title,options)=>window.__shown.push({title,options}),getNotifications:async()=>[]});
},mode);
const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>report.errors.push(String(e)));await page.goto(`${origin}/${dir}/fixture.html`);await page.getByRole('heading',{name:'Avisos de descargas'}).waitFor();assert.equal(await page.evaluate(()=>window.__requests),0);
if(['android','ios-installed'].includes(mode)){await page.getByRole('button',{name:'Activar notificaciones'}).click();await page.getByRole('button',{name:'Enviar aviso de prueba'}).click();await page.waitForFunction(()=>window.__shown.length===1);assert.equal(await page.evaluate(()=>window.__requests),1);await page.getByRole('button',{name:'Desactivar avisos'}).click();assert.equal(await page.evaluate(()=>notificationTest.state().enabled),false);}else{assert.equal(await page.getByRole('button',{name:'Activar notificaciones'}).count(),0);if(mode==='ios-tab')await page.getByText(/añade Pulso a Inicio/).waitFor();}
await page.setViewportSize({width:320,height:568});await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${evidence}/${engine}-${mode}.png`});report.cases.push(`${engine}: ${mode} permission flow and text200`);await context.close();
}
if(engine==='chromium'){
const context=await browser.newContext({permissions:['notifications']});const page=await context.newPage();await page.goto(`${origin}/${dir}/fixture.html`);await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});await page.getByRole('button',{name:'Activar notificaciones'}).click();await page.getByRole('button',{name:'Enviar aviso de prueba'}).click();await page.waitForFunction(async()=>!!(await (await navigator.serviceWorker.getRegistration()).getNotifications({tag:'pulso-download-test'})).length);await page.getByRole('button',{name:'Desactivar avisos'}).click();await page.waitForFunction(async()=>!(await (await navigator.serviceWorker.getRegistration()).getNotifications({tag:'pulso-download-test'})).length);report.cases.push('chromium: real service worker showNotification/getNotifications and close, synthetic permission');await context.close();
}
}finally{await browser.close();}}
assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.error=String(e.stack||e);}finally{
 let serverStopped=true;
 try{if(server)await new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));}catch(e){serverStopped=false;report.status='FAIL';report.serverCleanupError=String(e);}
 if(serverStopped){try{report.cleanup=await workspace.cleanup();}catch(e){report.status='FAIL';report.cleanupError=String(e);}}else report.retainedTemporaryPath=dir;
 await writeFile(`${evidence}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({evidence,...report},null,2));if(report.status!=='PASS')process.exitCode=1;
}
