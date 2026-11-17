import test from 'node:test';import assert from 'node:assert/strict';
import {createAutomaticUpdater,entryBundle,updateEntry,type UpdateState} from '../../src/service-worker/automatic-update';
import {registerUpdateBlocker,updateWorkPending} from '../../src/service-worker/update-blockers';
const entry='/releases/0123456789abcdef.html';
const html=(bundle='/assets/new.js')=>`<!doctype html><html><script type="module" crossorigin src="${bundle}"></script><div id="root"></div></html>`;
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function fixture(){
 let time=0,ready=true,bundle='/assets/new.js',prepare=async()=>true;
 const nav:string[]=[],states:UpdateState[]=[],pending:boolean[]=[],manual:boolean[]=[],requests:{url:string;init?:RequestInit}[]=[];
 let entered=0,released=0,reloads=0;
 const core=createAutomaticUpdater({origin:'https://pulso.example',bundle:'/assets/current.js',now:()=>time,quietMs:100,
  fetcher:async(input,init)=>{const url=String(input);requests.push({url,init});return url.endsWith('/latest.json')?Response.json({version:1,entry}):new Response(html(bundle));},
  ready:()=>ready,prepare:()=>prepare(),enter:()=>{entered++;return()=>{released++;};},navigate:e=>nav.push(e),reload:()=>{reloads++;},pending:v=>pending.push(v),state:v=>states.push(v),manualPending:v=>manual.push(v)});
 return {core,nav,states,pending,manual,requests,setTime:(v:number)=>{time=v;},setReady:(v:boolean)=>{ready=v;},setBundle:(v:string)=>{bundle=v;},setPrepare:(v:()=>Promise<boolean>)=>{prepare=v;},stats:()=>({entered,released,reloads})};
}
test('update targets accept only immutable same-origin entries and one local module',()=>{
 assert.equal(updateEntry({version:1,entry}),entry);for(const e of ['https://evil.example'+entry,'//evil.example/a','javascript:alert(1)',entry+'?x=1',entry+'#a','/index.html'])assert.equal(updateEntry({version:1,entry:e}),null);
 assert.equal(updateEntry({version:2,entry}),null);assert.equal(entryBundle(html()),'/assets/new.js');
 for(const s of [html('https://evil.example/main.js'),html('javascript:alert(1)'),'<script>alert(1)</script>',html()+html('/assets/second.js')])assert.equal(entryBundle(s),null);
});
test('an unversioned current page does not reload just because latest has a versioned URL',async()=>{
 const f=fixture();f.setBundle('/assets/current.js');await f.core.check();await f.core.tick();f.setTime(1000);await f.core.tick();assert.equal(f.states.at(-1),'current');assert.deepEqual(f.nav,[]);assert.equal(f.pending.at(-1),false);assert.ok(f.requests.every(r=>r.init?.cache==='no-store'&&r.init.credentials==='omit'));f.core.stop();
});
test('new code waits for continuous idle and rechecks playback or work before navigating once',async()=>{
 const f=fixture();await f.core.check();f.setReady(false);await f.core.tick();f.setTime(1000);await f.core.tick();assert.deepEqual(f.nav,[]);
 f.setReady(true);await f.core.tick();f.setTime(1050);await f.core.tick();assert.deepEqual(f.nav,[]);
 f.setReady(false);f.setTime(1100);await f.core.tick();f.setReady(true);f.setTime(1200);await f.core.tick();f.setTime(1300);await f.core.tick();await f.core.tick();assert.deepEqual(f.nav,[entry]);assert.equal(f.stats().entered,1);f.core.stop();
});
test('a new Play or mutation during final persistence cancels this navigation without entering',async()=>{
 const f=fixture();let finish!:(value:boolean)=>void;f.setPrepare(()=>new Promise(resolve=>{finish=resolve;}));await f.core.check();await f.core.tick();f.setTime(100);const applying=f.core.tick();await flush();await f.core.tick();f.setReady(false);finish(true);await applying;assert.equal(f.stats().entered,0);assert.deepEqual(f.nav,[]);f.core.stop();
});
test('manual reload waits for work, then reloads even when the app was already current',async()=>{
 const f=fixture();f.setBundle('/assets/current.js');f.setReady(false);f.core.reload();await flush();await f.core.tick();assert.deepEqual(f.nav,[]);assert.equal(f.states.at(-1),'current');
 f.setReady(true);await f.core.tick();assert.deepEqual(f.nav,[entry]);assert.equal(f.manual[0],true);f.core.stop();
});
test('manual action uses the latest code, never a cached alias; failed navigation releases admission',async()=>{
 const f=fixture();f.core.reload();await flush();await f.core.tick();assert.deepEqual(f.nav,[entry]);f.core.stop();assert.equal(f.stats().released,1);
 const g=fixture();g.setPrepare(async()=>false);g.core.reload();await flush();await g.core.tick();assert.deepEqual(g.nav,[]);assert.equal(g.stats().entered,0);g.core.stop();
});
test('offline or invalid publication never triggers automatic reload, manual still permits normal reload',async()=>{
 let reloads=0;const states:UpdateState[]=[];
 const core=createAutomaticUpdater({origin:'https://pulso.example',bundle:'/assets/current.js',quietMs:0,fetcher:async()=>new Response('not JSON',{status:503}),ready:()=>true,prepare:async()=>true,enter:()=>()=>{},navigate:()=>assert.fail('unexpected version'),reload:()=>{reloads++;},pending:()=>{},state:v=>states.push(v)});
 await core.check();await core.tick();assert.equal(reloads,0);assert.equal(states.at(-1),'unavailable');core.reload();await flush();await core.tick();assert.equal(reloads,1);core.stop();
});
test('disposal rejects a late check and does not publish or navigate',async()=>{
 let finish!:(value:Response)=>void,calls=0;const pending:boolean[]=[];
 const core=createAutomaticUpdater({origin:'https://pulso.example',bundle:'/assets/current.js',fetcher:()=>{calls++;return new Promise(resolve=>{finish=resolve;});},ready:()=>true,prepare:async()=>true,enter:()=>()=>{},navigate:()=>assert.fail('late navigation'),reload:()=>{},pending:v=>pending.push(v)});
 const check=core.check();await core.check();assert.equal(calls,1);core.stop();finish(Response.json({version:1,entry}));await check;await core.tick();assert.deepEqual(pending,[]);
});
test('editable host blockers are live, reversible, and fail closed when their state is unknown',()=>{
 let active=true;const unregister=registerUpdateBlocker(()=>active);assert.equal(updateWorkPending(),true);active=false;assert.equal(updateWorkPending(),false);const bad=registerUpdateBlocker(()=>{throw Error('unknown');});assert.equal(updateWorkPending(),true);bad();assert.equal(updateWorkPending(),false);unregister();assert.equal(updateWorkPending(),false);
});

test('manual reload explicitly permits a playing host to pause and persist before navigating',async()=>{
 let playing=true,manualObserved=false,saved=false,navigated=false;
 const core=createAutomaticUpdater({origin:'https://pulso.example',bundle:'/assets/current.js',fetcher:async input=>String(input).endsWith('/latest.json')?Response.json({version:1,entry}):new Response(html()),ready:manual=>!playing||manual,prepare:async manual=>{manualObserved=manual;playing=false;saved=true;return true;},enter:()=>{assert.equal(playing,false);assert.equal(saved,true);return()=>{};},navigate:()=>{navigated=true;},reload:()=>{},pending:()=>{}});
 await core.check();await core.tick();assert.equal(navigated,false);core.reload();await flush();await core.tick();assert.equal(manualObserved,true);assert.equal(navigated,true);core.stop();
});
test('oversized publication and redirected off-origin entries are never applied',async()=>{
 for(const bad of ['oversized','redirected']){
  const core=createAutomaticUpdater({origin:'https://pulso.example',bundle:'/assets/current.js',quietMs:0,fetcher:async input=>{if(String(input).endsWith('/latest.json'))return Response.json({version:1,entry});const r=new Response(bad==='oversized'?' '.repeat(65537):html());if(bad==='redirected')Object.defineProperty(r,'url',{value:'https://evil.example'+entry});return r;},ready:()=>true,prepare:async()=>true,enter:()=>()=>{},navigate:()=>assert.fail('invalid publication'),reload:()=>{},pending:()=>{}});
  await core.check();await core.tick();await core.tick();core.stop();
 }
});

test('unchanged static pointer does not refetch the versioned HTML on every poll',async()=>{
 const f=fixture();f.setBundle('/assets/current.js');await f.core.check();await f.core.check();assert.equal(f.requests.filter(r=>r.url.endsWith('/latest.json')).length,2);assert.equal(f.requests.filter(r=>r.url.endsWith('.html')).length,1);assert.equal(f.states.at(-1),'current');f.core.stop();
});
