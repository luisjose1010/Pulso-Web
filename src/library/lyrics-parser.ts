import {formatStorageMB} from './storage-format';
/** Local, explicit format only. All returned strings are inert text, never HTML. */
export const LYRICS_LIMITS=Object.freeze({bytes:131072,lines:4000,lineCharacters:8192,cues:4000,timestampsPerLine:16,timeMs:86400000,offsetMs:600000});
export type LyricsFormat='plain'|'lrc';
export type LyricsCue={timeMs:number;text:string};
export type ParsedLyrics={kind:'absent'}|{kind:'plain';text:string}|{kind:'timed';text:string;cues:{timeMs:number;text:string}[];offsetMs:number;representation?:'sylt'};
export type LyricsFailure='size'|'lines'|'line-size'|'unicode'|'format'|'timestamp'|'offset'|'cues'|'track'|'conflict'|'corrupt'|'storage'|'quota'|'locks';
const messages:Record<LyricsFailure,string>={size:`Reduce las letras a ${formatStorageMB(128*1024)}.`,lines:'Reduce las letras a 4000 líneas.', 'line-size':'Reduce cada línea a 8192 caracteres.',unicode:'Corrige el texto Unicode o los caracteres de control.',format:'Elige texto o LRC con marcas completas [mm:ss.xxx].',timestamp:'Corrige las marcas: segundos 00–59 y tiempos entre 0 y 24 horas.',offset:'Usa un único offset entero entre -600000 y 600000 ms.',cues:'Reduce a 4000 marcas y 16 marcas por línea.',track:'Selecciona una pista local existente.',conflict:'Las letras cambiaron. Vuelve a leer antes de guardar.',corrupt:'El registro de letras está dañado; vuelve a leer para repararlo explícitamente.',storage:'No se pudo acceder a las letras. Reabre y vuelve a intentar.',quota:'No hay espacio para guardar las letras. Libera espacio y reintenta.',locks:'Este navegador no permite coordinar la escritura de letras.'};
export class LyricsError extends Error{constructor(public readonly code:LyricsFailure,options?:ErrorOptions){super(messages[code],options);this.name='LyricsError';}}
export function parseLyrics(input:string,format:LyricsFormat):ParsedLyrics{
 if(format!=='plain'&&format!=='lrc')throw new LyricsError('format');
 if(typeof input!=='string')throw new LyricsError('format');
 // Bound work before encoding, splitting, regex or timestamp parsing.
 if(input.length>LYRICS_LIMITS.bytes||new TextEncoder().encode(input).length>LYRICS_LIMITS.bytes)throw new LyricsError('size');
 for(let i=0;i<input.length;i++){const c=input.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const n=input.charCodeAt(++i);if(!(n>=0xdc00&&n<=0xdfff))throw new LyricsError('unicode');}else if(c>=0xdc00&&c<=0xdfff||c<32&&c!==9&&c!==10&&c!==13||c===127)throw new LyricsError('unicode');}
 const text=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');const lines=text.split('\n');
 if(lines.length>LYRICS_LIMITS.lines)throw new LyricsError('lines');
 if(lines.some(l=>l.length>LYRICS_LIMITS.lineCharacters))throw new LyricsError('line-size');
 if(!text.trim())return {kind:'absent'};
 if(format==='plain')return {kind:'plain',text};
 let offsetMs=0,hasOffset=false;const cues:{timeMs:number;text:string}[]=[];
 for(const line of lines){
  if(!line.trim())continue;
  if(line.startsWith('[offset:')){if(hasOffset||!/^\[offset:[+-]?\d{1,6}\]$/.test(line))throw new LyricsError('offset');offsetMs=Number(line.slice(8,-1));if(Math.abs(offsetMs)>LYRICS_LIMITS.offsetMs)throw new LyricsError('offset');hasOffset=true;continue;}
  if(/^\[(ar|ti|al|by|re|ve):[^\]\n]*\]$/.test(line))continue;
  let rest=line;const times:number[]=[];
  while(rest.startsWith('[')){
   const m=/^\[(\d{1,4}):(\d{2})(?:[.:](\d{1,3}))?\]/.exec(rest);
   if(!m){if(!times.length||/^\[\d/.test(rest))throw new LyricsError('timestamp');break;}
   const time=Number(m[1])*60000+Number(m[2])*1000+Number((m[3]??'').padEnd(3,'0'));
   if(Number(m[2])>59||time>LYRICS_LIMITS.timeMs)throw new LyricsError('timestamp');
   times.push(time);if(times.length>LYRICS_LIMITS.timestampsPerLine||cues.length+times.length>LYRICS_LIMITS.cues)throw new LyricsError('cues');rest=rest.slice(m[0].length);
  }
  if(!times.length)throw new LyricsError('format');
  for(const timeMs of times)cues.push({timeMs,text:rest});
 }
 if(!cues.length)throw new LyricsError('format');
 for(const cue of cues){cue.timeMs+=offsetMs;if(cue.timeMs<0||cue.timeMs>LYRICS_LIMITS.timeMs)throw new LyricsError('timestamp');}
 cues.sort((a,b)=>a.timeMs-b.timeMs);return {kind:'timed',text,cues,offsetMs};
}

/** SYLT event text is data, never LRC syntax. Validate before IDB/locks; retain order,
 * duplicates, Unicode and literal brackets exactly. No sorting or normalization. */
export function parseSyltEvents(input:unknown):Extract<ParsedLyrics,{kind:'timed'}>{
 if(!Array.isArray(input)||input.length===0||input.length>LYRICS_LIMITS.cues)throw new LyricsError('cues');
 let indices=0;for(const key in input){if(!Object.prototype.hasOwnProperty.call(input,key))continue;if(++indices>input.length||! /^(0|[1-9][0-9]{0,3})$/.test(key)||Number(key)>=input.length)throw new LyricsError('format');}
 if(indices!==input.length)throw new LyricsError('format');
 const cues:LyricsCue[]=[];let previous=-1,bytes=0;
 for(let i=0;i<input.length;i++){
  const cue=input[i] as LyricsCue;
  if(!cue||Object.getPrototypeOf(cue)!==Object.prototype)throw new LyricsError('format');
  let keys=0;for(const key in cue){if(!Object.prototype.hasOwnProperty.call(cue,key))continue;if(++keys>2||(key!=='timeMs'&&key!=='text'))throw new LyricsError('format');}
  if(keys!==2||!Number.isInteger(cue.timeMs)||cue.timeMs<0||cue.timeMs<previous||cue.timeMs>LYRICS_LIMITS.timeMs)throw new LyricsError('timestamp');
  if(typeof cue.text!=='string'||cue.text.length>LYRICS_LIMITS.lineCharacters||/[\r\n]/.test(cue.text))throw new LyricsError('line-size');
  // Plain validation checks Unicode/control characters without interpreting brackets.
  parseLyrics(cue.text,'plain');bytes+=new TextEncoder().encode(cue.text).length+(i?1:0);
  if(bytes>LYRICS_LIMITS.bytes)throw new LyricsError('size');
  previous=cue.timeMs;cues.push({timeMs:cue.timeMs,text:cue.text});
 }
 return {kind:'timed',text:cues.map(c=>c.text).join('\n'),cues,offsetMs:0,representation:'sylt'};
}
/** Explicit manual draft: saving a structured SYLT as plain text removes timing. */
export function lyricsDraft(lyrics:Exclude<ParsedLyrics,{kind:'absent'}>):{text:string;format:LyricsFormat;warning?:string}{
 if(lyrics.kind==='timed'&&lyrics.representation==='sylt')return {text:lyrics.text,format:'plain',warning:'Borrador sin sincronización de la letra SYLT. Guardar como texto conserva las palabras y retira la sincronización.'};
 return {text:lyrics.text,format:lyrics.kind==='timed'?'lrc':'plain'};
}
