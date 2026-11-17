import test from 'node:test';
import assert from 'node:assert/strict';
import {songChoiceKey} from '../../src/library/selected-song';
import {albumTrackChoice} from '../../src/library/album-acquisition';
import {musicSearchCatalog} from '../../src/library/music-search-catalog';

test('iTunes occurrence keys require four positive safe integers and preserve metadata',()=>{
 const choice=albumTrackChoice({releaseId:4,trackId:9,disc:2,position:3,title:'Canción',artist:'Artista, Invitado',primaryArtist:'Artista',durationMs:200000},'Álbum');
 assert.equal(choice.artist,'Artista, Invitado');assert.equal(choice.searchArtist,'Artista');assert.ok(songChoiceKey(choice));
 for(const id of ['itunes:4:2:3:0','itunes:4:2:3:9007199254740992','itunes:4:2:3','itunes:04:2:3:9','itunes:4:2:3:9:1'])assert.equal(songChoiceKey({...choice,id}),null);
 assert.notEqual(songChoiceKey(choice),songChoiceKey({...choice,id:'itunes:4:2:4:9'}));
});
test('album matching permits title plus performer but rejects unrelated query words',()=>{
 const rows=[{id:1,trackName:'Primera',artistName:'Artista Propio',albumName:'Noche Azul',duration:120}];
 assert.equal(musicSearchCatalog('noche azul artista propio',[],rows).filter(x=>x.kind==='album').length,0);
 assert.equal(musicSearchCatalog('noche azul desconocido',[],rows).filter(x=>x.kind==='album').length,0);
 assert.equal(musicSearchCatalog('noche azul artista propio',[],[],[{id:9,title:'Noche Azul',artist:'Artista Propio',trackCount:2,releaseDate:null}]).filter(x=>x.kind==='album').length,1);
});
