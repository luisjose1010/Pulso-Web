import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Player, type Media} from '../../src/playback/player.ts';
class Fake extends EventTarget implements Media {
  src = ''; currentTime = 0; duration = 4; ended = false; plays = 0;
  rejection: Promise<void> | null = null;
  play() { ++this.plays; return this.rejection ?? Promise.resolve(); }
  pause() {} load() { this.ended = false; this.currentTime = 0; }
}
const entries = ['A','B','A'].map((trackId,i) => ({id: `q${i}`,trackId,title: trackId,src: `https://test.invalid/${trackId}`}));
function setup() { const audio = new Fake(); const player = new Player(audio); player.setQueue(entries); return {audio,player}; }
test('el progreso no cambia la cola y callbacks de otra selección no actualizan el reloj', () => {
 const {audio,player}=setup(),changes:string[]=[],old:EventListener[]=[];
 const add=audio.addEventListener.bind(audio);audio.addEventListener=(type,fn,options)=>{if(type==='timeupdate')old.push(fn as EventListener);add(type,fn,options);};
 const off=player.subscribe(change=>changes.push(change));player.select(0);changes.length=0;
 const revision=player.queueRevision,epoch=player.queueEpoch;audio.currentTime=2;audio.dispatchEvent(new Event('timeupdate'));
 assert.deepEqual(changes,['progress']);assert.equal(player.queueRevision,revision);assert.equal(player.queueEpoch,epoch);assert.equal(player.index,0);
 player.select(1);assert.equal(changes.at(-1),'state');changes.length=0;old[0](new Event('timeupdate'));assert.deepEqual(changes,[]);
 audio.dispatchEvent(new Event('timeupdate'));assert.deepEqual(changes,['progress']);off();audio.dispatchEvent(new Event('timeupdate'));assert.deepEqual(changes,['progress']);
});
test('cola conserva ocurrencias A/B/A y seleccionar no reproduce por defecto', () => {
 const {audio,player} = setup(); player.select(0); assert.equal(audio.plays,0); assert.notEqual(player.entries[0].id,player.entries[2].id);
});
test('ended duplicado avanza una vez y callback de generación antigua no avanza', () => {
 const {audio,player} = setup();
 const captured: EventListener[] = []; const original = audio.addEventListener.bind(audio);
 audio.addEventListener = (type, fn, options) => { if(type === 'ended') captured.push(fn as EventListener); original(type,fn,options); };
 player.select(0); audio.ended = true; captured[0](new Event('ended')); assert.equal(player.index,1);
 audio.ended = true; captured[0](new Event('ended')); assert.equal(player.index,1);
});
test('replay final vuelve a cero y admite un nuevo ended', async () => {
 const {audio,player} = setup(); player.select(2); audio.currentTime = 4; audio.ended = true; audio.dispatchEvent(new Event('ended'));
 assert.equal(player.state,'ended'); await player.play(); assert.equal(audio.currentTime,0); assert.equal(audio.plays,1);
 audio.ended = true; audio.dispatchEvent(new Event('ended')); assert.equal(player.state,'ended');
});
test('rechazo antiguo no publica error sobre la selección nueva', async () => {
 const {audio,player} = setup(); let reject!: (e: Error) => void;
 audio.rejection = new Promise((_,r) => { reject = r; }); player.select(0); const pending = player.play();
 audio.rejection = null; player.select(1); reject(new Error('old')); await pending;
 assert.equal(player.index,1); assert.equal(player.error,''); assert.equal(player.state,'loading');
});
test('seek finito y anterior con umbral de tres segundos', () => {
 const {audio,player} = setup(); player.select(1); player.seek(99); assert.equal(audio.currentTime,4);
 player.previous(); assert.equal(player.index,1); assert.equal(audio.currentTime,0);
 player.seek(NaN); assert.equal(audio.currentTime,0); player.previous(); assert.equal(player.index,0);
});
test('restauración aplica seek al cargar metadata y permanece pausada', () => {
 const {audio,player} = setup(); player.select(1,false,2); audio.dispatchEvent(new Event('loadedmetadata'));
 assert.equal(audio.currentTime,2);assert.equal(player.state,'paused');assert.equal(audio.plays,0);
 player.select(2);audio.dispatchEvent(new Event('loadedmetadata'));assert.equal(audio.currentTime,0);
});
test('repeat one genera una reproducción nueva y repeat all vuelve al inicio',()=>{
 const {audio,player}=setup();player.select(1);player.setRepeat('one');audio.ended=true;audio.dispatchEvent(new Event('ended'));assert.equal(player.index,1);assert.equal(audio.plays,1);
 player.setRepeat('all');player.select(2);audio.ended=true;audio.dispatchEvent(new Event('ended'));assert.equal(player.index,0);
});
test('shuffle mantiene un ciclo por ocurrencia y anterior recorre su historial',()=>{
 const {audio,player}=setup();player.select(0);player.setShuffle(true,()=>0);const order=[...player.shuffleOrder!];assert.equal(new Set(order).size,3);assert.equal(order[0],'q0');player.next();assert.equal(player.current.id,order[1]);audio.currentTime=0;player.previous();assert.equal(player.current.id,order[0]);assert.deepEqual(player.shuffleOrder,order);
});
test('reordenar/quitar futura conserva motor actual y snapshot no altera entrada original',()=>{
 const {audio,player}=setup();player.select(0);const generation=player.generation;player.moveEntry('q2',-1);assert.equal(player.current.id,'q0');player.removeFuture('q1');assert.equal(player.current.id,'q0');assert.equal(player.generation,generation);assert.equal(audio.plays,0);assert.equal(entries.length,3);assert.equal(player.entries.length,2);
});
test('suspension invalidates captured ended before pause, unloads and blocks commands',async()=>{
 const {audio,player}=setup();let ended:EventListener|undefined;const add=audio.addEventListener.bind(audio);
 audio.addEventListener=(type,fn)=>{if(type==='ended')ended=fn as EventListener;add(type,fn);};player.select(0);
 player.suspend();audio.ended=true;ended!(new Event('ended'));await player.play();player.next();player.select(1,true);
 assert.equal(audio.src,'');assert.equal(player.index,0);assert.equal(audio.plays,0);assert.equal(player.state,'paused');
});
test('late resolved play cannot revive suspended motor',async()=>{
 const {audio,player}=setup();let resolve!:()=>void;let pauses=0;audio.pause=()=>{pauses++;};
 audio.rejection=new Promise<void>(r=>resolve=r);player.select(0);const pending=player.play();player.suspend();const before=pauses;
 resolve();await pending;assert.equal(pauses,before+1);assert.equal(player.state,'paused');
});
test('admission is consulted by stale direct player handlers',async()=>{
 let admitted=true;const audio=new Fake(),player=new Player(audio,()=>admitted);player.setQueue(entries);player.select(0);admitted=false;
 await player.play();player.next();player.seek(3);player.setRepeat('all');player.moveEntry('q2',-1);player.removeFuture('q1');
 assert.equal(audio.plays,0);assert.equal(player.index,0);assert.equal(audio.currentTime,0);assert.equal(player.repeat,'off');assert.equal(player.entries.length,3);
});
test('safe failure callback reports current NotAllowed and numeric media codes once, never timeupdate',async()=>{
 const audio=new Fake(),seen:unknown[]=[];Object.assign(audio,{error:{code:2}});
 const player=new Player(audio,()=>true,phase=>code=>seen.push({phase,code}));player.setQueue(entries);player.select(0);
 for(let i=0;i<20;i++)audio.dispatchEvent(new Event('timeupdate'));assert.equal(seen.length,0);
 audio.dispatchEvent(new Event('error'));audio.dispatchEvent(new Event('error'));assert.deepEqual(seen,[{phase:'read',code:'media-network'}]);
 audio.rejection=Promise.reject(new DOMException('private canary','NotAllowedError'));await player.play();assert.deepEqual(seen[1],{phase:'play',code:'autoplay-denied'});
 for(const [n,code]of [[1,'media-aborted'],[3,'media-decode'],[4,'media-unsupported'],[99,'media-unknown']] as const){player.select(0);Object.assign(audio,{error:{code:n}});audio.dispatchEvent(new Event('error'));assert.equal((seen.at(-1) as {code:string}).code,code);}
});
test('failure observer/notifier throws do not interfere; old/current-source and admission guards',async()=>{
 const audio=new Fake();let allowed=true,calls=0;const captured:EventListener[]=[];const add=audio.addEventListener.bind(audio);
 audio.addEventListener=(type,fn)=>{if(type==='error')captured.push(fn as EventListener);add(type,fn);};
 const player=new Player(audio,()=>allowed,()=>()=>{calls++;throw Error('observer');});player.setQueue(entries);player.select(0);
 let reject!:(e:Error)=>void;audio.rejection=new Promise((_,r)=>reject=r);const pending=player.play();player.select(1);reject(new Error('private'));await pending;captured[0](new Event('error'));assert.equal(calls,0);
 audio.rejection=Promise.reject(new Error('private'));await player.play();assert.equal(calls,1);assert.equal(player.state,'error');
 player.select(1);allowed=false;captured.at(-1)!(new Event('error'));assert.equal(calls,1);allowed=true;player.suspend();captured.at(-1)!(new Event('error'));assert.equal(calls,1);
 const throwing=new Player(new Fake(),()=>true,()=>{throw Error('factory');});throwing.setQueue(entries);throwing.select(0);await throwing.play();
});


test('autoplay rejection is distinguishable from other playback failures and clears on native playing',async()=>{
 const {player,audio}=setup();player.select(0);audio.rejection=Promise.reject(new DOMException('TESTONLY','NotAllowedError'));await player.play();assert.equal(player.lastFailure,'autoplay-denied');
 audio.rejection=null;audio.dispatchEvent(new Event('playing'));assert.equal(player.lastFailure,null);assert.equal(player.error,'');assert.equal(player.state,'playing');
 audio.rejection=Promise.reject(new Error('TESTONLY'));await player.play();assert.equal(player.lastFailure,'unknown');
});

test('choosing a timed lyric plays from its timestamp, including paused and ended media, without replacing the source',async()=>{
 const {audio,player}=setup();player.select(2);audio.currentTime=4;audio.ended=true;audio.dispatchEvent(new Event('ended'));
 const generation=player.generation,epoch=player.queueEpoch,revision=player.queueRevision,src=audio.src;
 await player.play(1.5);assert.equal(audio.currentTime,1.5);assert.equal(audio.plays,1);assert.equal(audio.src,src);
 assert.equal(player.generation,generation);assert.equal(player.queueEpoch,epoch);assert.equal(player.queueRevision,revision);
 audio.dispatchEvent(new Event('playing'));audio.ended=true;audio.dispatchEvent(new Event('ended'));assert.equal(player.state,'ended','a new explicit lyric play must admit its next ended event');
 audio.ended=false;player.pause();await player.play(2.5);assert.equal(audio.currentTime,2.5);assert.equal(audio.plays,2);
});

test('lyric playback rejects invalid positions and missing metadata, and still obeys playback admission',async()=>{
 let admitted=true;const audio=new Fake(),player=new Player(audio,()=>admitted);player.setQueue(entries);player.select(0);
 for(const position of [NaN,Infinity,-1,4,5])await player.play(position);assert.equal(audio.plays,0);assert.equal(audio.currentTime,0);
 audio.duration=NaN;await player.play(1);assert.equal(audio.plays,0);audio.duration=4;
 admitted=false;await player.play(1);assert.equal(audio.plays,0);assert.equal(audio.currentTime,0);
 admitted=true;player.suspend();await player.play(1);assert.equal(audio.plays,0);
});

test('native seek rejection is reported without an unhandled lyric playback rejection',async()=>{
 const {audio,player}=setup();player.select(0);Object.defineProperty(audio,'currentTime',{get:()=>0,set:()=>{throw new DOMException('Own test','InvalidStateError')}});
 await player.play(1);assert.equal(audio.plays,0);assert.equal(player.state,'error');assert.equal(player.lastFailure,'unknown');
});
