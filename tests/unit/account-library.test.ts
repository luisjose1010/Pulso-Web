import test from 'node:test';import assert from 'node:assert/strict';
import {validateAccountLibrary,emptyLibrary,mergeAccountLibraries,type AccountLibraryDocument} from '../../src/accounts/library-document.mjs';
import {createLibrarySync,LibrarySyncConflict,accountLibraryRequest} from '../../src/accounts/library-sync';
import {copyImportResult} from '../../src/imports/import-protocol';
import {validateTrack} from '../../src/library/local-copy-removal-snapshot';
const uuid=(n:number)=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const track=(n:number)=>({id:uuid(n),title:'Pista '+n,artist:'Artista',album:'Álbum',duration:45,favorite:false,inLibrary:true,createdAt:'2026-11-17T00:00:00.000Z',localAlbum:null,catalog:null});
const document=(n=1):AccountLibraryDocument=>({version:1,tracks:Array.from({length:n},(_,i)=>track(i+1)),playlists:[]});
test('account documents are metadata only; private/local/binary fields and false availability are rejected',()=>{
 const d=document();assert.deepEqual(validateAccountLibrary(d),d);
 for(const extra of [{assetId:uuid(8)},{audio:'base64'},{telegramPeer:'secret'},{sha256:'a'.repeat(64)},{downloaded:true}])assert.throws(()=>validateAccountLibrary({...d,tracks:[{...d.tracks[0],...extra}]}));
 assert.throws(()=>validateAccountLibrary({...d,playlists:[{id:uuid(9),name:'Lista',entries:[{id:uuid(10),trackId:uuid(50)}]}]}));
 assert.throws(()=>validateAccountLibrary({...d,tracks:[...d.tracks,...d.tracks]}));
});
test('two devices retain independent tracks and field changes, with no silent empty-library replacement',()=>{
 const base=document(),local=structuredClone(base),remote=structuredClone(base);local.tracks[0].favorite=true;remote.tracks[0].title='Corregida';remote.tracks.push(track(2));
 const result=mergeAccountLibraries(base,local,remote);assert.equal(result.tracks.length,2);assert.equal(result.tracks[0].favorite,true);assert.equal(result.tracks[0].title,'Corregida');
 assert.deepEqual(mergeAccountLibraries(emptyLibrary(),emptyLibrary(),remote),remote);
});
test('playlist concurrent additions and removal survive merge and ordering is stable',()=>{
 const base=document(3);base.playlists=[{id:uuid(9),name:'Lista',entries:[{id:uuid(10),trackId:uuid(1)}]}];
 const local=structuredClone(base),remote=structuredClone(base);local.playlists[0].entries=[{id:uuid(11),trackId:uuid(2)}];remote.playlists[0].entries.push({id:uuid(12),trackId:uuid(3)});
 const result=mergeAccountLibraries(base,local,remote);assert.deepEqual(result.playlists[0].entries.map(e=>e.trackId),[uuid(2),uuid(3)]);
 const deleted=structuredClone(base);deleted.playlists=[];assert.equal(mergeAccountLibraries(base,deleted,base).playlists.length,0);
});
test('sync changed account rejects a late response and never sends old data to the next user',async()=>{
 let release!:(v:{accountId:string;revision:null;document:AccountLibraryDocument})=>void;let applied=0,saved=0;
 const controller=createLibrarySync({ready:()=>true,read:async()=>({document:document(),base:emptyLibrary()}),remote:()=>new Promise(res=>{release=res;}),save:async(id,_r,d)=>{saved++;return {accountId:id,revision:1,document:d};},apply:async()=>{applied++;},changed:()=>{}});
 controller.account(uuid(20));const pending=controller.sync();await new Promise<void>(r=>queueMicrotask(r));controller.account(null);release({accountId:uuid(20),revision:null,document:emptyLibrary()});await pending;assert.equal(saved,0);assert.equal(applied,0);controller.dispose();
});
test('failed or conflicting sync keeps local changes and never reports saved',async()=>{
 for(const error of [new Error('offline'),new LibrarySyncConflict()]){let applied=false;const controller=createLibrarySync({ready:()=>true,read:async()=>({document:document(),base:emptyLibrary()}),remote:async()=>({accountId:uuid(20),revision:1,document:emptyLibrary()}),save:async()=>{throw error;},apply:async()=>{applied=true;},changed:()=>{}});
 controller.account(uuid(20));await controller.sync();assert.equal(applied,false);assert.equal(controller.getSnapshot(),error instanceof LibrarySyncConflict?'conflict':'unavailable');controller.dispose();}
});
test('account-owned imported tracks remain accepted by worker and physical-removal boundaries',()=>{
 const t={...track(1),accountId:uuid(20),assetId:uuid(30),audioFingerprint:{algorithm:'sha256',sha256:'a'.repeat(64),bytes:16},revision:1,manualOverrides:{}};
 const {catalog,localAlbum,inLibrary,...row}=t;assert.equal(catalog,null);assert.equal(localAlbum,null);assert.equal(inLibrary,true);
 assert.ok(copyImportResult({track:row,duplicate:false}));assert.deepEqual(validateTrack(row,row.id),row);
 assert.equal(copyImportResult({track:{...row,accountId:'bad'},duplicate:false}),null);
});
test('a malformed remote reply is never treated as an empty library',async()=>{
 await assert.rejects(accountLibraryRequest(uuid(20),new AbortController().signal,undefined,async()=>Response.json({accountId:uuid(20),revision:1}) as never));
});
