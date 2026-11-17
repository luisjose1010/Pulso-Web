import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {SpotifyPlaylistExport} from '../../src/ui/SpotifyPlaylistExport';
import '../../src/ui/settings-layout.css';
function Fixture(){const [open,setOpen]=useState(true);return <><audio controls loop/><button onClick={()=>setOpen(!open)}>Alternar configuración</button>{open&&<SpotifyPlaylistExport/>}</>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
