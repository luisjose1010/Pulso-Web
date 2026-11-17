import test from 'node:test';import assert from 'node:assert/strict';
import {offlineAccountCache,accountNotice,coordinateAccountSessions} from '../../src/accounts/session-coordination';
import {createAccountController,type AccountProvider,type AccountUser} from '../../src/accounts/account-controller';
const user:AccountUser={id:'test-account',name:'Prueba',email:'own@example.test',verified:true,expiresAt:10000};
test('offline cache carries no credentials, expires and clears after confirmed logout',()=>{
 let now=100;const values=new Map<string,string>();const store={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
 const cache=offlineAccountCache(store,()=>now);cache.save(user);assert.equal(cache.read()?.id,user.id);assert.ok(![...values.values()].join('').includes('token'));now=10001;assert.equal(cache.read(),null);now=200;cache.save(user);cache.save(null);assert.equal(cache.read(),null);
});
test('account messages are closed hints, deduplicated across transports, and focus only rechecks',async()=>{
 const win=new EventTarget(),doc=Object.assign(new EventTarget(),{visibilityState:'visible'});class Channel extends EventTarget{sent:unknown[]=[];postMessage(v:unknown){this.sent.push(v);}close(){}}
 const channel=new Channel();let invalidations=0,loads=0;
 const sync=coordinateAccountSessions({invalidate(){invalidations++;},async load(){loads++;}},{window:win as unknown as Window,document:doc as unknown as Document,channel:channel as unknown as BroadcastChannel,store:null});
 assert.equal(accountNotice({version:1,type:'changed',source:'x',token:'forged'}),false);
 const notice={version:1,type:'changed',source:'test-change'};channel.dispatchEvent(new MessageEvent('message',{data:notice}));channel.dispatchEvent(new MessageEvent('message',{data:notice}));assert.equal(invalidations,1);win.dispatchEvent(new Event('focus'));assert.equal(loads,1);assert.equal(invalidations,1);sync.notify();assert.deepEqual(Object.keys(channel.sent[0] as object).sort(),['source','type','version']);sync.dispose();channel.dispatchEvent(new MessageEvent('message',{data:{...notice,source:'later'}}));assert.equal(invalidations,1);
});
test('a cross-tab invalidation cannot publish an older pending session and rechecks once settled',async()=>{
 let finish!:()=>void;let calls=0;const confirmed:unknown[]=[];
 const provider:AccountProvider={session:async()=>{calls++;return null;},signIn:()=>new Promise<void>(resolve=>{finish=resolve;}),signUp:async()=>{},google:async()=>{},signOut:async()=>{},requestReset:async()=>{},reset:async()=>{},verify:async()=>{},resend:async()=>{}};
 const controller=createAccountController({config:async()=>({enabled:true,google:true}),provider:async()=>provider,confirmed:value=>{confirmed.push(value);}});
 await controller.load();const pending=controller.signIn('own@example.test','test-password');controller.invalidate();assert.equal(controller.getSnapshot().user,null);assert.equal(controller.getSnapshot().pending,true);finish();assert.equal(await pending,false);await new Promise(resolve=>setImmediate(resolve));assert.equal(controller.getSnapshot().status,'signed-out');assert.equal(calls,2);assert.ok(confirmed.every(value=>value===null));
});
test('a remembered offline account is only fallback after a failed request, not over a confirmed logout',async()=>{
 const provider={session:async()=>null} as AccountProvider;let online=false;
 const controller=createAccountController({config:async()=>{if(!online)throw Error('offline');return {enabled:true,google:true};},provider:async()=>provider,offlineSession:()=>online?null:user});
 await controller.load();assert.equal(controller.getSnapshot().status,'offline');assert.equal(controller.getSnapshot().user?.id,user.id);assert.equal(await controller.signOut(),false);online=true;await controller.load();assert.equal(controller.getSnapshot().status,'signed-out');assert.equal(controller.getSnapshot().user,null);
});
