import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingSongRows,samePendingSong,songChoiceKey} from '../../src/library/selected-song';
import type {BotSearchRow,BotSearchTarget} from '../../src/telegram/bot-search-protocol';
import type {SongChoice} from '../../src/library/selected-song';
const target:BotSearchTarget={title:'A Song (Live)',artist:'An Artist',album:'Concert',durationSeconds:120};
const option=(label:string,correlation:'reply'|'recent'='reply'):BotSearchRow=>({kind:'option',rowRef:crypto.randomUUID(),correlation,label});
const audio=(title='A Song (Live)',performer:string|null='An Artist',durationSeconds=120):BotSearchRow=>({kind:'audio',rowRef:crypto.randomUUID(),correlation:'reply',title,performer,durationSeconds,bytes:100,mimeType:'audio/mpeg'});
test('automatic exact title and performer matching retains live/remix and punctuation semantics',()=>{
 const exact=option('A Song (Live) — An Artist');
 const rows=[exact,option('A Song — An Artist'),option('A Song (Live Remix) — An Artist'),option('A Song (Live) — Another Artist'),option('A Song (Live) — An Artist ▶'),option('Next page'),option('A Song (Live) — An Artist','recent')];
 assert.deepEqual(matchingSongRows(rows,target),[exact,rows[4],rows.at(-1)]);
 assert.equal(matchingSongRows([option('A Sóng (Live) - AN ARTIST')],target).length,1);
});
test('equal compatible options retain their bot order; unknown or foreign-version audio never matches',()=>{
 assert.equal(matchingSongRows([option('A Song (Live) – An Artist'),option('A Song (Live) - An Artist')],target).length,2);
 assert.equal(matchingSongRows([audio('A Song'),audio('A Song (Live)',null),audio('A Song (Live)','An Artist',130)],target).length,0);
 assert.equal(matchingSongRows([audio()],{...target,artist:null}).length,0);
 assert.equal(matchingSongRows([audio()],target).length,1);
});
test('durable catalogue keys require public identity and version metadata, never title alone',()=>{
 const base={id:'lrclib:123',source:'lrclib' as const,title:target.title,artist:target.artist,album:target.album,duration:120};
 const key=songChoiceKey(base);assert.ok(key);assert.notEqual(songChoiceKey({...base,id:'lrclib:124'}),key);
 assert.notEqual(songChoiceKey({...base,title:'A Song'}),key);assert.notEqual(songChoiceKey({...base,artist:'Another Artist'}),key);
 assert.equal(songChoiceKey({...base,artist:null}),null);assert.equal(songChoiceKey({...base,id:'arbitrary'}),null);
 const local='local:'+crypto.randomUUID();assert.equal(songChoiceKey({...base,id:local,source:'local',artist:null}),local);
});


test('ranking prefers verified audio metadata and closest duration before option labels',()=>{
 const numbered=option('3. A Song (Live) — An Artist [02:00]'),exact=option('A Song (Live) — An Artist'),near=audio('A Song (Live)','An Artist',122),best=audio();
 const rows=[numbered,near,exact,best,option('A Song (Live Remix) — An Artist'),option('A Song (Live) — Another Artist')];
 assert.deepEqual(matchingSongRows(rows,target),[best,near,exact,numbered]);assert.equal(rows[0],numbered);
});
test('numbering and duration decorations do not erase version or performer conflicts',()=>{
 const right=option('#12 A Song (Live) — An Artist (02:00)');
 assert.deepEqual(matchingSongRows([option('#1 A Song (Remix) — An Artist (02:00)'),option('2. A Song (Live) — Other Artist [02:00]'),option('Next ▶️'),right],target),[right]);
});
test('best compatible tie uses the first row rather than asking for another choice',()=>{
 const first=option('A Song (Live) — An Artist'),second=option('A Song (Live) - An Artist');const ranked=matchingSongRows([first,second],target);assert.deepEqual(ranked,[first,second]);assert.equal(ranked[0],first);
});

test('pending selections coalesce across catalog IDs only for same full recording metadata',()=>{
 const base:SongChoice={id:'lrclib:123',source:'lrclib',title:'Sangre !',artist:'Nsqk',album:'Single',duration:200};
 assert.equal(samePendingSong(base,{...base,id:'itunes:1:1:1:2',source:'itunes',title:'SANGRE!',album:'Album',duration:204}),true);
 assert.equal(samePendingSong(base,{...base,title:'Sangre (Live)'}),false);
 assert.equal(samePendingSong(base,{...base,artist:'Nsqk & Guest'}),false);
 assert.equal(samePendingSong(base,{...base,duration:206}),false);
 assert.equal(samePendingSong(base,{...base,artist:null}),false);
 for(const duration of [0,-1,NaN,Infinity])assert.equal(samePendingSong(base,{...base,duration}),false);
 assert.equal(samePendingSong(base,{...base,title:'Sangre (Studio Version)'}),false);
 assert.equal(samePendingSong(base,{...base,title:'Sangre (Visualizer)'}),true);
 assert.equal(samePendingSong({...base,album:'Record Live'},{...base,album:'Record Studio'}),false);
});

test('duration metadata disagreement up to five seconds retains exact identity and larger gaps fail closed',()=>{
 for(const delta of [-5,-4,-3,0,3,4,5])assert.equal(matchingSongRows([audio(target.title,target.artist,target.durationSeconds!+delta)],target).length,1);
 for(const delta of [-6,6])assert.equal(matchingSongRows([audio(target.title,target.artist,target.durationSeconds!+delta)],target).length,0);
 assert.equal(matchingSongRows([audio('A Song (Live Remix)',target.artist,124),audio(target.title,'Other Artist',124),audio(target.title,null,124)],target).length,0);
 const closer=audio(target.title,target.artist,124),farther=audio(target.title,target.artist,125);assert.deepEqual(matchingSongRows([farther,closer],target),[closer,farther]);
});
