import React from 'react';
import {createRoot} from 'react-dom/client';
import {Player} from '../../src/playback/player';
import {PlayerLyricsPreview,PlayerLyricsReader,type PlayerLyricsResult} from '../../src/ui/PlayerLyrics';
import {PlaybackProgress} from '../../src/ui/PlaybackProgress';
import '../../src/ui/design-tokens.css';

const audio=new Audio();audio.crossOrigin='anonymous';
const player=new Player(audio);player.setQueue([{id:'own-entry',trackId:'own-track',title:'Tonos propios',src:new URL('/verse-tones.mp3',location.href).href}]);player.select(0);
const result:PlayerLyricsResult={state:'ready',revision:'own-fixture-revision',lyrics:{kind:'timed',text:'[00:00]Inicio propio\n[00:05]Segundo tono\n[00:09]Tercer tono',offsetMs:0,cues:[{timeMs:0,text:'Inicio propio'},{timeMs:5000,text:'Segundo tono'},{timeMs:9000,text:'Tercer tono'}]}};
const plain:PlayerLyricsResult={state:'ready',revision:'own-fixture-revision',lyrics:{kind:'plain',text:'Texto propio sin tiempos'}};
let context:AudioContext|null=null,analyser:AnalyserNode|null=null,source:MediaElementAudioSourceNode|null=null;
function prepareAnalysis(){if(!context){context=new AudioContext();source=context.createMediaElementSource(audio);analyser=context.createAnalyser();analyser.fftSize=8192;source.connect(analyser);analyser.connect(context.destination);}void context.resume();}
const onSeek=(seconds:number)=>{prepareAnalysis();void player.play(seconds);};
function peak(){if(!context||!analyser)return 0;const data=new Float32Array(analyser.frequencyBinCount);analyser.getFloatFrequencyData(data);let index=1;for(let i=2;i<data.length;i++)if(data[i]>data[index])index=i;return index*context.sampleRate/analyser.fftSize;}
const events:{event:string;time:number;paused:boolean}[]=[];for(const event of ['seeked','playing','ended'])audio.addEventListener(event,()=>events.push({event,time:audio.currentTime,paused:audio.paused}));
Object.assign(window,{versePlayback:{audio,player,peak,events}});
function App(){const [,render]=React.useReducer(n=>n+1,0);React.useEffect(()=>player.subscribe(c=>{if(c==='state')render();}),[]);return <main className="pulso-app"><h1>Prueba de versos y audio propio</h1><PlaybackProgress subscribe={player.subscribe}>{()=> <><output>{audio.currentTime.toFixed(2)}</output><section aria-label="Vista previa"><PlayerLyricsPreview result={result} loading={false} timeSeconds={audio.currentTime} canSeek durationSeconds={audio.duration} onSeek={onSeek}/></section><section aria-label="Letra completa"><PlayerLyricsReader result={result} loading={false} error={false} timeSeconds={audio.currentTime} canSeek durationSeconds={audio.duration} onSeek={onSeek} onRetry={()=>{}}/></section><section aria-label="Texto sin tiempos"><PlayerLyricsReader result={plain} loading={false} error={false} timeSeconds={audio.currentTime} canSeek durationSeconds={audio.duration} onSeek={onSeek} onRetry={()=>{}}/></section></>}</PlaybackProgress><button onClick={()=>player.pause()}>Pausar</button></main>;}
createRoot(document.getElementById('root')!).render(<App/>);
