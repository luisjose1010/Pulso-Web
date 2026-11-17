import {openDatabase,admittedTransaction,request,closeDatabase} from '../../src/storage/database';
import {transactionDone} from '../../src/storage/transaction-done';
import {prepareAccountLibrary,readAccountLibrary,applyAccountLibrary,attachRestoredAccountTrack} from '../../src/accounts/library-local';
import {createLibrarySync,accountLibraryRequest} from '../../src/accounts/library-sync';
import {groupAlbums,groupArtists} from '../../src/library/groups';
import {makeLibraryMembership,libraryMembershipKey} from '../../src/library/library-membership';
const id=(n:number)=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
let account=id(100),live=true;
async function rows(store:string){const db=await openDatabase();try{const tx=admittedTransaction(db,store),done=transactionDone(tx);const value=await request(tx.objectStore(store).getAll());await done;return value;}finally{closeDatabase(db);}}
async function seed(n:number,owned=false,cache=false){const db=await openDatabase();try{const tx=admittedTransaction(db,['tracks','settings','assets','chunks'],'readwrite'),done=transactionDone(tx);const t={id:id(n),...(owned?{accountId:account}:{}),title:'Propia '+n,artist:'Artista propio',album:'Álbum propio',duration:2,createdAt:'2026-11-17T00:00:00Z',revision:1,assetId:id(n+200),audioFingerprint:{algorithm:'sha256',sha256:'a'.repeat(64),bytes:16},favorite:false,manualOverrides:{}};tx.objectStore('tracks').put(t,t.id);tx.objectStore('assets').put({id:t.assetId,namespace:'local',storageKey:t.assetId,bytes:16,sha256:'a'.repeat(64),mime:'audio/wav',chunks:1,state:'complete',revision:1,chunkSize:65536,backend:'idb',retention:'kept'},t.assetId);tx.objectStore('chunks').put(new Uint8Array(16).fill(n),[t.assetId,0]);if(cache)tx.objectStore('settings').put(makeLibraryMembership(t.id,false),libraryMembershipKey(t.id));await done;}finally{closeDatabase(db);}}
async function mutate(store:string,key:string,patch:object){const db=await openDatabase();try{const tx=admittedTransaction(db,store,'readwrite'),done=transactionDone(tx),s=tx.objectStore(store),old=await request(s.get(key));s.put({...old,...patch},key);await done;}finally{closeDatabase(db);}}
const sync=createLibrarySync({read:readAccountLibrary,apply:applyAccountLibrary,remote:accountLibraryRequest,save:(i,r,d,s)=>accountLibraryRequest(i,s,{revision:r,document:d}),ready:()=>live,changed:()=>{}});
const api={id,seed,rows,mutate,
 async prepare(n:number){sync.account(null);account=id(n);await prepareAccountLibrary(account,()=>true);sync.account(account);},
 async sync(){await sync.sync();return sync.getSnapshot();},
 async snapshot(){const result=await readAccountLibrary(account,()=>true);const tracks=result.document.tracks.map(t=>({...t,assetId:null,revision:1,manualOverrides:{},localAlbum:t.localAlbum??undefined}));return {...result,albums:groupAlbums(tracks),artists:groupArtists(tracks)};},
 async list(n:number,trackIds:number[]){const db=await openDatabase();try{const tx=admittedTransaction(db,'playlists','readwrite'),done=transactionDone(tx);tx.objectStore('playlists').put({id:id(n),accountId:account,name:'Mi playlist',revision:1,entries:trackIds.map(v=>({id:id(v+500),trackId:id(v)}))},id(n));await done;}finally{closeDatabase(db);}},
 async deleteList(n:number){const db=await openDatabase();try{const tx=admittedTransaction(db,'playlists','readwrite'),done=transactionDone(tx);tx.objectStore('playlists').delete(id(n));await done;}finally{closeDatabase(db);}},
 async physical(){const [assets,chunks]=await Promise.all([rows('assets'),rows('chunks')]);return {assets:assets.length,chunks:chunks.map((v:any)=>Array.from(v))};},
 async attach(old:number,fresh:number){return attachRestoredAccountTrack(account,id(old),id(fresh),()=>live);},
 dispose(){sync.dispose();},
};
Object.assign(window,{libraryFixture:api});
