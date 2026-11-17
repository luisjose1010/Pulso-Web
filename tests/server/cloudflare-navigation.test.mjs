import {test} from 'node:test';import assert from 'node:assert/strict';import {shellAssetRequest} from '../../deployment/cloudflare/navigation.mjs';
test('opening or reloading an old release serves the current root, while fetch/precache keep exact immutable bytes',()=>{for(const path of ['/releases/0123456789abcdef.html','/releases/0123456789abcdef','/index.html','/web.html','/web','/try.html','/listen.html']){const u='https://pulso.test'+path,request=new Request(u,{headers:{'Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}});assert.equal(shellAssetRequest(request).url,'https://pulso.test/');const immutable=new Request(u);assert.equal(shellAssetRequest(immutable),immutable);}for(const path of ['/','/catalog/itunes/search','/telegram-config.json','/assets/app.js','/pilot.html']){const r=new Request('https://pulso.test'+path,{headers:{'Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}});assert.equal(shellAssetRequest(r),r);}});

test('Safari HTML navigations without Fetch Metadata use the current root without changing default fetch',()=>{
 const url='https://pulso.test/releases/0123456789abcdef.html';
 for(const accept of ['text/html','text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','TEXT/HTML; charset=utf-8'])assert.equal(shellAssetRequest(new Request(url,{headers:{Accept:accept}})).url,'https://pulso.test/');
 for(const headers of [{Accept:'*/*'},{Accept:'text/html;q=0'},{Accept:'text/html;q=0.00,*/*'},{Accept:'text/html','Sec-Fetch-Dest':'script'}]){const r=new Request(url,{headers});assert.equal(shellAssetRequest(r),r);}
});
