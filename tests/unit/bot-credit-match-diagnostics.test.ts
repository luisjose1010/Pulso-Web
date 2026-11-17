import test from 'node:test';
import assert from 'node:assert/strict';
import {botAudioMismatchFields,matchingSongRows,type BotSearchRow} from '../../src/telegram/bot-search-protocol';
import {acquisitionFailureText} from '../../src/library/ordered-bot-acquisition';
// Entirely synthetic metadata: 120 is NOT the observed duration of Llora Llora.
const target={title:'Synthetic Song',artist:'Artist & Guest',album:'Synthetic Album',durationSeconds:120};
const audio=(performer:string|null,title:string|null=target.title,durationSeconds=120):Extract<BotSearchRow,{kind:'audio'}>=>({kind:'audio',rowRef:'synthetic',correlation:'reply',title,performer,durationSeconds,bytes:1,mimeType:'audio/wav'});
test('closed audio diagnostics name incompatible fields without changing matching',()=>{
 const cases:[ReturnType<typeof audio>,readonly string[]][]=[
  [audio('ARTIST, GUEST'),[]], [audio('Artist'),['artist']],
  [audio('Artist feat. Guest'),['artist']], [audio('Guest & Artist'),['artist']],
  [audio('Artist and Guest'),['artist']], [audio('Artist y Guest'),['artist']],
  [audio('Artist & Other'),['artist']], [audio(null),['artist']],
  [audio(target.artist,'Other Song'),['title-version']],
  ...['Live','Remix','Cover'].map(version=>[audio(target.artist,`${target.title} (${version})`),['title-version']] as [ReturnType<typeof audio>,string[]]),
  [audio(target.artist,target.title,126),['duration']],
  [audio('Other','Other Song',140),['title-version','artist','duration']],
 ];
 for(const [row,fields] of cases){assert.deepEqual(botAudioMismatchFields(row,target),fields);assert.equal(matchingSongRows([row],target).length,fields.length?0:1);}
 for(const delta of [-5,5])assert.deepEqual(botAudioMismatchFields(audio(target.artist,target.title,120+delta),target),[]);
 assert.deepEqual(botAudioMismatchFields(audio(target.artist,'Synthetic Song (Album Version)',122),target),['duration']);
 assert.deepEqual(botAudioMismatchFields(audio(target.artist,target.title,999),{...target,durationSeconds:null}),[]);
});
test('menu credit variants retain current conservative contract; band names are never split',()=>{
 for(const credit of ['Artist & Guest','ARTIST, GUEST']){
  for(const label of [`${target.title} — ${credit}`,`${credit} - ${target.title}`,`1. ${target.title} — ${credit} [02:00]`])assert.equal(matchingSongRows([{kind:'option',rowRef:'synthetic',correlation:'reply',label}],target).length,1);
 }
 for(const credit of ['Artist','Guest & Artist','Artist feat. Guest','Artist ft. Guest','Artist and Guest','Artist y Guest','Artist & Other'])assert.equal(matchingSongRows([{kind:'option',rowRef:'synthetic',correlation:'reply',label:`${target.title} — ${credit}`}],target).length,0);
 for(const artist of ['Earth Wind and Fire','Simon and Garfunkel'])assert.equal(matchingSongRows([audio(artist.replace(' and ',' & '))],{...target,artist}).length,0);
});
test('diagnostic text contains only closed explanations and keeps D02',()=>{
 const text=acquisitionFailureText(['returned-audio-mismatch','audio-artist-mismatch','audio-duration-mismatch','audio-artist-mismatch']);
 assert.match(text,/D02/);assert.match(text,/artista, duración/);
 assert.equal(text.match(/artista/g)?.length,1);assert.equal(text.includes(target.title),false);assert.equal(text.includes(target.artist),false);
});

test('D02 fallback and D01 do not invent observed fields',()=>{assert.equal(acquisitionFailureText(['returned-audio-mismatch']),'El audio recibido no coincide con la canción. [D02]');assert.doesNotMatch(acquisitionFailureText(['no-compatible-row']),/D02|duración|incompleto/);});
