import {spotifyPlaylist} from './spotify-playlist.mjs';
import {DurableObject} from 'cloudflare:workers';
import {accountAuth} from './accounts.mjs';
import {accountProfile} from './account-profile.mjs';
import {accountLibrary} from './account-library.mjs';
import {createMusicBrainzRelay} from './musicbrainz-relay.mjs';
import {CatalogRelay,RelayError} from './relay.mjs';
import {decodeTelegramApiIdentity} from '../../src/telegram/api-identity.ts';
import {shellAssetRequest} from './navigation.mjs';
const base="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const documentPolicy=base.replace("connect-src 'self';","connect-src 'self' https://lrclib.net https://itunes.apple.com https://is1-ssl.mzstatic.com https://is2-ssl.mzstatic.com https://is3-ssl.mzstatic.com https://is4-ssl.mzstatic.com https://is5-ssl.mzstatic.com;");
const sdkPolicy="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' wss://pluto.web.telegram.org wss://venus.web.telegram.org wss://aurora.web.telegram.org wss://vesta.web.telegram.org wss://flora.web.telegram.org; object-src 'none'; base-uri 'none'";
function response(body,status=200,mime='application/json',retry=null){const headers={'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':base};if(retry)headers['Retry-After']=retry;return new Response(body,{status,headers});}
// A single SQLite-backed object coordinates the upstream quota across locations.
// Only last-request/cooldown timestamps persist; query results stay in bounded RAM.
export class CatalogCoordinator extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.ready=ctx.blockConcurrencyWhile(async()=>{const initial=await ctx.storage.get('quota')??{};this.relay=new CatalogRelay({initial,checkpoint:quota=>ctx.storage.put('quota',quota)});const secondary=await ctx.storage.get('quota-musicbrainz')??{};this.musicbrainz=createMusicBrainzRelay({initial:secondary,checkpoint:quota=>ctx.storage.put('quota-musicbrainz',quota)});});}
 async fetch(request){await this.ready;const url=new URL(request.url);try{const value=await (url.pathname.startsWith('/catalog/musicbrainz/')?this.musicbrainz:this.relay).get(url.pathname,url.search);return response(value.body,200,value.mime);}catch(e){return response('{}',e instanceof RelayError?e.status:502,'application/json',e instanceof RelayError?e.retryAfter:null);}}
}
export default {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/account-config.json'||path.startsWith('/api/account-auth/'))return accountAuth(request,env);
  if(path.startsWith('/api/spotify-playlist/'))return spotifyPlaylist(request);
  if(path==='/api/account-profile')return accountProfile(request,env);
  if(path==='/api/account-library')return accountLibrary(request,env);
  if(!['GET','HEAD'].includes(request.method))return response('{}',405);
  // Public iTunes metadata works from the browser; this edge egress is rate-limited.
  // Keep the bounded image relay and older metadata endpoints for existing tabs.
  if(path==='/catalog-config.json')return response(request.method==='HEAD'?null:JSON.stringify({version:1,itunes:false,artwork:!!env.CATALOG,musicbrainz:!!env.CATALOG}));
  if(path==='/telegram-config.json'){
   const config=decodeTelegramApiIdentity(env.TELEGRAM_API_IDENTITY);if(!config)return response('{}',503);
   return response(request.method==='HEAD'?null:JSON.stringify({api_id:config.apiId,api_hash:config.apiHash}));
  }
  if(path.startsWith('/catalog/')){
   if(request.method!=='GET')return response('{}',405);
   const origin=request.headers.get('Origin');if(origin&&origin!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return response('{}',403);
   if(!env.CATALOG)return response('{}',503);
   // Never forward cookies, authorization, referrer or visitor headers upstream.
   return env.CATALOG.get(env.CATALOG.idFromName('public-catalog-v1')).fetch(new Request('https://catalog.internal'+path+url.search));
  }
  if(path.split('/').some(p=>p.startsWith('.'))||/[\\\x00]/.test(path))return response('{}',404);
  const asset=await env.ASSETS.fetch(shellAssetRequest(request)),headers=new Headers(asset.headers);
  headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');
  headers.set('Content-Security-Policy',/\/session\.worker-[^/]+\.js$/.test(path)?sdkPolicy:(asset.headers.get('content-type')??'').startsWith('text/html')?documentPolicy:base);
  if((asset.headers.get('content-type')??'').startsWith('text/html'))headers.set('Cache-Control','no-store');
  if(path==='/sw.js'){headers.set('Cache-Control','no-cache');headers.set('Service-Worker-Allowed','/');}
  return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
 }
};
