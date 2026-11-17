/** Real SDK adapter/provider validation/vault; only MTProto/auth/crypto are TESTONLY. */
import {build} from 'esbuild';
import {chromium,webkit} from 'playwright-core';
import {createServer} from 'node:http';
import {mkdir,writeFile,statfs} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),evidence=resolve('.local/test-evidence/default-bots-'+new Date().toISOString().replaceAll(':','-'));
await mkdir(evidence,{recursive:true});
const free=async()=>{const x=await statfs('/data');return x.bavail*x.bsize;};
const report={fixture:'TESTONLY Telegram transport/auth/crypto; real adapter, provider core, native IDB and locks',cases:[],errors:[],external:[],cleanup:false,freeBefore:await free()};
const user=`{type:'user',isSelf:true,isBot:false,id:123456,raw:{_: 'user',self:true,id:123456}}`;
const stubs=new Map([
 ['@mtcute/core/client.js',`import Long from 'long';export class BaseTelegramClient{async prepare(){}async importSession(){}async exportSession(){return 'TESTONLY_AUTHORIZATION'}async destroy(){}async call(r,o){const f=globalThis.__defaultBotsTest;f.calls.push(r._);if(r._!=='contacts.resolveUsername')throw Error('Unexpected RPC');if(f.gate)await new Promise(resolve=>f.release=resolve);if(o.abortSignal.aborted)throw Error('cancelled');const id=r.username==='kdmusic_bot'?101:102;return {_: 'contacts.resolvedPeer',peer:{_: 'peerUser',userId:id},chats:[],users:[{_: 'user',id,bot:true,username:r.username,accessHash:new Long(123,id,false),firstName:r.username}]};}}`],
 ['@mtcute/web',`export class WebPlatform{}export class WebSocketTransport{}export class MemoryStorage{}`],
 ['@mtcute/core/utils.js',`export const LogManager={OFF:0}`],
 ['@mtcute/core/methods.js',`export async function sendCode(){return ${user}}export async function getMe(){return ${user}}export async function signIn(){throw Error('unexpected')}export async function resendCode(){throw Error('unexpected')}export async function checkPassword(){throw Error('unexpected')}`],
 ['@mtcute/wasm',`export const getWasmUrl=()=>'/fixture.wasm'`],
 ['./crypto-provider',`export async function openCrypto(){return {}}`],
]);
const bundle=await build({stdin:{contents:`export * from './src/telegram/temporary-sdk.ts';export * from './src/telegram/saved-session.ts';`,resolveDir:root},bundle:true,format:'iife',globalName:'defaultBotTest',write:false,plugins:[{name:'testonly-telegram',setup(b){b.onResolve({filter:/.*/},args=>stubs.has(args.path)?{path:args.path,namespace:'fixture'}:null);b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs.get(args.path),resolveDir:root,loader:'js'}));}}]});
const server=createServer((req,res)=>{if(req.url==='/fixture.wasm'){res.setHeader('Content-Type','application/wasm');res.end(Buffer.from([0,97,115,109,1,0,0,0]));}else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>TESTONLY defaults</title>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]){
  browser=await launcher.launch(engine==='chromium'?{headless:true,executablePath:'/usr/bin/chromium',chromiumSandbox:true}:{headless:true});
  const context=await browser.newContext();
  try{
   await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():(report.external.push('blocked external request'),r.abort()));
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(origin);
   await page.addScriptTag({content:'globalThis.__name=fn=>fn;'+bundle.outputFiles[0].text});
   const result=await page.evaluate(async()=>{
    const v=globalThis.defaultBotTest,f=globalThis.__defaultBotsTest={calls:[],gate:false,release:null};
    const ac=new AbortController(),identity={apiId:12345,apiHash:'0'.repeat(32)};
    let driver=await v.openTemporaryTelegram(identity,ac.signal);
    const sid=()=>crypto.randomUUID(),names=core=>core.getSnapshot().providers.map(x=>x.username);
    let unauth=false;try{await driver.prepareBotProviders(sid(),ac.signal);}catch{unauth=true;}
    const before=f.calls.length;await driver.begin('+15555550123',ac.signal);const authCalls=f.calls.length-before;
    let session=sid();await driver.prepareBotProviders(session,ac.signal);let core=driver.createBotProviders(session);
    const first=names(core),initialCalls=f.calls.slice();
    const initial=await v.loadTelegramSession(),selection=await v.loadTelegramBotSelection(initial.lease);
    // Normal editable provider API, then restart with the exact same native vault.
    const snapshot=core.getSnapshot(),binding=driver.getAccountBinding();
    const command={protocol:'pulso-bot-providers',version:1,sessionId:session,...binding,providerRevision:0,operationId:sid(),requestId:sid(),type:'bots.setOrder',expectedRevision:0,providerRefs:[...snapshot.providers].reverse().map(x=>x.providerRef)};
    const moved=await core.handle(command,{signal:ac.signal,current:()=>true});await driver.close();
    driver=await v.openTemporaryTelegram(identity,ac.signal);await driver.restore(ac.signal);session=sid();await driver.prepareBotProviders(session,ac.signal);core=driver.createBotProviders(session);const reordered=names(core),afterMove=f.calls.length;
    const removed=await core.handle({...command,sessionId:session,...driver.getAccountBinding(),operationId:sid(),requestId:sid(),providerRefs:[]},{signal:ac.signal,current:()=>true});await driver.close();
    driver=await v.openTemporaryTelegram(identity,ac.signal);await driver.restore(ac.signal);session=sid();await driver.prepareBotProviders(session,ac.signal);core=driver.createBotProviders(session);const empty=names(core),afterEmpty=f.calls.length;await driver.close();
    // A different live worker's empty choice wins over first-use initialization.
    let lease=await v.sessionLease();await v.saveTelegramSession(lease,'TESTONLY_AUTHORIZATION');driver=await v.openTemporaryTelegram(identity,ac.signal);await driver.restore(ac.signal);f.gate=true;
    const pending=driver.prepareBotProviders(sid(),ac.signal);while(!f.release)await new Promise(r=>setTimeout(r,0));
    const other=await v.loadTelegramBotSelection(lease);await v.saveTelegramBots(lease,[],other.bots,other.revision);f.gate=false;f.release();await pending;
    const cas=await v.loadTelegramBotSelection(lease),casNames=names(driver.createBotProviders(sid()));await driver.close();
    // New authorization and changed lease cannot receive old default writes.
    lease=await v.sessionLease();await v.saveTelegramSession(lease,'TESTONLY_AUTHORIZATION');driver=await v.openTemporaryTelegram(identity,ac.signal);await driver.restore(ac.signal);f.gate=true;f.release=null;
    const late=driver.prepareBotProviders(sid(),ac.signal);while(!f.release)await new Promise(r=>setTimeout(r,0));const newer=await v.sessionLease();await v.saveTelegramSession(newer,'TESTONLY_NEW_AUTHORIZATION');f.gate=false;f.release();let denied=false;try{await late;}catch{denied=true;}await driver.close();
    const newerSelection=await v.loadTelegramBotSelection(newer);await v.saveTelegramBots(newer,[]);
    return {unauth,authCalls,first,initialCalls,initialized:selection.initialized,moved:moved.type,reordered,afterMove,removed:removed.type,empty,afterEmpty,cas:{revision:cas.revision,initialized:cas.initialized,names:casNames},denied,newerCount:newerSelection.bots.length,locks:!!navigator.locks};
   });
   assert.equal(result.unauth,true);assert.equal(result.authCalls,0);assert.deepEqual(result.first,['kdmusic_bot','deezermusicbot']);assert.deepEqual(result.initialCalls,['contacts.resolveUsername','contacts.resolveUsername']);assert.equal(result.initialized,true);
   assert.equal(result.moved,'bots.ordered');assert.deepEqual(result.reordered,['deezermusicbot','kdmusic_bot']);assert.equal(result.afterMove,2);assert.equal(result.removed,'bots.ordered');assert.deepEqual(result.empty,[]);assert.equal(result.afterEmpty,2);
   assert.deepEqual(result.cas,{revision:1,initialized:true,names:[]});assert.equal(result.denied,true);assert.equal(result.newerCount,0);assert.equal(result.locks,true);
   report.cases.push({engine,case:'first authenticated connection selects two exact verified profiles, no search/start/history/download',pass:true},{engine,case:'normal reorder persists without another profile RPC',pass:true},{engine,case:'remove all stays empty across adapter restore',pass:true},{engine,case:'concurrent explicit empty selection wins CAS',pass:true},{engine,case:'replaced authorization denies stale defaults',pass:true});
   await page.reload();await page.addScriptTag({content:bundle.outputFiles[0].text});assert.equal(await page.evaluate(async()=>{const v=globalThis.defaultBotTest,s=await v.loadTelegramSession();return (await v.loadTelegramBotSelection(s.lease)).initialized;}),true);
   report.cases.push({engine,case:'explicit empty marker survives real document reload',pass:true});
  }finally{await context.close();await browser.close();browser=null;}
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.failure=String(error);throw error;}
finally{await browser?.close();await new Promise(r=>server.close(r));report.cleanup=true;report.freeAfter=await free();await writeFile(evidence+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,cases:report.cases.length,evidence,cleanup:report.cleanup}));}
