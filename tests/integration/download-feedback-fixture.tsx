import React from 'react';
import {createRoot} from 'react-dom/client';
import {MusicSearchPanel} from '../../src/ui/MusicSearchPanel';
import {AlbumPageController} from '../../src/ui/AlbumPageController';
import {SelectedSongActions} from '../../src/ui/SelectedSongActions';
import {AlbumDownloadNotice} from '../../src/ui/AlbumDownloadNotice';
import {albumCoordinator,notifyAlbumDownload} from '../../src/library/album-download';
import '../../src/style.css';
import '../../src/ui/shell.css';
import '../../src/ui/design-tokens.css';
import '../../src/ui/responsive-shell.css';
import '../../src/ui/app-polish.css';
const calls:string[]=[];let setView:(s:string)=>void,setProgress:(p:{bytes:number;total:number}|null)=>void;
function App(){
 const [view,viewSet]=React.useState('search'),[selected,choose]=React.useState<string|null>(null),[progress,progressSet]=React.useState<{bytes:number;total:number}|null>(null);setView=viewSet;setProgress=progressSet;
 const actions=selected?<SelectedSongActions title="Canción de prueba" artist="Artista" status="Preparando canción…" error={null} pending progress={progress} inLibrary={false} canAdd={false} canPlay={false} playlists={[]} canAddToPlaylist={false} onAdd={()=>{}} onPlay={()=>{}} onAddToPlaylist={()=>{}} onCancel={()=>calls.push('cancel')} current={()=>true}/>:null;
 return <main className="pulso-app"><AlbumDownloadNotice/>{view==='search'?<MusicSearchPanel query="Artista" onQueryChange={()=>{}} onSearch={()=>{}} suggestions={[{id:'one',kind:'track',title:'Canción de prueba',subtitle:'Artista',source:'local'},{id:'two',kind:'track',title:'Otra canción',subtitle:'Artista',source:'local'}]} selectedSuggestionId={selected} onChooseSuggestion={id=>choose(id)} suggestionsPending={false} resultsVisible primaryProvider={null} sessionReady={false} canSearch={false} searchPending={false} results={[]} selectedResultId={null} onSelectResult={()=>{}} uncertain={false} onCancel={()=>{}} songActions={actions} current={()=>true}/>:<AlbumPageController coordinator={albumCoordinator} title="Synthetic" artist="Artist" editionId={42} selectedKey={selected} scope="test" visible client={null} revision={undefined} provider={null} providers={[]} capture={()=>null} management={()=>null} onBack={()=>{}} onChoose={choice=>choose(choice.id)} songActions={actions}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
Object.assign(window,{feedbackUI:{calls,view:(v:string)=>setView(v),progress:(p:{bytes:number;total:number}|null)=>setProgress(p),downloads:()=>{albumCoordinator.running=true;albumCoordinator.active={scope:'test',editionId:42,key:'test',title:'Prueba',abort:new AbortController()};albumCoordinator.notice={title:'Álbum de prueba',titles:['Canción uno','Canción dos'],progress:{message:'Preparando la siguiente canción…',rows:[{state:'downloaded',trackId:'one',confirmed:true,message:'Guardada'},{state:'unattempted',trackId:null,confirmed:false,message:'En espera'}]}};notifyAlbumDownload(albumCoordinator);},aborted:()=>albumCoordinator.active?.abort.signal.aborted}});
