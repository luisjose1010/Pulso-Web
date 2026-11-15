import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingSongRows,type BotSearchRow} from '../../src/telegram/bot-search-protocol';
import {AUDIO_FILE_MAX_BYTES} from '../../src/storage/audio-limits';

const target={title:'Synthetic song',artist:'Own artist',album:'Own album',durationSeconds:100};
let n=0;
const audio=(over:Partial<Extract<BotSearchRow,{kind:'audio'}>>={}):Extract<BotSearchRow,{kind:'audio'}>=>({
  rowRef:`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,kind:'audio',correlation:'recent',
  title:'Synthetic song',performer:'Own artist',durationSeconds:100,mimeType:'audio/mpeg',bytes:1_000_000,...over,
});
// 100 s: 1.6 MB ≈128 kbps, 4 MB ≈320 kbps, 0.8 MB ≈64 kbps.
const kbps64=audio({bytes:800_000}),kbps128=audio({bytes:1_600_000}),kbps320=audio({bytes:4_000_000});

test('same recording at several bitrates: highest tier first, input order never decides when quality differs',()=>{
  assert.deepEqual(matchingSongRows([kbps64,kbps128,kbps320],target),[kbps320,kbps128,kbps64]);
});
test('same quality tier keeps the bot order (no churn from VBR or tag overhead)',()=>{
  const a=audio({bytes:4_000_000}),b=audio({bytes:3_900_000});
  assert.deepEqual(matchingSongRows([a,b],target),[a,b]);
  assert.deepEqual(matchingSongRows([b,a],target),[b,a]);
});
test('closer duration still beats a better bitrate',()=>{
  const exact=audio({bytes:1_600_000,durationSeconds:100}),longer=audio({bytes:4_400_000,durationSeconds:101});
  assert.deepEqual(matchingSongRows([longer,exact],target),[exact,longer]);
});
test('a file the downloader would reject never outranks one it can fetch',()=>{
  const tooBig=audio({bytes:AUDIO_FILE_MAX_BYTES+1}),flac=audio({mimeType:'audio/flac',bytes:9_000_000}),ok=audio({bytes:1_600_000});
  assert.deepEqual(matchingSongRows([tooBig,flac,ok],target),[ok,tooBig,flac]);
});
test('a rejected-only result is still returned so the existing error path stays unchanged',()=>{
  const tooBig=audio({bytes:AUDIO_FILE_MAX_BYTES+1});
  assert.deepEqual(matchingSongRows([tooBig],target),[tooBig]);
});
test('title, performer and version rules are unchanged by quality',()=>{
  const live=audio({title:'Synthetic song (Live)',bytes:4_000_000}),other=audio({performer:'Someone else',bytes:4_000_000}),ok=audio({bytes:800_000});
  assert.deepEqual(matchingSongRows([live,other,ok],target),[ok]);
});
