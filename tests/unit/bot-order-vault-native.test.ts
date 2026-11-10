import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from '../../scripts/chromium-launch.mjs';

test('native IDB and Web Locks preserve order across reload and fence a late old lease',async()=>{
 const bundle=await build({entryPoints:['src/telegram/saved-session.ts'],bundle:true,format:'iife',globalName:'vault',write:false});
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html>');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('server');
 const browser=await chromium.launch(chromiumLaunchOptions({env:{...process.env,INSTABOX_HEADLESS:'1'}}));
 try{const page=await browser.newPage();await page.goto(`http://127.0.0.1:${address.port}`);await page.addScriptTag({content:bundle.outputFiles[0].text});
  const lease=await page.evaluate(async()=>{const v=(globalThis as any).vault;const l=await v.sessionLease();await v.saveTelegramSession(l,'synthetic');await v.saveTelegramBots(l,[{username:'bravo',label:'Bravo',id:2,low:2,high:1},{username:'alpha',label:'Alpha',id:1,low:1,high:1}]);return l;});
  await page.reload();await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(async(old:string)=>{const v=(globalThis as any).vault;const locks=!!navigator.locks;const names=(await v.loadTelegramBots(old)).map((x:{username:string})=>x.username);const fresh=await v.sessionLease();await v.saveTelegramSession(fresh,'new synthetic');const late=await v.saveTelegramBots(old,[{username:'alpha',label:'Alpha',id:1,low:1,high:1}]);const empty=(await v.loadTelegramBots(fresh)).length;await v.saveTelegramBots(fresh,[]);await v.clearTelegramSessionLease(fresh);const present=await v.hasSavedTelegramSession();return {locks,names,late,empty,present};},lease);
  assert.deepEqual(result,{locks:true,names:['bravo','alpha'],late:false,empty:0,present:false});
 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('two native workers fence stale selection writes including an ABA change',async()=>{
 const bundle=await build({entryPoints:['src/telegram/saved-session.ts'],bundle:true,format:'iife',globalName:'vault',write:false});
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html>');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('server');
 const browser=await chromium.launch(chromiumLaunchOptions({env:{...process.env,INSTABOX_HEADLESS:'1'}}));
 try{const page=await browser.newPage();await page.goto(`http://127.0.0.1:${address.port}`);
  // tsx preserves nested function names with this harmless serialization helper.
  await page.addScriptTag({content:'globalThis.__name=(fn)=>fn;'});
  const result=await page.evaluate(async(source:string)=>{
   const url=URL.createObjectURL(new Blob([source,'\nself.onmessage=async e=>{try{const r=await vault[e.data.method](...e.data.args);self.postMessage({ok:true,value:r});}catch{self.postMessage({ok:false});}};'],{type:'text/javascript'}));
   const first=new Worker(url),second=new Worker(url);
   const call=(worker:Worker,method:string,...args:unknown[])=>new Promise<any>((resolve,reject)=>{worker.onmessage=e=>e.data.ok?resolve(e.data.value):reject(Error('vault'));worker.onerror=()=>reject(Error('worker'));worker.postMessage({method,args});});
   try{
    const alpha=[{username:'alpha',label:'Alpha',id:1,low:1,high:1}],bravo=[{username:'bravo',label:'Bravo',id:2,low:2,high:1}];
    const lease=await call(first,'sessionLease');await call(first,'saveTelegramSession',lease,'synthetic');
    const old=await call(first,'loadTelegramBotSelection',lease),other=await call(second,'loadTelegramBotSelection',lease);
    const won=await call(second,'saveTelegramBots',lease,bravo,other.bots,other.revision);
    const stale=await call(first,'saveTelegramBots',lease,alpha,old.bots,old.revision);
    const beforeABA=await call(first,'loadTelegramBotSelection',lease);
    const away=await call(second,'saveTelegramBots',lease,alpha,bravo,beforeABA.revision);
    const back=await call(second,'saveTelegramBots',lease,bravo,alpha,beforeABA.revision+1);
    const staleABA=await call(first,'saveTelegramBots',lease,[],beforeABA.bots,beforeABA.revision);
    const final=await call(first,'loadTelegramBotSelection',lease);
    await call(second,'clearTelegramSessionLease',lease);
    const late=await call(first,'saveTelegramBots',lease,[],final.bots,final.revision);
    return {won,stale,away,back,staleABA,late,revision:final.revision,selection:final.bots.map((b:{username:string})=>b.username),locks:!!navigator.locks};
   }finally{first.terminate();second.terminate();URL.revokeObjectURL(url);}
  },bundle.outputFiles[0].text);
  assert.deepEqual(result,{won:true,stale:false,away:true,back:true,staleABA:false,late:false,revision:3,selection:['bravo'],locks:true});
 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
