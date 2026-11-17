import test from 'node:test';import assert from 'node:assert/strict';
import {matchingSongRows,canCheckBotDurationFromFile,botAudioMismatchFields,type BotSearchRow} from '../../src/telegram/bot-search-protocol';
import {expectedAudioDurationMismatch,expectedAudioTagMismatch} from '../../src/imports/expected-audio-metadata';
import {copyWorkerRequest} from '../../src/imports/import-protocol';
import {makeFailure,copyFailureV1} from '../../src/errors/app-failure';
const target={title:'Own song',artist:'Own Artist & Guest',album:'Own album',durationSeconds:100};
const audio=(seconds:number,change:Partial<Extract<BotSearchRow,{kind:'audio'}>>={}):Extract<BotSearchRow,{kind:'audio'}>=>({kind:'audio',rowRef:'zero',title:target.title,performer:target.artist,durationSeconds:seconds,bytes:100,mimeType:'audio/mp4',correlation:'reply',...change});
test('zero Telegram duration permits inspection only with exact title, full credit and catalogue context',()=>{
 assert(canCheckBotDurationFromFile(audio(0),target));assert.equal(matchingSongRows([audio(0)],target).length,1);assert.deepEqual(botAudioMismatchFields(audio(0),target),[]);
 for(const row of [audio(0,{performer:'Own Artist'}),audio(0,{title:'Own song (Live)'}),audio(0,{title:'Own song (Album Version)'}),audio(0,{performer:null})])assert.equal(matchingSongRows([row],target).length,0);
 assert.equal(matchingSongRows([audio(0)],{...target,album:null}).length,0);
 assert.equal(canCheckBotDurationFromFile(audio(100),target),false);
 const known=audio(102,{rowRef:'known'});assert.equal(matchingSongRows([audio(0),known],target)[0].rowRef,'known');
 assert.equal(matchingSongRows([audio(106)],target).length,0);
});
test('parsed file duration must match catalogue before a zero-metadata file can be published',()=>{
 const expected={sha256:'a'.repeat(64),title:target.title,artist:target.artist,recordingTitle:target.title,album:target.album,durationSeconds:100};
 for(const actual of [95,100,105])assert.equal(expectedAudioDurationMismatch(expected,actual),false);
 for(const actual of [94.99,105.01,0,undefined,NaN,Infinity])assert.equal(expectedAudioDurationMismatch(expected,actual),true);
 assert.equal(expectedAudioDurationMismatch({...expected,recordingTitle:'Own song (Album Version)'},101),false);
 assert.equal(expectedAudioDurationMismatch({...expected,recordingTitle:'Own song (Album Version)'},101.01),true);
 assert.equal(expectedAudioTagMismatch({title:target.title,artist:'Other Artist'},expected,100),'artist');
 assert.ok(copyWorkerRequest({version:2,type:'import',operationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',file:new File(['own'],'own.m4a'),expected}));
 assert.ok(copyFailureV1(makeFailure('parse','integrity','metadata-duration-mismatch','none')));
});
