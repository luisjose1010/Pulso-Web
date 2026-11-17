import assert from 'node:assert/strict';
import {build} from 'vite';
import {chromium,webkit} from 'playwright-core';
import {readFile,writeFile,mkdir,cp,symlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

// Genuine main, session client/worker and React tree; replace only the SDK factory.
// Fixtures use a synthetic phone/code and ephemeral origins, never a real session.
if(!process.env.INTERFACE_FREEZE)throw Error('INTERFACE_FREEZE required');
const frozen=resolve(process.env.INTERFACE_FREEZE),manifest=JSON.parse(await readFile(frozen+'/freeze.json'));
const run=resolve('.local/update-settings-visibility/browser-'+Date.now()),root=run+'/snapshot',out=run+'/bundle';
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={status:'INCOMPLETE',cases:[],errors:[],external:[],cleanup:false,syntheticSDK:true};
let server;
async function verify(){for(const [path,x] of Object.entries(manifest.sources)){const b=await readFile(frozen+'/frozen-root/'+path);assert.equal(b.length,x.bytes,path);assert.equal(hash(b),x.sha256,path);}return Object.keys(manifest.sources).length;}
try{
 report.beforeHashes=await verify();
 await mkdir(root,{recursive:true});
 for(const path of Object.keys(manifest.sources)){await mkdir(dirname(root+'/'+path),{recursive:true});await cp(frozen+'/frozen-root/'+path,root+'/'+path);}
 const fixture='tests/integration/update-settings-sdk.ts';await mkdir(dirname(root+'/'+fixture),{recursive:true});await cp(fixture,root+'/'+fixture);
 await symlink(resolve('node_modules'),root+'/node_modules','dir');
 let replacements=0;
 const sdk=()=>({name:'TESTONLY-update-settings-sdk',enforce:'pre',resolveId(source,importer){if(source==='./temporary-sdk'&&importer?.split('?')[0]===root+'/src/telegram/session.worker.ts'){replacements++;return root+'/'+fixture;}}});
 await build({root,configFile:false,logLevel:'error',worker:{plugins:()=>[sdk()]},build:{outDir:out,rolldownOptions:{input:root+'/index.html'}}});
 assert.equal(replacements,1,'exactly one SDK factory substitution');report.sdkReplacements=replacements;
 const py="import sys; from http.server import ThreadingHTTPServer; from functools import partial; from pathlib import Path; from scripts.serve_review import Handler; s=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=Path(sys.argv[1]))); print(s.server_port,flush=True); s.serve_forever()";
 server=spawn('python3',['-u','-c',py,out],{stdio:['ignore','pipe','pipe']});const [port]=await once(server.stdout,'data');const origin=`http://127.0.0.1:${String(port).trim()}`;
 for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]){
  let browser,context;
  try{
   browser=await launcher.launch({headless:true,...(engine==='chromium'?{executablePath:'/usr/bin/chromium',chromiumSandbox:true}:{}),proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});
   context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});context.setDefaultTimeout(10000);
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){report.external.push({engine,origin:u.origin});return route.abort();}if(u.pathname==='/telegram-config.json')return route.fulfill({contentType:'application/json',body:JSON.stringify({api_id:1,api_hash:'0'.repeat(32)})});return route.continue();});
   let denyRestore=false,restoreCalls=0;await context.route('**/__fixture-restore',route=>{restoreCalls++;return route.fulfill({status:denyRestore?503:200,body:'TESTONLY'});});
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push({engine,error:String(e)}));
   await page.goto(origin);await page.getByRole('button',{name:'Configuración',exact:true}).click();
   const card=page.getByRole('region',{name:'Actualización de la app',exact:true});
   const check=async(name,fn)=>{await fn();report.cases.push({name:engine+': '+name,status:'PASS'});};
   const visible=async()=>{await card.getByRole('button',{name:'Recargar app',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Recargar app',exact:true}).count(),1);assert.equal(await card.evaluate(el=>el.closest('.settings-view')!==null&&!el.closest('details')&&!el.closest('[hidden]')),true);const positions=await page.evaluate(()=>({card:document.querySelector('.settings-app-update').getBoundingClientRect().top,account:[...document.querySelectorAll('.settings-group>summary')].find(el=>el.textContent.includes('Cuenta y fuentes')).getBoundingClientRect().top}));assert.ok(positions.card<positions.account);};
   await check('update visible before login',visible);
   await page.locator('.settings-group>summary').filter({hasText:'Cuenta y fuentes'}).click();
   await page.getByLabel('Número de teléfono',{exact:true}).fill('+584121234567');
   await page.getByRole('checkbox',{name:/Autorizo conectar/}).check();
   await page.getByRole('button',{name:'Enviar código de acceso',exact:true}).click();
   await check('update visible during code entry',async()=>{await page.getByLabel('Código de Telegram',{exact:true}).waitFor();await visible();});
   await page.getByLabel('Código de Telegram',{exact:true}).fill('12345');await page.getByRole('button',{name:'Confirmar código',exact:true}).click();
   await check('update visible after authenticated session',async()=>{await page.getByText('Cuenta autenticada en esta pestaña. Los perfiles y las otras fuentes sólo se consultan cuando lo pides.',{exact:true}).waitFor();await visible();});
   await page.locator('.settings-group>summary').filter({hasText:'Cuenta y fuentes'}).click();
   await page.getByRole('button',{name:'Cerrar configuración',exact:true}).click();
   await page.locator('.shell-nav').getByRole('button',{name:'Biblioteca',exact:true}).click();await page.getByRole('button',{name:'Configuración',exact:true}).click();
   await check('still visible after navigation with account group closed',visible);
   await check('mobile enlarged text and keyboard access',async()=>{await page.setViewportSize({width:320,height:568});await page.evaluate(()=>{const sheet=[...document.styleSheets].find(s=>{try{return !!s.cssRules}catch{return false}});sheet.insertRule('html { font-size:200% !important }',sheet.cssRules.length);});await visible();const button=card.getByRole('button',{name:'Recargar app',exact:true});await button.focus();assert.equal(await button.evaluate(el=>el===document.activeElement),true);await button.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);await page.screenshot({path:run+'/'+engine+'-authenticated-update.png'});});
   const authenticated=()=>page.getByText('Cuenta autenticada en esta pestaña. Los perfiles y las otras fuentes sólo se consultan cuando lo pides.',{exact:true}).waitFor({state:'attached'});
   const vault=()=>page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('pulso-web-telegram-session-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('authorization'),q=tx.objectStore('authorization').getAll();let result;q.onsuccess=()=>result=q.result;tx.oncomplete=()=>resolve(JSON.stringify(result));tx.onabort=()=>reject(tx.error);});}finally{db.close();}});
   const saved=await vault();assert.ok(saved.includes('TESTONLY_SYNTHETIC_SESSION'));
   await check('manual reload preserves vault and restores authenticated session',async()=>{await Promise.all([page.waitForEvent('framenavigated',frame=>frame===page.mainFrame()),card.getByRole('button',{name:'Recargar app',exact:true}).click()]);await authenticated();assert.equal(await vault(),saved);await page.getByRole('button',{name:'Configuración',exact:true}).click();await visible();});
   await check('ordinary reload restores without phone or code',async()=>{await page.reload();await authenticated();assert.equal(await vault(),saved);});
   await check('versioned navigation retains same authorization',async()=>{await page.goto(origin+'/index.html?testonly-update=1');await authenticated();assert.equal(await vault(),saved);});
   await check('failed restore retains vault; explicit reconnect restores',async()=>{denyRestore=true;await page.reload();await page.getByRole('button',{name:'Configuración',exact:true}).click();await page.locator('.settings-group>summary').filter({hasText:'Cuenta y fuentes'}).click();await page.getByRole('alert').filter({hasText:'No se pudo completar la conexión con Telegram.'}).waitFor();assert.equal(await vault(),saved);assert.equal(await page.getByLabel('Número de teléfono',{exact:true}).isVisible(),false,'saved authorization must offer recovery, not a new login');assert.equal(await page.getByRole('button',{name:'Entrar con Telegram o QR',exact:true}).count(),0);denyRestore=false;await page.getByRole('button',{name:'Reconectar Telegram',exact:true}).click();await authenticated();assert.equal(await vault(),saved);assert.ok(restoreCalls>=4);});
   await check('local stop keeps authorization and offers reconnect, without login form',async()=>{await page.getByRole('button',{name:'Detener conexión local',exact:true}).click();await page.getByRole('button',{name:'Reconectar Telegram',exact:true}).waitFor();assert.equal(await vault(),saved);assert.equal(await page.getByLabel('Número de teléfono',{exact:true}).count(),0);});
   await check('explicit forget removes saved authorization then permits new login',async()=>{await page.getByRole('button',{name:'Eliminar sesión guardada',exact:true}).click();await page.getByLabel('Número de teléfono',{exact:true}).waitFor();assert.ok(!(await vault()).includes('TESTONLY_SYNTHETIC_SESSION'));});
   report[engine]={version:browser.version()};
  }catch(error){report.cases.push({name:engine+': execution',status:'FAIL',error:String(error.stack??error)});}finally{await context?.close();await browser?.close();}
 }
 report.status=report.cases.some(x=>x.status==='FAIL')||report.errors.length||report.external.length?'FAIL':'PASS';
}finally{
 try{report.afterHashes=await verify();}catch(error){report.status='FAIL';report.hashError=String(error);}
 if(server){server.kill();await once(server,'exit').catch(()=>{});}
 report.cleanup=true;await writeFile(run+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({run,...report},null,2));if(report.status!=='PASS')process.exitCode=1;
}
