import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyLocalAlbumMetadata,copyOrdinal,normalizeOrdinalTag,resolveLocalAlbumMetadata,unknownLocalAlbum} from '../../src/library/album-metadata';
import {extractLocalAlbumMetadata} from '../../src/imports/album-metadata';
import {orderAlbumRows,groupAlbums,groupArtists} from '../../src/library/groups';
import type {Track} from '../../src/library/library';
import {parseOrganization,serializeOrganization,validateOrganization} from '../../src/library/organization-format';
const source=(n:string,artist='Cafe\u0301')=>extractLocalAlbumMetadata({'ID3v2.4':[{id:'TRCK',value:n},{id:'TPE2',value:artist},{id:'TCMP',value:'1'}]},'audio/mpeg',[]);
const t=(id:string,n?:string):Track=>({id,assetId:null,title:'T',artist:id,album:'A',duration:1,createdAt:'2026-10-31T00:00:00Z',favorite:false,revision:1,manualOverrides:{},...(n?{localAlbum:source(n)}:{})});
test('closed source data, fresh copies, exact evidence; no manual or getters',()=>{
 const a=source('2/300'),copy=copyLocalAlbumMetadata(a);assert.deepEqual(copy,a);assert.notEqual(copy?.source.track,a.source.track);
 for(const bad of [{...a,manual:{}},{...a,version:2},{...a,source:{...a.source,x:1}},{...a,source:{...a.source,track:{state:'known',value:{current:2,total:3},evidence:{kind:'embedded-mp4',tag:'TRCK'}}}}])assert.equal(copyLocalAlbumMetadata(bad),null);
 let calls=0;Object.defineProperty(a.source,'track',{get(){calls++;throw Error();}});assert.equal(copyLocalAlbumMetadata(a),null);assert.equal(calls,0);
 const b=source('2');Object.defineProperty(b,Symbol('x'),{value:1});assert.equal(copyLocalAlbumMetadata(b),null);
 assert.equal(copyLocalAlbumMetadata(Object.create(source('2'))),null);
 const oversized={...source('1'),...Object.fromEntries(Array.from({length:10000},(_,i)=>['x'+i,0]))};assert.equal(copyLocalAlbumMetadata(oversized),null);
 const hidden=source('1');Object.defineProperty(hidden,'extra',{value:0});assert.equal(copyLocalAlbumMetadata(hidden),null);
});
test('strict ordinals, text zero invalid, binary/total-only boundaries',()=>{
 for(const raw of ['2abc','2/3abc','0','0/2','2/0','3/2','65536','1.5','1 /2','/2','2/','-1','1e2','1\u00a0','1/2/3'])assert.equal(normalizeOrdinalTag(raw),null,raw);
 assert.deepEqual(normalizeOrdinalTag(' 002/65535\n'),{current:2,total:65535});
 assert.deepEqual(copyOrdinal({current:null,total:65535}),{current:null,total:65535});
 for(const value of [{current:null,total:null},{current:NaN,total:1},{current:1,total:Infinity},{current:1,total:2,x:1}])assert.equal(copyOrdinal(value),null);
});
test('legacy overrides stay exact and absence is virtual unknown',()=>{
 const a=t('x');a.manualOverrides={title:'T',album:null};const before=JSON.stringify(a);
 assert.equal(resolveLocalAlbumMetadata(a).track.state,'unknown');assert.deepEqual(resolveLocalAlbumMetadata(a).albumArtist,{state:'unknown',reason:'legacy'});assert.equal(JSON.stringify(a),before);
 for(const reason of ['legacy','absent','not-inspected','omitted','invalid','conflict'] as const)assert.deepEqual(copyLocalAlbumMetadata(unknownLocalAlbum(reason)),unknownLocalAlbum(reason));
});
test('ID3 native strict values and conflicting candidates; no common coercion',()=>{
 const a=source('2abc');assert.deepEqual(a.source.track,{state:'unknown',reason:'invalid'});
 const b=extractLocalAlbumMetadata({'ID3v2.3':[{id:'TRCK',value:'2'},{id:'TRCK',value:'3'},{id:'TCMP',value:'true'}]},'audio/wav',[]);
 assert.deepEqual(b.source.track,{state:'unknown',reason:'conflict'});assert.deepEqual(b.source.compilation,{state:'unknown',reason:'invalid'});
 assert.deepEqual(extractLocalAlbumMetadata({},'audio/mp4',[],'omitted'),unknownLocalAlbum('omitted'));
});
test('MP4 real 16bit pair validates reserved bytes, text and booleans',()=>{
 const payload=new Uint8Array(16);payload[10]=1;payload[11]=44;payload[12]=2;payload[13]=0;
 const a=extractLocalAlbumMetadata({},'audio/mp4',[{tag:'trkn',payload}]);assert.deepEqual(a.source.track.state==='known'&&a.source.track.value,{current:300,total:512});
 payload[14]=1;assert.deepEqual(extractLocalAlbumMetadata({},'audio/mp4',[{tag:'trkn',payload}]).source.track,{state:'unknown',reason:'invalid'});
 payload[14]=0;payload[10]=0;payload[11]=0;assert.deepEqual(extractLocalAlbumMetadata({},'audio/mp4',[{tag:'disk',payload}]).source.disc.state==='known'&&extractLocalAlbumMetadata({},'audio/mp4',[{tag:'disk',payload}]).source.disc,{state:'known',value:{current:null,total:512},evidence:{kind:'embedded-mp4',tag:'disk'}});
});
test('group albumArtist presentation equivalence, distinct fallback credits, artists independent',()=>{
 const a=t('a','1'),b=t('b','2');b.localAlbum=source('2','Café');
 const groups=groupAlbums([a,b,a]);assert.equal(groups.length,1);assert.deepEqual(groups[0].trackIds,['a','b','a']);assert.equal(groups[0].criterion,'albumArtist');assert.equal(groups[0].completeness,'unknown');assert.equal(groups[0].artist,'Cafe\u0301');
 assert.equal(groupArtists([a,b]).length,2);assert.equal(groupAlbums([a,t('a')]).length,2);
 b.localAlbum=source('2','café');assert.equal(groupAlbums([a,b]).length,1);
});
test('stable selected-album ordering keeps all occurrences and ignores totals',()=>{
 const a=t('same','2/9'),b=t('same','1/8'),c=t('c','2/99'),d=t('d');
 const rows=[a,b,c,a,d].map((track,i)=>({track,key:String(i)}));const sorted=orderAlbumRows(rows);
 assert.deepEqual(sorted.map(x=>x.key),['1','0','2','3','4']);assert.equal(sorted[1],rows[0]);assert.deepEqual(rows.map(x=>x.key),['0','1','2','3','4']);
 a.localAlbum!.source.disc={state:'known',value:{current:2,total:2},evidence:{kind:'embedded-id3',tag:'TPOS'}};
 assert.deepEqual(orderAlbumRows(rows).map(x=>x.key),['0','3','1','2','4']);
});
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const v1={format:'pulso-web-organization' as const,version:1 as const,exportId:id(1),libraryId:id(2),exportedAt:'2026-10-31T00:00:00Z',tracks:[{ref:{libraryId:id(2),id:id(3)},title:'T',artist:null,album:null,duration:1,createdAt:'2026-10-31T00:00:00Z',manualOverrides:{},audio:null}],favorites:[],playlists:[]};
test('v1 canonical bytes/digest frozen, v2 strict dispatch and lossless source roundtrip',()=>{
 const canonical=JSON.stringify(v1);assert.equal(serializeOrganization(v1),canonical);
 assert.equal(createHash('sha256').update(serializeOrganization(v1)).digest('hex'),'e360f8b6a35db843e25188e2870c47399fc43ba35cec09dac7dadc731ed3f332');
 const v2={...v1,version:2,tracks:v1.tracks.map(t=>({...t,localAlbum:source('300/512')}))};
 assert.deepEqual(parseOrganization(JSON.stringify(v2)),v2);
 for(const bad of [{...v1,tracks:v2.tracks},{...v2,tracks:v1.tracks},{...v2,version:3},{...v2,tracks:[{...v2.tracks[0],localAlbum:{...source('1'),manual:{}}}]}])assert.throws(()=>validateOrganization(bad));
 const nullV2={...v2,tracks:[{...v2.tracks[0],localAlbum:null}]};assert.deepEqual(parseOrganization(JSON.stringify(nullV2)),nullV2);
 const large=source('1');large.source.albumArtist={state:'known',value:'x'.repeat(301),evidence:{kind:'embedded-id3',tag:'TPE2'}};assert.equal(copyLocalAlbumMetadata(large),null);
});
