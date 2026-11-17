import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('installed identity and start URL remain stable across releases, with real full-size PNG icons',()=>{
 const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
 assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');assert.equal(manifest.prefer_related_applications,false);
 assert.ok(manifest.name&&manifest.short_name);assert.deepEqual(manifest.related_applications,[{platform:'webapp',url:'/manifest.webmanifest',id:'https://pulso-web.pruebassoftware.workers.dev/'}]);assert.deepEqual(manifest.launch_handler,{client_mode:'focus-existing'});
 for(const size of [192,512]){const icon=manifest.icons.find((i:{sizes:string;purpose:string})=>i.sizes===`${size}x${size}`&&i.purpose==='any');assert.ok(icon);const bytes=readFileSync('public'+icon.src);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
 assert.match(readFileSync('index.html','utf8'),/<link rel="manifest" href="\/manifest.webmanifest">/);
});
