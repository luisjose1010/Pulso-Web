import {createServer} from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from './chromium-launch.mjs';

const cases = {
  'metadata-rescan': ['metadata-rescan.html','pulsoMetadataRescan'],
  'album-source': ['album-source.html','pulsoAlbumSource'],
  // R57 isolated fixture entry. All LRCLIB requests are fulfilled locally; no API traffic.
  lrclib: ['lrclib.html', 'pulsoLrclib', async context => {
    let mode='normal',requests=0,blocked=0,unsafeHeaders=0,redirectTargets=0;
    await context.addCookies([{name:'r57synthetic',value:'must-not-send',domain:'lrclib.net',path:'/',secure:true,sameSite:'None'}]);
    const modes=new Set(['normal','plain','instrumental','not-found','conflict','bad-mime','bad-json','oversize','429','503','redirect','hold','network']);
    await context.exposeBinding('lrclibFixture',(_,next)=>{
      if(!modes.has(next))throw new Error('Invalid fixture');mode=next;
      return {requests,blocked,unsafeHeaders,redirectTargets};
    });
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin==='https://lrclib.net'&&url.pathname==='/api/get'){
        requests++;const headers=request.headers();
        if(headers.cookie||headers.authorization||headers.referer||request.method()!=='GET')unsafeHeaders++;
        const fixtureMode=mode;
        if(fixtureMode==='hold')await new Promise(done=>setTimeout(done,80));
        if(fixtureMode==='network'){await route.abort('failed');return;}
        const record={id:57,trackName:'Órbita (Live)',artistName:'Taller Δ',albumName:'Luz',duration:120,instrumental:false,plainLyrics:'Texto propio <img src=x onerror="globalThis.pwned=true">',syncedLyrics:'[00:01.00]Luz sintética'};
        if(fixtureMode==='plain')record.syncedLyrics=null;
        if(fixtureMode==='conflict')record.trackName='Órbita (Remix)';
        if(fixtureMode==='instrumental'){record.instrumental=true;record.plainLyrics=null;record.syncedLyrics=null;}
        let status=200,body=JSON.stringify(record),responseHeaders={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Retry-After'};
        if(fixtureMode==='not-found'){status=404;body='edge';}
        if(fixtureMode==='bad-mime')responseHeaders['Content-Type']='text/html';
        if(fixtureMode==='bad-json')body='{';
        if(fixtureMode==='oversize')body=' '.repeat(524289);
        if(fixtureMode==='429'||fixtureMode==='503'){status=Number(fixtureMode);body='edge';responseHeaders['Retry-After']='12';}
        if(fixtureMode==='redirect'){status=302;responseHeaders.Location='https://redirect.invalid/never';body='';}
        try{await route.fulfill({status,headers:responseHeaders,body});}catch{ /* request already aborted */ }
        return;
      }
      if(url.origin==='https://redirect.invalid')redirectTargets++;
      if(url.hostname==='127.0.0.1'){await route.continue();return;}
      blocked++;await route.abort('blockedbyclient');
    });
  }],
  organization: ['organization.html', 'pulsoOrganization'],
  'restored-tracks': ['restored-tracks.html', 'pulsoRestoredTracks'],
  lyrics: ['lyrics.html', 'pulsoLyrics'],
  'embedded-lyrics': ['embedded-lyrics.html', 'pulsoEmbeddedLyrics'],
  'local-batches': ['local-batches.html', 'pulsoLocalBatches'],
  artwork: ['artwork.html', 'pulsoArtwork'],
  'artwork-containers': ['artwork-containers.html', 'pulsoArtworkContainers'],
  'blob-opfs': ['blob.html?backend=opfs', 'pulsoBlob'],
  opfs: ['opfs.html', 'pulsoOpfs'],
  library: ['library.html', 'pulsoLibrary'],
  blob: ['blob.html', 'pulsoBlob'],
  storage: ['index.html', 'pulsoTests'],
  sdk: ['sdk.html', 'pulsoSdk'],
};
const mime = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.wasm':'application/wasm', '.mp3':'audio/mpeg', '.m4a':'audio/mp4', '.wav':'audio/wav', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png'};
const selected = process.argv.slice(2);
let server, browser;
const report = {passed: false, environment:'Chromium Linux headless with sandbox; ephemeral loopback; no iPhone evidence', cases: []};
try {
  if (selected.some(name => !Object.hasOwn(cases, name)) || new Set(selected).size !== selected.length) throw new Error('Argumentos válidos: library blob blob-opfs storage sdk opfs artwork artwork-containers local-batches lyrics embedded-lyrics restored-tracks organization lrclib (sin duplicados)');
  const root = await realpath(resolve(selected.length===1&&selected[0]==='metadata-rescan'?'.local/metadata-rescan-r71/build':selected.length===1&&selected[0]==='album-source'?'.local/album-source-r66/build':selected.length===1&&selected[0]==='lrclib'?'.local/lrclib-r57/build':'.local/browser-tests'));
  server = createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
      const pathname = decodeURIComponent((req.url ?? '').split('?')[0]);
      if (!pathname.startsWith('/') || pathname.split('/').some(part => part === '..' || part === '.') || pathname.includes('\\') || pathname.includes('\0')) throw new Error('invalid path');
      const file = await realpath(resolve(root, `.${pathname}`));
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error('not a file');
      const data = await readFile(file);
      res.writeHead(200, {'Content-Type': mime[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': data.length, 'X-Content-Type-Options': 'nosniff'});
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  browser = await chromium.launch(chromiumLaunchOptions());
  report.browserVersion = browser.version();
  for (const name of selected.length ? selected : Object.keys(cases)) {
    const [pageName, globalName] = cases[name];
    const entry = {name, passed: false, pageErrors: 0};
    report.cases.push(entry);
    let context;
    try {
      context = await browser.newContext(name==='lrclib'?{serviceWorkers:'block'}:{});
      if(name==='lrclib')await cases.lrclib[2](context);
      if(name==='album-source'||name==='metadata-rescan'){entry.externalRequests=0;await context.route('**/*',async route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')await route.continue();else{entry.externalRequests++;await route.abort('blockedbyclient');}});}
      const page = await context.newPage();
      page.on('pageerror', () => { entry.pageErrors++; });
      const response = await page.goto(`http://127.0.0.1:${server.address().port}/tests/browser/${pageName}`, {waitUntil: 'load', timeout: 30000});
      if (!response?.ok()) throw new Error('HTTP');
      await page.waitForFunction(key => window[key] !== undefined, globalName, {timeout: 30000});
      const result = await page.evaluate(key => window[key], globalName);
      entry.passed = result?.passed === true && entry.pageErrors === 0;
      if(name==='blob-opfs'&&result?.backend!=='opfs')entry.passed=false;
      if(name==='blob'&&result?.backend!=='idb')entry.passed=false;
      if (result?.backend) entry.backend = result.backend;
      if (Array.isArray(result?.results)) entry.results = result.results;
      if (Array.isArray(result?.checks)) entry.checks = result.checks;
      if(name==='metadata-rescan'){if(Array.isArray(result?.rawErrors))entry.rawErrors=result.rawErrors;if(Array.isArray(result?.workerStats))entry.workerStats=result.workerStats;}
    } catch (error) {
      entry.error = error?.name === 'TimeoutError' ? 'timeout' : 'execution error';
    } finally {
      if (context) await context.close();
    }
    if (entry.pageErrors||entry.externalRequests) entry.passed = false;
  }
  report.passed = report.cases.length > 0 && report.cases.every(entry => entry.passed);
} catch (error) {
  report.error = error?.message?.startsWith('Argumentos válidos:') ? error.message : 'No se pudo iniciar el runner o falta el build compilado';
} finally {
  try { if (browser) await browser.close(); } catch { report.passed = false; report.cleanupError = true; }
  try { if (server?.listening) await new Promise((done, reject) => server.close(error => error ? reject(error) : done())); } catch { report.passed = false; report.cleanupError = true; }
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
}
