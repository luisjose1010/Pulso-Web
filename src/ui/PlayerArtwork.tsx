import {useEffect,useRef,useState} from 'react';
import type {Activity} from '../playback/ownership';
import {readSongArtworkIdentity} from '../library/selected-song';
import {readRecord} from '../storage/database';
import type {Track} from '../library/library';
import {readArtwork} from '../library/artwork';
import {PlayerArtworkProvider} from '../library/player-artwork-provider';
import './artwork.css';

const provider=new PlayerArtworkProvider((...args)=>fetch(...args));
export interface PlayerArtworkProps {
 activity:Activity; trackId:string; title:string; artist:string|null; album:string|null;
 durationSeconds:number|null; scopeKey:string; enabled:boolean; current:()=>boolean;
 refreshToken:number; onArtwork?:(image:MediaImage|null,previousUrl?:string)=>void; onAlbum?:(album:string|null)=>void;
}
type View={key:string;current:()=>boolean;url:string|null};
export function PlayerArtwork({activity,trackId,title,artist,album,durationSeconds,scopeKey,enabled,current,refreshToken,onAlbum,onArtwork}:PlayerArtworkProps){
 const [view,setView]=useState<View|null>(null);const currentRef=useRef(current);currentRef.current=current;
 const artworkRef=useRef(onArtwork);artworkRef.current=onArtwork;
 const albumRef=useRef(onAlbum);albumRef.current=onAlbum;
 const key=JSON.stringify([trackId,title,artist,album,durationSeconds,scopeKey,enabled,refreshToken]);
 useEffect(()=>{
  const scope=activity.scope(),controller=new AbortController();let objectUrl:string|null=null, cancelled=false;
  const active=()=>{try{return !cancelled&&!controller.signal.aborted&&scope()&&currentRef.current();}catch{return false;}};
  const revoke=()=>{if(objectUrl){artworkRef.current?.(null,objectUrl);URL.revokeObjectURL(objectUrl);objectUrl=null;}};
  const publish=(blob:Blob)=>{if(!active())return;objectUrl=URL.createObjectURL(blob);if(active()){setView({key,current:active,url:objectUrl});artworkRef.current?.({src:objectUrl,type:blob.type});}else revoke();};
  if(!enabled||!active())return ()=>{cancelled=true;controller.abort();revoke();};
  const operation=activity.begin();
  let ended=false;
  const end=()=>{if(operation&&!ended){ended=true;operation.end();}};
  if(operation)void (async()=>{
   try{
    const local=await readArtwork(trackId);if(!active()||!operation.current())return;
    if(local.state==='ready'){publish(local.blob);return;}
    if(local.state==='absent'&&local.manual)return;
    if(local.state==='unavailable'||'manual' in local&&local.manual)return;
    const track=await readRecord<Track>('tracks',trackId);if(!active()||!operation.current())return;
    const identity=track?await readSongArtworkIdentity(track,active):null;if(!active()||!operation.current())return;
    if(!identity&&(!artist||durationSeconds===null))return;
    // Passive network metadata must not hold the library's mutation admission.
    end();
    const result=await provider.load(identity??{title,artist:artist!,album,durationSeconds:durationSeconds!},{signal:controller.signal,current:active});
    if(!result||!active())return;
    // Recheck local state after network and decode so a new manual edit wins.
    const latest=await readArtwork(trackId);if(!active()||latest.state==='ready'||latest.state==='unavailable'||'manual' in latest&&latest.manual)return;
    publish(result.blob);if(active())albumRef.current?.(result.album);
   }catch{/* Optional artwork must never block playback. */}finally{end();}
  })();
  return ()=>{cancelled=true;controller.abort();revoke();};
 },[activity,key]);
 const visible=enabled&&view?.key===key&&view.current()?view:null;
 return <div className="artwork-panel">{visible?.url?<img className="artwork-image" src={visible.url} alt={`Portada de ${title}`} onError={()=>setView(null)}/>:<div aria-hidden="true" className="artwork-placeholder">♪</div>}</div>;
}
