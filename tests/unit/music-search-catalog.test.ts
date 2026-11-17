import test from 'node:test';
import assert from 'node:assert/strict';
import {musicSearchCatalog,musicCatalogKey,MUSIC_CATALOG_LIMITS} from '../../src/library/music-search-catalog';
import type {Track} from '../../src/library/library';
const row=(id:number,title='Hello',artist='Own Artist',album='Album',duration=200)=>({id,trackName:title,artistName:artist,albumName:album,duration});
test('corroborated scraped media labels do not repeat a song or turn null into an album',()=>{
 const rows=[row(1,'Flores','Own Artist','Single',160),row(2,'FLORES','Video • Own Artist','null',164),row(3,'Flores','Song, Own Artist','null',160)];
 const out=musicSearchCatalog('flores own artist',[],rows);assert.deepEqual(out.filter(r=>r.kind==='track').map(r=>r.id),['lrclib:1']);assert.equal(out.some(r=>r.album==='null'),false);
 assert.equal(rows[1].artistName,'Video • Own Artist');
});
test('missing corroboration and distinct versions stay separate; close records group while distant durations do not',()=>{
 const out=musicSearchCatalog('flores',[],[row(1,'Flores','Own Artist','Single',160),row(2,'Flores','Song, Own Artist','Record',160),row(3,'Flores (Live)','Video • Own Artist','null',164),row(4,'Flores','Song, Own Artist','null',200),row(5,'Flores','Video • Another Artist','null',160)]);
 // Historical expectation omitting row 4 is intentionally replaced: the earlier
 // 40-second duration gap is insufficient evidence that it duplicates row 1.
 assert.deepEqual(out.filter(r=>r.kind==='track').map(r=>r.id),['lrclib:1','lrclib:2','lrclib:3','lrclib:4','lrclib:5']);
 const distant=musicSearchCatalog('flores',[],[row(1,'Flores','Own Artist','Single',160),row(4,'Flores','Song, Own Artist','null',200)]);
 assert.equal(distant.filter(r=>r.kind==='track').length,2);
});
test('same punctuation-normalized title and full performer group only within five seconds; versions stay distinct',()=>{
 const result=musicSearchCatalog('hello',[],[row(1),row(2,'HELLO','own artist','Compilation',199),row(3,'Hello','Own Artist','Deluxe',204),row(4,'Hello (Live)'),row(5,'Hello (Remix)'),row(6,'Hello','Another performer')]);
 assert.equal(result.filter(r=>r.kind==='track').length,4);
 assert.deepEqual(result.map(r=>r.id),['lrclib:1','lrclib:4','lrclib:5','lrclib:6']);
 assert.equal(result.some(r=>r.kind==='album'),false);
 const punctuated=musicSearchCatalog('sangre',[],[row(7,'SANGRE !','Nsqk','album',200),row(8,'SANGRE!','Nsqk','álbum',200)]);
 assert.deepEqual(punctuated.filter(r=>r.kind==='track').map(r=>r.id),['lrclib:7']);
 const accents=musicSearchCatalog('corazon',[],[row(9,'Corazón','Nsqk', 'disco',200),row(10,'Corazon','Nsqk','disco',200)]);
 assert.deepEqual(accents.filter(r=>r.kind==='track').map(r=>r.id),['lrclib:9']);
 const distinct=musicSearchCatalog('song',[],[row(11,'Song','Artist','Album',120),row(12,'Song','Artist','Album',260),row(13,'Song (Live)','Artist','Album',120),row(14,'Song','Other Artist','Album',120)]);
 assert.equal(distinct.filter(r=>r.kind==='track').length,4);
 const close=musicSearchCatalog('song',[],[row(15,'Song','Artist','One',120),row(16,'Song','Artist','Two',124)]);
 assert.equal(close.filter(r=>r.kind==='track').length,1);
 const distant=musicSearchCatalog('song',[],[row(17,'Song','Artist','One',120),row(18,'Song','Artist','Two',126)]);
 assert.equal(distant.filter(r=>r.kind==='track').length,2);
});
test('a compatible local recording suppresses the duplicate LRCLIB row',()=>{
 const local={id:'owned',title:'MUSIC_FLOW Song (Live version)',artist:'MUSIC_FLOW Artist',album:'MUSIC_FLOW Album',duration:45} as Track;
 const remote=[row(81,'MUSIC_FLOW Song (Live version)','MUSIC_FLOW Artist','MUSIC_FLOW Album',45)];
 const out=musicSearchCatalog('MUSIC_FLOW Song',[local],remote).filter(x=>x.kind==='track');
 assert.deepEqual(out.map(x=>({id:x.id,source:x.source})),[{id:'local:owned',source:'local'}]);
});

test('local, LRCLIB and iTunes metadata for one recording yield one row within the track limit',()=>{
 const local={id:'owned',title:'One Song',artist:'One Artist',album:'One Album',duration:200} as Track;
 const remote=[row(82,'One Song','One Artist','Compilation',201)];
 const songHints=[{releaseId:7,trackId:8,disc:1,position:1,title:'One Song',artist:'One Artist',album:'One Album',durationMs:200000}];
 const out=musicSearchCatalog('one song',[local],remote,[],[],[],songHints).filter(x=>x.kind==='track');
 assert.equal(out.length,1);assert.equal(out[0].id,'local:owned');assert.equal(out[0].source,'local');assert.ok(out.length<=MUSIC_CATALOG_LIMITS.tracks);
 const unknown=musicSearchCatalog('One Song',[{...local,id:'unknown-duration',duration:NaN}],[],[],[],[],[{...songHints[0],releaseId:9,trackId:10,durationMs:NaN}]).filter(x=>x.kind==='track');
 assert.equal(unknown.length,2,'unknown durations remain separate because equivalence cannot be established');
 const versions=musicSearchCatalog('One Song',[local],[row(83,'One Song (Live)','One Artist','One Album',200)],[],[],[],[{...songHints[0],releaseId:11,trackId:12,title:'One Song (Remix)'}]).filter(x=>x.kind==='track');
 assert.equal(versions.length,3,'Live and Remix recordings remain distinct');
 const capped=musicSearchCatalog('One Song',[],Array.from({length:100},(_,i)=>row(100+i,'One Song',`Artist ${i}`,'Album',200))).filter(x=>x.kind==='track');
 assert.equal(capped.length,MUSIC_CATALOG_LIMITS.tracks,'unique rows still obey the public track limit');
});

test('zero duration synthetic catalogue rows are excluded without blacklisting the artist',()=>{
 assert.equal(musicSearchCatalog('nsqk',[],[row(1,'nsqk','nsqk','nsqk',0)]).filter(r=>r.kind==='track').length,0);
 assert.equal(musicSearchCatalog('nsqk',[],[row(2,'Otra','nsqk','Disco',180)]).filter(r=>r.kind==='track').length,1);
});
test('LRCLIB collection text is not an album suggestion without independent release corroboration',()=>{
 const rows=[row(31,'Sur (Interludio)','Nsqk','Nsqk',108),row(32,'SANGRE ! (Visualizer)','Nsqk','Nsqk Songs',229),row(33,'Dientes [Visualizer] | ROY','Nsqk','Nsqk Videos',180),row(34,'Nsqk','Nsqk','Nsqk',180)];
 const out=musicSearchCatalog('Nsqk',[],rows);assert.equal(out.filter(r=>r.kind==='album').length,0);
 const real=musicSearchCatalog('Nsqk',[],[],[{id:77,title:'Nsqk',artist:'Nsqk',trackCount:8,releaseDate:null}]);assert.equal(real.filter(r=>r.kind==='album').length,1);
});
test('unknown durations never overwrite each other and tolerance grouping is not transitive',()=>{
 const unknown=musicSearchCatalog('NaN local',[{id:'a',title:'NaN local',artist:'Example',album:'A',duration:NaN} as Track,{id:'b',title:'NaN local',artist:'Example',album:'B',duration:NaN} as Track],[]).filter(x=>x.kind==='track');assert.equal(unknown.length,2);
 const rows=[row(200,'Artist - Bridge (Visualizer)','Artist','A',200),row(205,'Bridge','Artist','B',205),row(210,'Bridge','Artist','C',210)];
 for(const permutation of [rows,[...rows].reverse(),[rows[1],rows[0],rows[2]]])assert.equal(musicSearchCatalog('Bridge',[],permutation).filter(x=>x.kind==='track').length,2);
 assert.equal(musicSearchCatalog('Bridge',[],[row(1,'Bridge (Live)','Artist','A',200),row(2,'Bridge','Artist','B',205)]).filter(x=>x.kind==='track').length,2);
});
test('video decorations and a matching full artist prefix group for display without changing acquisition metadata',()=>{
 const local={id:'owned',title:'nsqk - Santurce (Visualizer)',artist:'Nsqk',album:null,duration:200} as Track;
 const remote=[row(1,'Santurce','Nsqk'),row(2,'Santurce (Official Video)','NSQK'),row(3,'Santurce (Official Audio)','Nsqk')];
 const result=musicSearchCatalog('santurce',[local],remote);
 assert.equal(result.length,1);
 const localChoice=result.find(r=>r.id==='local:owned');assert.equal(localChoice?.source,'local');
 assert.equal(localChoice?.title,'nsqk - Santurce (Visualizer)');assert.equal(localChoice?.displayTitle,'Santurce');
 assert.equal(result.some(r=>r.source==='lrclib'),false);
 assert.equal(local.title,'nsqk - Santurce (Visualizer)');assert.equal(remote[1].trackName,'Santurce (Official Video)');
});
test('full credits and meaningful version labels remain distinct',()=>{
 const result=musicSearchCatalog('santurce',[],[
  row(1,'Other, Riosse - Santurce','Nsqk'),row(2,'Santurce','Nsqk'),
  row(3,'Nsqk, Riosse - Santurce (Visualizer)','Nsqk, Riosse'),
  row(4,'Santurce (Live)','Nsqk'),row(5,'Santurce (Remix)','Nsqk'),
  row(6,'Santurce (Acoustic)','Nsqk'),row(7,'Santurce (Album Version)','Nsqk'),
  row(8,'Santurce (Live Visualizer)','Nsqk'),row(9,'Visualizer','Nsqk'),
  row(10,'Nsqk - Santurce', ''),
 ]);
 assert.equal(result.length,9);
 assert.equal(result.find(r=>r.id==='lrclib:1')?.title,'Other, Riosse - Santurce');
 assert.equal(result.find(r=>r.id==='lrclib:1')?.displayTitle,undefined);
 assert.equal(result.find(r=>r.id==='lrclib:3')?.displayTitle,'Santurce');
 assert.equal(result.find(r=>r.id==='lrclib:8')?.displayTitle,undefined);
 assert.equal(result.some(r=>r.id==='lrclib:9'),false);
 assert.equal(result.find(r=>r.id==='lrclib:10')?.displayTitle,undefined);
});
test('comma-prefixed presentation groups with the declared whole artist and prefers a clean remote target',()=>{
 const dirty=row(1,'nsqk, Riosse - Lo Tuvimos Pero Ya No Está (Visualizer)','Nsqk');
 const clean=row(2,'Lo Tuvimos Pero Ya No Está','NSQK');
 const substring=row(3,'Supernsqk, Riosse - Lo Tuvimos Pero Ya No Está (Visualizer)','Nsqk');
 const otherCredit=row(4,'nsqk, Riosse - Lo Tuvimos Pero Ya No Está (Visualizer)','Nsqk, Riosse');
 const out=musicSearchCatalog('lo tuvimos',[],[dirty,clean,substring,otherCredit]);
 assert.equal(out.length,3);
 assert.equal(out[0].id,'lrclib:2');assert.equal(out[0].title,clean.trackName);assert.equal(out[0].artist,'NSQK');
 assert.equal(out.find(r=>r.id==='lrclib:3')?.displayTitle,'Supernsqk, Riosse - Lo Tuvimos Pero Ya No Está');
 assert.equal(out.find(r=>r.id==='lrclib:4')?.displayTitle,'Lo Tuvimos Pero Ya No Está');
 assert.equal(dirty.artistName,'Nsqk');assert.equal(dirty.trackName,'nsqk, Riosse - Lo Tuvimos Pero Ya No Está (Visualizer)');
 const local={id:'owned',title:dirty.trackName,artist:'Nsqk',album:null,duration:200} as Track;
 const localResult=musicSearchCatalog('lo tuvimos',[local],[clean]);
 assert.equal(localResult.length,1);assert.equal(localResult.find(r=>r.source==='local')?.id,'local:owned');assert.equal(localResult.find(r=>r.source==='local')?.title,dirty.trackName);assert.equal(localResult.some(r=>r.source==='lrclib'),false);
});
test('presentation keys normalize Unicode quotes/dashes and spacing, not words or accents',()=>{
 assert.equal(musicCatalogKey('  “ Hello  –  Live ”  '),musicCatalogKey('hello-live'));
 assert.notEqual(musicCatalogKey('Hello (Live)'),musicCatalogKey('Hello'));
 assert.notEqual(musicCatalogKey('El'),musicCatalogKey('Él'));
});
test('artist-only queries retain songs and albums from declared performer metadata',()=>{
 const local={id:'owned',title:'Hello',artist:'Own Artist',album:'Album',duration:200} as Track;
 assert.deepEqual(musicSearchCatalog('Own Artist',[local],[]).map(r=>r.kind),['track','album']);
 const result=musicSearchCatalog('hello',[],[row(1)]);assert.equal(result[0].artist,'Own Artist');assert.equal(result.some(r=>(r.kind as string)==='artist'),false);
});
test('albums appear only for matching album names and group by title plus performer',()=>{
 const result=musicSearchCatalog('night',[{id:'a',title:'First',artist:'Own Artist',album:'Night',duration:100} as Track,{id:'b',title:'Second',artist:'OWN ARTIST',album:'NIGHT',duration:110} as Track,{id:'c',title:'Third',artist:'Another artist',album:'Night',duration:120} as Track],[]);
 assert.equal(result.filter(r=>r.kind==='track').length,3);assert.equal(result.filter(r=>r.kind==='album').length,2);
});
test('local metadata wins the duplicate group and unknown performers are not silently merged',()=>{
 const local={id:'owned-track',title:'Hello',artist:'Own Artist',album:null,duration:200} as Track;
 const result=musicSearchCatalog('hello',[local,{...local,id:'unknown',artist:null}],[row(1)]);
 assert.equal(result.length,2);assert.ok(result.some(r=>r.id==='local:owned-track'&&r.source==='local'));assert.ok(result.some(r=>r.artist===null));
});
test('empty queries stay empty; unrelated local records are excluded and local selection is bounded',()=>{
 assert.deepEqual(musicSearchCatalog(' ',[],[row(1)]),[]);assert.deepEqual(musicSearchCatalog('missing',[{id:'owned',title:'Hello',artist:null,album:null,duration:1} as Track],[]),[]);
 const local=Array.from({length:1000},(_,i)=>({id:String(i),title:'Song '+i,artist:'Own',album:null,duration:1} as Track));
 const out=musicSearchCatalog('song',local,[]);assert.equal(out.length,MUSIC_CATALOG_LIMITS.localMatches);
});

test('full metadata matches tolerate accents',()=>{
 const result=musicSearchCatalog('besame mucho own artist',[],[row(99,'Bésame Mucho')]);assert.equal(result.length,1);assert.equal(result[0].title,'Bésame Mucho');
});
test('local title matching tolerates accents and punctuation without broad punctuation-only matches',()=>{
 const local={id:'owned',title:'Bésame, Mucho!',artist:'Own',album:null,duration:1} as Track;
 assert.equal(musicSearchCatalog('besame mucho',[local],[]).length,1);assert.deepEqual(musicSearchCatalog('---',[local],[]),[]);
});

test('cross-field words, order, punctuation and prefixes rank full title and performer first',()=>{
 const local=[{id:'wrong',title:'Yo siempre contesto',artist:'Otro',album:null,duration:1},{id:'right',title:'Yo siempre contesto',artist:'LATIN MAFIA',album:null,duration:1}] as Track[];
 for(const q of ['yo siempre contesto latin mafia','MAFIA, latin contésto siempre yo','yo siempre contes latin maf']){
  const out=musicSearchCatalog(q,local,[row(200,'Yo siempre contesto','Another')]);assert.equal(out[0].id,'local:right');assert.equal(out.some(r=>r.id==='local:wrong'),false);
 }
});
test('best local match survives cap after a thousand earlier partial matches',()=>{
 const local=Array.from({length:1000},(_,i)=>({id:String(i),title:'Yo siempre contesto',artist:'Otro',album:null,duration:1} as Track));
 local.push({id:'best',title:'Yo siempre contesto',artist:'LATIN MAFIA',album:null,duration:1} as Track);
 assert.equal(musicSearchCatalog('yo siempre contesto latin mafia',local,[])[0].id,'local:best');
});


test('a title identical to the performer remains searchable',()=>{
 const t={id:'same-name',title:'Talk Talk',artist:'Talk Talk',album:null,duration:1} as Track;
 assert.equal(musicSearchCatalog('talk talk',[t],[])[0]?.id,'local:same-name');
});

test('canonical artist and edition identities remain distinct from song choices',()=>{
 const result=musicSearchCatalog('luna',[],[row(1,'Luna','Full Artist Credit')],[{id:42,title:'Luna',artist:'Album Credit',trackCount:3,releaseDate:null}],[{id:42,name:'Luna'}]);
 assert.deepEqual(result.map(item=>item.id),['lrclib:1','itunes:album:42','itunes:artist:42']);
 const album=result.find(item=>item.kind==='album');const artist=result.find(item=>item.kind==='artist');
 assert.equal(album?.kind==='album'&&album.editionId,42);assert.equal(artist?.kind==='artist'&&artist.artistId,42);
 assert.equal(result[0].artist,'Full Artist Credit');
});

test('concrete editions suppress only the same inferred full credit and preserve distinct IDs',()=>{
 const editions=[{id:1,title:'Night',artist:'Own Artist',trackCount:3,releaseDate:null},{id:2,title:'NIGHT',artist:'OWN ARTIST',trackCount:4,releaseDate:null}];
 const result=musicSearchCatalog('night',[],[row(1,'Song','Own Artist','Night'),row(2,'Song 2','Other','Night')],editions);
 assert.deepEqual(result.filter(r=>r.kind==='album').map(r=>r.id),['itunes:album:1','itunes:album:2']);
});

test('song-batch album candidates retain edition identity for title and title plus artist',()=>{
 const hints=[{id:912,title:'Night',artist:'Example',artworkUrl:'https://is1-ssl.mzstatic.com/image/thumb/a.jpg'}, {id:913,title:'Night',artist:'Example'}];
 for(const query of ['night','night example']){
  const albums=musicSearchCatalog(query,[],[],[],[],hints).filter(r=>r.kind==='album');
  assert.deepEqual(albums.map(a=>a.id),['itunes:album:912','itunes:album:913']);
  assert.equal(albums[0].kind==='album'&&albums[0].editionId,912);
 }
 const out=musicSearchCatalog('night',[],[],[{id:912,title:'Night',artist:'Example',trackCount:2,releaseDate:null}],[],hints);
 assert.deepEqual(out.filter(r=>r.kind==='album').map(r=>r.id),['itunes:album:912','itunes:album:913']);
});

 test('full query applies across provider metadata in either order and preserves identities',()=>{
 const tracks=[row(101,'Una canción','Ejemplo','Nóche'),row(102,'Noche','Otro','Otra'),row(103,'Algo','Ejemplo','Otro'),row(104,'Noche (Live)','Ejemplo','Noche')];
 const editions=[{id:201,title:'Noche',artist:'Ejemplo',trackCount:2,releaseDate:null},{id:202,title:'Ejemplo',artist:'Otro',trackCount:2,releaseDate:null}];
 const artists=[{id:301,name:'Ejemplo'},{id:302,name:'Ejemplo Noche'}];
 const hints=[{id:401,title:'Noche',artist:'Ejemplo'},{id:402,title:'Ejemplo',artist:'Otro'}];
 for(const query of ['Noche Ejemplo','Ejemplo, NÓCHE']){
  const out=musicSearchCatalog(query,[],tracks,editions,artists,hints);
  assert.deepEqual(out.map(x=>x.id),['lrclib:101','lrclib:104','itunes:album:201','itunes:album:401','itunes:artist:302']);
  assert.equal(out[0].album,'Nóche');assert.equal(out[1].title,'Noche (Live)');
 }
 assert.equal(tracks[0].albumName,'Nóche');assert.equal(editions[0].id,201);
 });
 test('artist-only results use declared full words; combined queries exclude unrelated provider rows',()=>{
 const tracks=[row(1,'Mosca','Nsqk','Mosca'),row(2,'Otro','Nsqk','Otro'),row(3,'Mosca','Otro','Mosca'),row(4,'Algo','Nsqk Extra','Otro')];
 const editions=[{id:5,title:'Mosca',artist:'Nsqk',trackCount:2,releaseDate:null},{id:6,title:'Otro',artist:'Nsqk',trackCount:2,releaseDate:null}];
 const artists=[{id:7,name:'Nsqk'},{id:8,name:'Nsqk Mosca'}];
 for(const query of ['Nsqk mosca','mosca nsqk']){
  const out=musicSearchCatalog(query,[],tracks,editions,artists);
  assert.deepEqual(out.map(x=>x.id),['lrclib:1','itunes:album:5','itunes:artist:8']);
 }
 const artist=musicSearchCatalog('Nsqk',[],tracks,editions,artists);
 assert.ok(artist.some(x=>x.id==='lrclib:2'));assert.ok(artist.some(x=>x.id==='itunes:album:6'));
 assert.equal(musicSearchCatalog('nsq',[],[row(2,'Otro','Nsqk','Otro')],editions,artists).length,0);
 });

test('song batch candidates keep album identity and prefer local then iTunes then LRCLIB',async()=>{
 const {catalogSongsFromBatch}=await import('../../src/library/album-catalog');
 const {songChoiceKey}=await import('../../src/library/selected-song');
 const {albumTrackChoice}=await import('../../src/library/album-acquisition');
 const batch={resultCount:4,results:[
  {wrapperType:'track',kind:'song',collectionId:4,trackId:9,discNumber:2,trackNumber:3,trackName:'Noche (Live)',artistName:'Ejemplo, Invitado',collectionName:'Noche',trackTimeMillis:200000},
  {wrapperType:'track',kind:'song',collectionId:4,trackId:10,discNumber:2,trackNumber:4,trackName:'Otra',artistName:'Ejemplo',collectionName:'Otro',trackTimeMillis:100000},
  {wrapperType:'track',kind:'song',collectionId:4,trackId:11,discNumber:2,trackNumber:5,trackName:'Noche',artistName:'Otro',collectionName:'Noche',trackTimeMillis:100000},
  {wrapperType:'track',kind:'song',collectionId:4,trackId:0,discNumber:2,trackNumber:6,trackName:'Inválida',artistName:'Ejemplo',collectionName:'Noche',trackTimeMillis:100000},
 ]};
 const songs=catalogSongsFromBatch(batch);assert.equal(songs.length,3);
 for(const query of ['Noche Ejemplo','Ejemplo Noche']){
  const out=musicSearchCatalog(query,[],[row(90,'Noche (Live)','Ejemplo, Invitado','Noche',200)],[],[],[],songs);
  const chosen=out.find(x=>x.kind==='track');assert.ok(chosen);assert.equal(chosen.id,'itunes:4:2:3:9');
  assert.equal(chosen.title,'Noche (Live)');assert.equal(chosen.artist,'Ejemplo, Invitado');assert.equal(chosen.duration,200);
  assert.ok(songChoiceKey(chosen));
  assert.equal(songChoiceKey(chosen),songChoiceKey(albumTrackChoice({releaseId:4,trackId:9,disc:2,position:3,title:'Noche (Live)',artist:'Ejemplo, Invitado',durationMs:200000},'Noche')));
  assert.equal(out.some(x=>x.id==='itunes:4:2:4:10'||x.id==='itunes:4:2:5:11'||x.id==='lrclib:90'),false);
  const onlyBatch=musicSearchCatalog(query,[],[],[],[],[],songs);assert.equal(onlyBatch.some(x=>x.kind==='album'),false);
 }
 const local={id:'owned',title:'Noche (Live)',artist:'Ejemplo, Invitado',album:'Noche',duration:200} as Track;
 assert.equal(musicSearchCatalog('Noche Ejemplo',[local],[],[],[],[],songs).find(x=>x.kind==='track')?.id,'local:owned');
});

test('song batch parser rejects malformed, oversized and conflicting identities',async()=>{
 const {catalogSongsFromBatch}=await import('../../src/library/album-catalog');
 const row={wrapperType:'track',kind:'song',collectionId:4,trackId:9,discNumber:1,trackNumber:1,trackName:'Song',artistName:'Guest',collectionArtistName:'Main',collectionName:'Album',trackTimeMillis:120000};
 assert.equal(catalogSongsFromBatch({resultCount:1,results:[row]})[0].artist,'Guest');
 assert.equal(catalogSongsFromBatch({resultCount:1,results:[row]})[0].primaryArtist,'Main');
 for(const bad of [{trackId:0},{discNumber:21},{trackNumber:201},{trackTimeMillis:-1},{trackTimeMillis:null},{artistName:''}])assert.deepEqual(catalogSongsFromBatch({resultCount:1,results:[{...row,...bad}]}),[]);
 assert.deepEqual(catalogSongsFromBatch({resultCount:2,results:[row,{...row,artistName:'Different'}]}),[]);
 assert.deepEqual(catalogSongsFromBatch({resultCount:201,results:Array(201).fill(row)}),[]);
});

test('a unique declared catalog primary corroborates grouping without rewriting local metadata',()=>{
 const hints=[{releaseId:4,trackId:9,disc:1,position:1,title:'¿Qué Tan Cerca?',artist:'Main & Guest',primaryArtist:'Main',album:'Record',durationMs:200000,artworkUrl:'https://is1-ssl.mzstatic.com/own.jpg'}];
 const local={id:'owned',title:'?Que Tan Cerca?',artist:'MAIN',album:'Record',duration:201} as Track;
 const remote=[row(1,'¿Qué Tan Cerca?','Main','Record',200)];
 const out=musicSearchCatalog('cerca',[local],remote,[],[],[],hints).filter(r=>r.kind==='track');
 assert.equal(out.length,1);assert.ok(out.some(r=>r.id==='local:owned'&&r.artist==='MAIN'&&r.title===local.title&&r.artworkUrl===hints[0].artworkUrl));
 const onlyRemote=musicSearchCatalog('cerca',[],remote,[],[],[],hints).filter(r=>r.kind==='track');assert.equal(onlyRemote.length,1);assert.equal(onlyRemote[0].artist,'Main & Guest');assert.equal(onlyRemote[0].source,'itunes');
 for(const patch of [{artist:'Other'},{album:'Different'}])assert.equal(musicSearchCatalog('cerca',[{...local,...patch}],[],[],[],[],hints).filter(r=>r.kind==='track').length,2);
 // Historical grouping discarded a 50-second discrepancy; retain both versions.
 const durationVariant=musicSearchCatalog('cerca',[{...local,duration:250}],[],[],[],[],hints).filter(r=>r.kind==='track');assert.equal(durationVariant.length,2);assert.ok(durationVariant.some(r=>r.duration===250));
 const ambiguous=[...hints,{...hints[0],trackId:10,artist:'Main & Other Guest'}];assert.equal(musicSearchCatalog('cerca',[local],[],[],[],[],ambiguous).filter(r=>r.kind==='track').length,3);
});

test('a unique declared album cover also serves local and lyric-only rows without extra per-track requests',()=>{
 const cover='https://is1-ssl.mzstatic.com/own.jpg',hints=[{id:4,title:'Record',artist:'Own Artist',artworkUrl:cover}];
 const local={id:'owned',title:'Song',artist:'Own Artist',album:'Record',duration:200} as Track;
 assert.equal(musicSearchCatalog('song',[local],[],[],[],hints).find(r=>r.kind==='track')?.artworkUrl,cover);
 assert.equal(musicSearchCatalog('song',[],[row(1,'Song','Own Artist','Record')],[],[],hints).find(r=>r.kind==='track')?.artworkUrl,cover);
 assert.equal(musicSearchCatalog('song',[local],[],[],[],[...hints,{...hints[0],id:5}]).find(r=>r.kind==='track')?.artworkUrl,undefined);
 assert.equal(musicSearchCatalog('song',[{...local,artist:'Other'}],[],[],[],hints).find(r=>r.kind==='track')?.artworkUrl,undefined);
});

test('downloaded collaboration credits use canonical display grouping without extra inferred albums',()=>{
 const cover='https://is1-ssl.mzstatic.com/own.jpg';
 const songs=[{releaseId:4,trackId:9,disc:1,position:1,title:'Song',artist:'Main & Guest',album:'Record',durationMs:200000,artworkUrl:cover}];
 const albums=[{id:4,title:'Record',artist:'Main',artworkUrl:cover}];
 const local={id:'owned',title:'Song',artist:'Main, Guest',album:'Record',duration:200} as Track;
 const original={...local};
 const out=musicSearchCatalog('record main',[local],[row(1,'Song','Main, Guest','Record')],[],[],albums,songs);
 assert.deepEqual(out.filter(r=>r.kind==='track').map(r=>({id:r.id,artist:r.artist,cover:r.artworkUrl})),[{id:'local:owned',artist:'Main, Guest',cover}]);
 assert.deepEqual(out.filter(r=>r.kind==='album').map(r=>r.id),['itunes:album:4']);
 assert.deepEqual(local,original);
 for(const artist of ['Guest, Main','Main, Another Guest','Main, Guest, Extra']){
  assert.equal(musicSearchCatalog('record',[{...local,artist}],[],[],[],albums,songs).filter(r=>r.kind==='track').length,2);
 }
 const foreign=[{...albums[0],id:5,artist:'Unrelated'}];
 assert.ok(musicSearchCatalog('record',[local],[],[],[],foreign,songs).some(r=>r.kind==='album'&&r.artist==='Main, Guest'));
});
