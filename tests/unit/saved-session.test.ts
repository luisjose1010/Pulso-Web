import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from '../../scripts/chromium-launch.mjs';

test('authorization vault uses IndexedDB, rejects stale leases, and reports storage failures',async()=>{
 const bundle=await build({entryPoints:['src/telegram/saved-session.ts'],bundle:true,format:'iife',globalName:'vault',write:false});
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html>');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw Error('server');
 const browser=await chromium.launch(chromiumLaunchOptions({env:{...process.env,INSTABOX_HEADLESS:'1'}}));
 try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${address.port}`);await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(async()=>{
   const v=(globalThis as unknown as {vault:{hasSavedTelegramSession:()=>Promise<boolean>;clearSavedTelegramSession:()=>Promise<void>;sessionLease:()=>Promise<string>;saveTelegramSession:(l:string,s:string)=>Promise<boolean>;loadTelegramSession:()=>Promise<{value:string}|null>;clearTelegramSessionLease:(lease:string)=>Promise<void>}}).vault;
   const absent=await v.hasSavedTelegramSession();const databases=await indexedDB.databases();
   const lease=await v.sessionLease();const saved=await v.saveTelegramSession(lease,'synthetic');const present=await v.hasSavedTelegramSession();
   const reopened=(await v.loadTelegramSession())?.value==='synthetic';await v.clearSavedTelegramSession();
   const stale=await v.saveTelegramSession(lease,'synthetic');const forgotten=await v.hasSavedTelegramSession();
   let oversized=false;try{await v.saveTelegramSession(await v.sessionLease(),'x'.repeat(4097));}catch(error){oversized=(error as Error).message==='session-storage';}
   const old=await v.sessionLease();await v.saveTelegramSession(old,'old synthetic');const fresh=await v.sessionLease();const denied=await v.saveTelegramSession(old,'late synthetic');await v.saveTelegramSession(fresh,'current synthetic');await v.clearTelegramSessionLease(old);const newerSurvives=(await v.loadTelegramSession())?.value==='current synthetic';const put=IDBObjectStore.prototype.put;let quota=false;IDBObjectStore.prototype.put=function(...args){if(args[1]==='session')throw new DOMException('TESTONLY','QuotaExceededError');return put.apply(this,args);};try{await v.saveTelegramSession(fresh,'synthetic quota');}catch(error){quota=(error as Error).message==='session-storage';}finally{IDBObjectStore.prototype.put=put;}const quotaPreservesPrior=(await v.loadTelegramSession())?.value==='current synthetic';await v.clearSavedTelegramSession();return {denied,newerSurvives,quota,quotaPreservesPrior,absent,created:databases.some(d=>d.name==='pulso-web-telegram-session-v1'),saved,present,reopened,stale,forgotten,oversized};
  });
  assert.deepEqual(result,{denied:false,newerSurvives:true,quota:true,quotaPreservesPrior:true,absent:false,created:false,saved:true,present:true,reopened:true,stale:false,forgotten:false,oversized:true});
 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
