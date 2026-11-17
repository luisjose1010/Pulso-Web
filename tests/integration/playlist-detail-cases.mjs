import {installRequiredAccountFixture} from './required-account-fixture.mjs';
import assert from 'node:assert/strict';
import {webkit} from 'playwright-core';

export async function runPlaylistDetail({browser,origin,engine,check,report,run,temporary=run}){
 let context;
 try{
  // WebKit's ephemeral test context rejects Blob records in IndexedDB here.
  // A fresh persistent test profile exercises normal storage, without using a real profile.
  context=engine==='webkit'?await webkit.launchPersistentContext(`${temporary}/webkit-playlist-profile`,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block'}):await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});context.setDefaultTimeout(8000);
  report.playlistContexts??=[];report.playlistContexts.push({engine,persistentTestProfile:engine==='webkit',realProfile:false});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin||['blob:','data:'].includes(u.protocol))return route.continue();if(['https://itunes.apple.com','https://lrclib.net'].includes(u.origin))return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify(u.origin==='https://lrclib.net'?[]:{resultCount:0,results:[]})});report.external.push({engine,origin:u.origin});return route.abort();});
  await installRequiredAccountFixture(context,origin);
   await context.addInitScript(()=>{try{delete Navigator.prototype.serviceWorker}catch{};window.__audio=[];window.__playCalls=0;const A=window.Audio;window.Audio=class extends A{constructor(...args){super(...args);window.__audio.push(this)}play(){window.__playCalls++;return super.play()}};});
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push({engine,error:String(error)}));
  await page.goto(origin+'/tests/integration/collection-removal-final-main-fixture.html');await page.waitForFunction(()=>!!window.setupPlaylistDesignFixture);await page.evaluate(()=>window.setupPlaylistDesignFixture());await page.goto(origin);await page.locator('.shell-nav').waitFor();
  const nav=name=>page.locator('.shell-nav').getByRole('button',{name,exact:true}).click();
  const detail=page.locator('.library-detail');const back=()=>detail.getByRole('button',{name:/Volver a Biblioteca/}).click();
  const openList=async(name='Cuando baja el ruido')=>{await nav('Biblioteca');await page.locator('.library-grid button').filter({hasText:name}).click();await detail.getByRole('heading',{name,exact:true}).waitFor();};
  await check(`${engine}: playlist cover, actual duration, compact rows and secondary options`,async()=>{
   await openList();await page.waitForFunction(()=>[...document.querySelectorAll('.collection-header__art img')].filter(i=>i.naturalWidth>0).length===4);
   assert.equal(await detail.locator('.tracks>li').count(),4);await detail.getByText('4 canciones · 2 min',{exact:true}).waitFor();
   assert.equal(await detail.getByText('Filtros de canciones',{exact:true}).isVisible(),false);assert.equal(await detail.getByText('Editar playlist',{exact:true}).isVisible(),false);assert.equal(await detail.getByLabel('Playlist de destino').count(),4);
   const metrics=await detail.evaluate(el=>{const rect=s=>{const r=el.querySelector(s).getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,top:r.top,right:r.right}};return {cover:rect('.collection-header__art'),play:rect('.collection-play'),row:rect('.tracks>li'),art:rect('.collection-track-art'),menu:rect('.track-actions-trigger')};});
   assert.ok(metrics.cover.width>=180&&Math.abs(metrics.cover.width-metrics.cover.height)<1);assert.equal(metrics.play.width,64);assert.equal(metrics.play.height,64);assert.equal(metrics.art.width,48);assert.ok(metrics.row.height<105);assert.ok(metrics.menu.width>=44&&metrics.menu.height>=44);
   await page.waitForFunction(()=>[...document.querySelectorAll('.collection-track-art img')].length===4&&[...document.querySelectorAll('.collection-track-art img')].every(i=>i.complete&&i.naturalWidth>0));
   for(const img of await detail.locator('.collection-track-art img').all()){const box=await img.boundingBox();assert.equal(box.width,48);assert.equal(box.height,48);assert.equal(await img.evaluate(i=>getComputedStyle(i).objectFit),'cover');}
   await page.screenshot({path:`${run}/${engine}-playlist-detail.png`});report.playlistLayout??=[];report.playlistLayout.push({engine,...metrics});
  });
  await check(`${engine}: track menu does not move rows and supports touch, keyboard and dismissal`,async()=>{
   for(const [width,height,font]of [[390,664,100],[1366,768,100],[320,568,200]]){
    await page.setViewportSize({width,height});await page.evaluate(f=>document.documentElement.style.fontSize=f+'%',font);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const trigger=detail.locator('.track-actions-trigger').first();await trigger.scrollIntoViewIfNeeded();
    const before=await detail.locator('.tracks>li').first().boundingBox(),plays=await page.evaluate(()=>window.__playCalls);
    await trigger.click();const menu=page.locator('dialog.track-actions-menu[open]');await menu.waitFor();
    assert.equal(await detail.locator('.tracks>li').first().evaluate(e=>e.getBoundingClientRect().height),before.height);assert.equal(await page.evaluate(()=>window.__playCalls),plays);
    const g=await menu.evaluate(e=>({width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,bottom:e.getBoundingClientRect().bottom,scroll:e.scrollWidth,client:e.clientWidth,viewport:innerWidth,height:innerHeight}));assert.ok(g.scroll<=g.client+1&&g.right<=g.viewport&&g.bottom<=g.height,JSON.stringify(g));
    for(let i=0;i<14;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement?.closest('dialog.track-actions-menu[open]')));}
    await menu.getByRole('button',{name:'Cerrar opciones de canción'}).focus();await menu.locator('.track-actions-menu__content').evaluate(e=>e.scrollTop=0);await page.screenshot({path:`${run}/${engine}-track-menu-${width}-${font}.png`});await page.keyboard.press('Escape');assert.equal(await menu.count(),0);assert.equal(await trigger.evaluate(e=>document.activeElement===e),true);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
   }
   await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='100%');await detail.locator('.track-actions-trigger').first().click();await page.mouse.click(2,2);assert.equal(await page.locator('dialog.track-actions-menu[open]').count(),0);
   await detail.locator('.track-actions-trigger').first().click();await page.locator('dialog[open] .track-actions-info>summary').click();await page.getByRole('button',{name:'Revisar datos del archivo de Todo a su tiempo',exact:true}).click();assert.equal(await page.locator('dialog.track-actions-menu[open]').count(),0);await page.getByRole('heading',{name:'Revisar datos del archivo',exact:true}).waitFor();await page.getByRole('button',{name:'Cerrar revisión',exact:true}).click();await page.waitForFunction(()=>document.activeElement?.classList.contains('track-actions-trigger'));

  });
  await check(`${engine}: a new interaction retires pending playlist Play`,async()=>{
   await page.evaluate(()=>{document.addEventListener('click',event=>{if(event.target.closest('.collection-play'))window.dispatchEvent(new WheelEvent('wheel'));},{once:true});});
   await detail.getByRole('button',{name:'Reproducir playlist'}).click();await page.waitForFunction(()=>!document.querySelector('.collection-play').disabled);await page.waitForTimeout(200);
   assert.equal(await page.evaluate(()=>window.__playCalls),0);assert.equal(await page.evaluate(()=>window.__audio.length===1&&window.__audio[0].paused),true);
  });
  await check(`${engine}: playlist Play, pause and resume use the original audio`,async()=>{
   await detail.getByRole('button',{name:'Reproducir playlist'}).click();await page.waitForFunction(()=>window.__audio.length===1&&!window.__audio[0].paused&&window.__audio[0].currentTime>0);
   await detail.getByRole('button',{name:'Pausar playlist'}).click();assert.equal(await page.evaluate(()=>window.__audio[0].paused),true);
   const src=await page.evaluate(()=>window.__audio[0].currentSrc);await detail.getByRole('button',{name:'Reproducir playlist'}).click();await page.waitForFunction(()=>!window.__audio[0].paused);assert.equal(await page.evaluate(()=>window.__audio[0].currentSrc),src);
   await detail.getByRole('button',{name:'Reproducción aleatoria'}).click();assert.equal(await detail.getByRole('button',{name:'Reproducción aleatoria'}).getAttribute('aria-pressed'),'true');await detail.getByRole('button',{name:'Reproducción aleatoria'}).click();
  });
  await check(`${engine}: row options preserve reorder, playlist addition and the copied queue`,async()=>{
   const row=detail.locator('.tracks>li').first();await row.locator('.track-actions-trigger').click();await row.locator('.track-actions-playlist>summary').click();await row.getByLabel('Playlist de destino').selectOption({label:'Para después'});await row.getByRole('button',{name:'Añadir a playlist',exact:true}).click();
   await row.getByRole('button',{name:'Todas las opciones',exact:false}).click();await row.locator('.track-actions-order>summary').click();await row.getByRole('button',{name:/Bajar Todo a su tiempo/}).click();await page.waitForFunction(()=>document.querySelector('.collection-track-main strong')?.textContent==='Antes de salir');
   const moved=detail.locator('.tracks>li').nth(1);await moved.getByRole('button',{name:'Todas las opciones',exact:false}).click();await moved.getByRole('button',{name:'Quitar de playlist',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.library-detail .tracks>li').length===3);
   await page.locator('.mini-player').getByRole('button',{name:'Abrir reproductor desde minirreproductor'}).click();const player=page.locator('.player-surface');await player.getByRole('button',{name:'Cola',exact:true}).click();assert.equal(await player.locator('.player-queue ol>li').count(),4);await player.getByRole('button',{name:'Cerrar reproductor'}).click();
   assert.equal(await page.evaluate(()=>window.__audio.length===1&&!window.__audio[0].paused),true);
   await back();await page.locator('.library-grid button').filter({hasText:'Para después'}).click();await detail.locator('.collection-track-main').getByText('Todo a su tiempo',{exact:true}).waitFor();
  });
  await check(`${engine}: choosing a playlist row starts that occurrence and preserves the collection queue`,async()=>{
   await back();await page.locator('.library-grid button').filter({hasText:'Cuando baja el ruido'}).click();
   const rows=detail.locator('.collection-track-main'),label=await rows.nth(1).getAttribute('aria-label');
   const calls=await page.evaluate(()=>window.__playCalls),rowHeight=await rows.nth(1).evaluate(e=>e.closest('li').getBoundingClientRect().height);
   await page.evaluate(()=>{document.addEventListener('click',event=>{if(event.target.closest('.collection-track-main'))window.dispatchEvent(new WheelEvent('wheel'));},{once:true});});
   await rows.nth(1).click();await page.waitForFunction(()=>!document.querySelector('.collection-play').disabled);
   assert.equal(await page.evaluate(()=>window.__playCalls),calls);assert.equal(await page.evaluate(()=>window.__audio[0].paused),true);
   await rows.nth(1).click();await page.waitForFunction(()=>window.__audio.length===1&&!window.__audio[0].paused&&window.__audio[0].currentTime>0);
   assert.equal(await rows.nth(1).evaluate(e=>e.closest('li').getBoundingClientRect().height),rowHeight);const title=label.replace(/^Escuchar /,'');assert.equal(await page.locator('.mini-player__title').innerText(),title);
   const src=await page.evaluate(()=>window.__audio[0].currentSrc);await rows.nth(1).dblclick();assert.equal(await page.evaluate(()=>window.__audio[0].currentSrc),src);
   await page.locator('.mini-player__expand').click();await page.locator('.player-surface').getByRole('button',{name:'Cola',exact:true}).click();assert.equal(await page.locator('.player-queue ol>li').count(),3);await page.getByRole('button',{name:'Cerrar reproductor',exact:true}).click();
   await back();await page.locator('.library-grid button').filter({hasText:'Para después'}).click();
  });
  await check(`${engine}: selected song has no border and media artwork survives player collapse`,async()=>{
   await back();await openList();
   const rows=detail.locator('.collection-track-main');await rows.nth(0).click();
   await rows.nth(0).and(page.locator('[aria-current="true"]')).waitFor();
   await page.waitForFunction(()=>navigator.mediaSession?.metadata?.artwork.length===1);
   const first=await page.evaluate(()=>({title:navigator.mediaSession.metadata.title,src:navigator.mediaSession.metadata.artwork[0].src}));
   assert.equal(await rows.nth(0).evaluate(e=>getComputedStyle(e).outlineStyle),'none');
   assert.equal(await rows.nth(0).locator('strong').evaluate(e=>getComputedStyle(e).color),await rows.nth(0).locator('.playback-indicator').evaluate(e=>getComputedStyle(e).color));
   assert.ok(await page.evaluate(async src=>{const img=new Image();img.src=src;await img.decode();return img.naturalWidth>0;},first.src));
   await page.locator('.mini-player__expand').click();await page.getByRole('button',{name:'Cerrar reproductor',exact:true}).click();
   assert.equal(await page.evaluate(()=>navigator.mediaSession.metadata.artwork[0].src),first.src);
   await rows.nth(1).click();await page.waitForFunction(old=>navigator.mediaSession.metadata?.artwork[0]?.src&&navigator.mediaSession.metadata.artwork[0].src!==old,first.src);
   assert.equal(await page.evaluate(()=>navigator.mediaSession.metadata.title),await rows.nth(1).locator('strong').innerText());
   await page.screenshot({path:`${run}/${engine}-selected-song-no-border.png`});
   await page.evaluate(()=>window.__audio[0].dispatchEvent(new Event('waiting')));
   await rows.nth(1).locator('..').getByRole('progressbar').waitFor();assert.equal(await detail.locator('.collection-track-loading').count(),1);
   await page.evaluate(()=>window.__audio[0].dispatchEvent(new Event('playing')));await detail.locator('.collection-track-loading').waitFor({state:'hidden'});
   await back();await openList('Para después');
  });
  await check(`${engine}: playlist rename persists and empty/favorites covers are honest`,async()=>{
   await detail.locator('.collection-tools>summary').click();await detail.getByText('Editar playlist',{exact:true}).click();await detail.getByLabel('Nombre de playlist').fill('Para otro momento');await detail.getByRole('button',{name:'Renombrar',exact:true}).click();await detail.getByRole('heading',{name:'Para otro momento',exact:true}).waitFor();await page.reload();await openList('Para otro momento');await back();
   await page.locator('.create-playlist>summary').click();await page.getByLabel('Nueva playlist').fill('Vacía');await page.getByRole('button',{name:'Crear playlist',exact:true}).click();await page.locator('.library-grid button').filter({hasText:'Vacía'}).click();assert.equal(await detail.getByRole('button',{name:'Reproducir playlist'}).isDisabled(),true);await detail.getByText('Esta colección todavía no tiene canciones.',{exact:true}).waitFor();assert.equal(await detail.locator('.collection-header__art img').count(),0);
   await back();await page.locator('.library-grid button').filter({hasText:'Favoritos'}).click();assert.equal(await detail.locator('.collection-cover--favorites').count(),1);assert.equal(await detail.locator('.collection-cover--favorites img').count(),0);assert.equal(await detail.getByText('Editar playlist',{exact:true}).count(),0);
  });
  await check(`${engine}: playlist layouts at phone, landscape, desktop and text 200%`,async()=>{
   await back();await page.locator('.library-grid button').filter({hasText:'Cuando baja el ruido'}).click();
   for(const [width,height,font] of [[320,568,100],[390,664,100],[844,390,100],[1366,768,100],[320,568,200],[1366,768,200]]){
    await page.setViewportSize({width,height});await page.evaluate(font=>document.documentElement.style.fontSize=font+'%',font);const g=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:document.documentElement.clientWidth}));assert.ok(g.scroll<=g.width,JSON.stringify({width,height,font,...g}));
    for(const selector of ['.collection-play','.track-actions-trigger'])for(const item of await page.locator(selector).all()){const box=await item.boundingBox();assert.ok(box.width>=44&&box.height>=44,JSON.stringify(box));}
   }
   await page.setViewportSize({width:390,height:664});await page.evaluate(()=>{document.documentElement.style.fontSize='100%';document.documentElement.dataset.theme='dark'});await page.screenshot({path:`${run}/${engine}-playlist-dark.png`,fullPage:true});
  });
 }finally{await context?.close();}
}
