import test from 'node:test';
import assert from 'node:assert/strict';
import Long from 'long';
import {prepareDefaultBotSelection,type BotSelection} from '../../src/telegram/default-bot-selection';
import type {SavedBot} from '../../src/telegram/saved-session';
const binding={accountRef:crypto.randomUUID(),accountEpoch:1};
const fresh=():BotSelection=>({bots:[],revision:0,initialized:false});
const identity=(username:string,id= username==='kdmusic_bot'?101:102)=>({_: 'contacts.resolvedPeer',peer:{_: 'peerUser',userId:id},chats:[],users:[{_: 'user',id,bot:true,username,accessHash:new Long(123,id,false),firstName:username}]});
function fixture(selection=fresh()){
 const calls:string[]=[],writes:SavedBot[][]=[];let invalidations=0,allow=true;
 const abort=new AbortController();
 const dependency={async resolveIdentity(username:string,_signal:AbortSignal):Promise<unknown>{calls.push(username);return identity(username);},invalidateSession(){invalidations++;},async saveSelection(bots:SavedBot[]){writes.push(bots);return true;}};
 const run=()=>prepareDefaultBotSelection(binding,crypto.randomUUID(),selection,dependency,abort.signal,()=>allow);
 return {run,abort,dependency,calls,writes,invalidations:()=>invalidations,deny:()=>{allow=false;}};
}
test('first use verifies exactly the curated profiles and commits one ordered selection',async()=>{
 const f=fixture();assert.deepEqual(await f.run(),{settled:true});assert.deepEqual(f.calls,['kdmusic_bot','deezermusicbot']);assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0].map(x=>x.username),f.calls);assert.deepEqual(f.writes[0].map(x=>x.id),[101,102]);
});
for(const [name,selection] of Object.entries({removed:{bots:[],revision:2,initialized:true},legacyEmpty:{bots:[],revision:0,initialized:true},custom:{bots:[{username:'other',label:'Other',id:1,low:1,high:1}],revision:1,initialized:true}})){
 test(`${name} selection is never replaced or resolved`,async()=>{const f=fixture(selection);await f.run();assert.deepEqual(f.calls,[]);assert.deepEqual(f.writes,[]);});
}
test('unavailable, non-bot and mismatched profiles never become selected',async()=>{
 for(const mode of ['network','non-bot','wrong-name']){const f=fixture();f.dependency.resolveIdentity=async username=>{f.calls.push(username);if(mode==='network')throw Error('network');const raw=identity(username);if(mode==='non-bot')raw.users[0].bot=false;else raw.users[0].username='other';return raw;};await f.run();assert.equal(f.calls.length,1);assert.equal(f.writes.length,0);}
});
test('second profile failure does not persist a partially verified default list',async()=>{
 const f=fixture();f.dependency.resolveIdentity=async username=>{f.calls.push(username);if(f.calls.length===2)throw {text:'FLOOD_WAIT_10'};return identity(username);};await f.run();assert.equal(f.calls.length,2);assert.equal(f.writes.length,0);
});
test('cancelled or retired connection cannot persist a late profile',async()=>{
 for(const cancel of [true,false]){const f=fixture();let finish!:(value:unknown)=>void;f.dependency.resolveIdentity=username=>{f.calls.push(username);return new Promise(resolve=>{finish=resolve;});};const running=f.run();await new Promise(resolve=>setImmediate(resolve));if(cancel)f.abort.abort();else f.deny();finish(identity('kdmusic_bot'));await running;assert.equal(f.calls.length,1);assert.equal(f.writes.length,0);}
});
test('a rejected CAS is not acknowledged or retried',async()=>{
 const f=fixture();f.dependency.saveSelection=async bots=>{f.writes.push(bots);return false;};await f.run();assert.equal(f.writes.length,1);assert.equal(f.invalidations(),1);
});
test('duplicate underlying identities cannot create two default providers',async()=>{
 const f=fixture();f.dependency.resolveIdentity=async username=>identity(username,101);await f.run();assert.equal(f.writes.length,0);
});
