import test from 'node:test';import assert from 'node:assert/strict';
import {detectInstalledPulso,isPulsoApplication} from '../../src/pwa/installed-app';
import {accountLaunchTarget} from '../../src/pwa/launch-reuse';
const origin='https://pulso.test';
test('installation is claimed only for the current app and the current platform response',async()=>{
 assert.equal(isPulsoApplication({platform:'play',id:origin+'/'},origin),false);assert.equal(isPulsoApplication({platform:'webapp',url:'https://other.test/manifest.webmanifest'},origin),false);
 let installed=true;const host={origin,standalone:false,related:async()=>installed?[{platform:'webapp',id:origin+'/'}]:[]};assert.equal(await detectInstalledPulso(host),'installed');installed=false;assert.equal(await detectInstalledPulso(host),'not-detected');
});
test('installed context, unsupported API, error and deadline stay distinct',async()=>{
 assert.equal(await detectInstalledPulso({origin,standalone:true}),'standalone');assert.equal(await detectInstalledPulso({origin,standalone:false}),'unknown');assert.equal(await detectInstalledPulso({origin,standalone:false,related:async()=>{throw Error('unavailable');}}),'unknown');assert.equal(await detectInstalledPulso({origin,standalone:false,related:()=>new Promise(()=>{})},5),'unknown');
});
test('ordinary launches only focus; credential return reuses the current same-origin window',()=>{
 assert.equal(accountLaunchTarget(origin+'/',origin+'/?playing=1'),null);assert.equal(accountLaunchTarget('https://other.test/?pulso-account=reset',origin),null);assert.equal(accountLaunchTarget(origin+'/assets/private?pulso-account=reset',origin),null);
 const reset=origin+'/?pulso-account=reset&token=TESTONLY';assert.equal(accountLaunchTarget(reset,origin+'/'),reset);assert.equal(accountLaunchTarget(reset,reset),null);
});
