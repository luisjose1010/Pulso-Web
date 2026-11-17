import assert from 'node:assert/strict';
/** Own IDB audio already seeded by the interface harness; only account HTTP is
 * TESTONLY. No real Neon user, Telegram authority or shared profile is used. */
export async function runAccountContinuity({page,context,origin,engine,check,run}){
 await check(`${engine}: required account logout pauses audio and re-login preserves the local library`,async()=>{
  let authenticated=true,signIns=0,signOuts=0;
  const user={id:'11111111-1111-4111-8111-111111111111',name:'Persona de prueba',email:'fixture@example.test',emailVerified:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const session={id:'TESTONLY-session',token:'TESTONLY',userId:user.id,expiresAt:new Date(Date.now()+86400000).toISOString(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const config=route=>route.fulfill({json:{version:1,enabled:true,google:false}});
  const auth=async route=>{const op=new URL(route.request().url()).pathname.split('/api/account-auth/')[1];
   if(op==='get-session')return route.fulfill({json:authenticated?{user,session}:null});
   if(op==='sign-in/email'){signIns++;authenticated=true;return route.fulfill({json:{redirect:false,token:'TESTONLY',user}});}
   if(op==='sign-out'){signOuts++;authenticated=false;return route.fulfill({json:{success:true}});}
   return route.fulfill({status:400,json:{code:'TESTONLY_UNEXPECTED_OPERATION'}});
  };
  await context.route(origin+'/account-config.json',config);await context.route(origin+'/api/account-auth/**',auth);
  const inventory=()=>page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pulso-web-local-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return JSON.stringify(await Promise.all(['tracks','assets','chunks','playlists'].map(name=>new Promise((resolve,reject)=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);}))))}finally{db.close();}});
  const before=await inventory();
  try{
   const play=page.locator('.mini-player').getByRole('button',{name:'Reproducir desde minirreproductor',exact:true});if(await play.isVisible())await play.click();
   await page.waitForFunction(()=>window.__audio.length===1&&!window.__audio[0].paused&&window.__audio[0].currentTime>0);
   const initial=await page.evaluate(()=>{window.__authContinuityAudio=window.__audio[0];return {src:window.__audio[0].src,time:window.__audio[0].currentTime};});
   await page.locator('.account-access-button').click();const dialog=page.getByRole('dialog');
   await dialog.locator('.account-dialog__profile').waitFor();
   await dialog.getByRole('button',{name:'Cerrar sesión de Pulso'}).click();await page.locator('.account-required').waitFor();assert.equal(signOuts,1);
   assert.equal(await page.evaluate(()=>window.__audio.length===1&&window.__audio[0]===window.__authContinuityAudio&&window.__audio[0].paused&&!window.__audio[0].getAttribute('src')),true);
   assert.equal(await inventory(),before);
   const required=page.getByRole('dialog');await required.getByLabel('Correo electrónico').fill(user.email);await required.getByLabel('Contraseña',{exact:true}).fill('TESTONLY-own-password');
   await required.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.locator('.shell-nav').waitFor();assert.equal(signIns,1);
   await page.screenshot({path:run+`/${engine}-account-pulso.png`});
   assert.equal(await page.evaluate(()=>window.__audio.length===1&&window.__audio[0]===window.__authContinuityAudio&&window.__audio[0].paused),true);assert.equal(await inventory(),before);
   assert.ok(initial.src);

  }finally{
   const dialog=page.getByRole('dialog');if(await dialog.isVisible())await dialog.getByRole('button',{name:'Cerrar cuenta de Pulso'}).click().catch(()=>{});
   const pause=page.locator('.mini-player').getByRole('button',{name:'Pausar desde minirreproductor'});if(await pause.isVisible())await pause.click();
   await context.unroute(origin+'/account-config.json',config);await context.unroute(origin+'/api/account-auth/**',auth);
  }
 });
}
