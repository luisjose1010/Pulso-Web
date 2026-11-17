import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {noticeArtifacts,reviewedPackages,verifyBundledModule,projectRoot} from '../../scripts/third-party-notices.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('all reviewed notices retain every original byte, copyright and conditions',()=>{
 const {text,manifest}=noticeArtifacts(),expectedCount=reviewedPackages.reduce((n,p)=>n+p.noticeFiles.length+(p.additionalNoticeFiles?.length??0),0),seen=new Set();assert.equal(manifest.packages.length,expectedCount);assert.equal(hash(text),manifest.sha256);
 for(const row of manifest.packages){const expected=reviewedPackages.find(p=>p.name===row.name&&p.version===row.version);const notice=[...expected.noticeFiles,...expected.additionalNoticeFiles??[]].find(n=>n.file.split('/').at(-1)===row.originalFile&&n.sha256===row.sha256);assert.ok(notice);const key=`${row.name}@${row.version}:${notice.file}`;assert.equal(seen.has(key),false);seen.add(key);const original=readFileSync(resolve(projectRoot,notice.file));const slice=text.subarray(row.offset,row.offset+row.bytes);assert.deepEqual(slice,original);assert.equal(hash(slice),row.sha256);}assert.equal(seen.size,expectedCount);
 assert.match(text.toString(),/Permission is hereby granted/);assert.match(text.toString(),/Redistribution and use in source and binary forms/);
 assert.equal(manifest.packages.some(p=>p.name.includes('ffmpeg')),false);
 for(const name of ['@mtcute/core','@mtcute/web','@mtcute/wasm','long'])assert.ok(manifest.packages.some(p=>p.name===name));
 assert.match(text.toString(),/Apache License/);
});
test('module inventory guard permits the reviewed SDK and still rejects unreviewed packages',()=>{
 verifyBundledModule(resolve(projectRoot,'node_modules/react/index.js'));verifyBundledModule('\0'+resolve(projectRoot,'node_modules/react/jsx-runtime.js')+'?commonjs-proxy');
 verifyBundledModule(resolve(projectRoot,'node_modules/@mtcute/web/index.js'));
 assert.throws(()=>verifyBundledModule(resolve(projectRoot,'node_modules/@mtcute/web/index.js'),{packages:reviewedPackages.filter(p=>p.name!=='@mtcute/web')}),/License review required before bundling/);
 assert.throws(()=>verifyBundledModule(resolve(projectRoot,'node_modules/@ffmpeg-installer/linux-x64/index.js')),/License review required before bundling/);
});
test('composite WASM source and original GPL/LGPL notices remain byte-exact',()=>{
 const base=resolve(projectRoot,'vendor/telegram-wasm'),source=JSON.parse(readFileSync(resolve(base,'SOURCE-MANIFEST.json'),'utf8'));
 for(const row of source.sourceFiles){const bytes=readFileSync(resolve(base,row.path));assert.equal(bytes.length,row.bytes);assert.equal(hash(bytes),row.sha256);}
 assert.match(readFileSync(resolve(base,'PULSO-NOTICES.txt'),'utf8'),/GNU LESSER GENERAL PUBLIC LICENSE/);
 assert.match(readFileSync(resolve(base,'packages/wasm/lib/crypto/COPYING.lesser'),'utf8'),/Version 3/);
});
test('changed package metadata or notice bytes stop generation and module bundling',()=>{
 const root=mkdtempSync(resolve(tmpdir(),'pulso-license-fixture-'));const name='own-fixture';const dir=resolve(root,'node_modules',name);mkdirSync(dir,{recursive:true});
 const original=Buffer.from('Own test-only notice\r\nUnicode: canción\r\n');const row={name,version:'1.0.0',license:'MIT',noticeFiles:[{file:`node_modules/${name}/LICENSE`,bytes:original.length,sha256:hash(original)}]};
 try{
  const pkg={name,version:'1.0.0',license:'MIT'};writeFileSync(resolve(dir,'package.json'),JSON.stringify(pkg));writeFileSync(resolve(dir,'LICENSE'),original);
  assert.equal(noticeArtifacts({root,packages:[row]}).manifest.packages.length,1);verifyBundledModule(resolve(dir,'index.js'),{root,packages:[row]});
  writeFileSync(resolve(dir,'package.json'),JSON.stringify({...pkg,version:'2.0.0'}));assert.throws(()=>noticeArtifacts({root,packages:[row]}),/metadata changed/);assert.throws(()=>verifyBundledModule(resolve(dir,'index.js'),{root,packages:[row]}),/metadata changed/);
  writeFileSync(resolve(dir,'package.json'),JSON.stringify(pkg));const corrupt=Buffer.from(original);corrupt[0]^=1;writeFileSync(resolve(dir,'LICENSE'),corrupt);
  assert.throws(()=>noticeArtifacts({root,packages:[row]}),/original notice changed/);assert.throws(()=>verifyBundledModule(resolve(dir,'index.js'),{root,packages:[row]}),/original notice changed/);
  writeFileSync(resolve(dir,'LICENSE'),original);const extra=Buffer.from('Own additional original license\n'),additional={...row,additionalNoticeFiles:[{file:'additional-license.txt',bytes:extra.length,sha256:hash(extra)}]};writeFileSync(resolve(root,'additional-license.txt'),extra);
  assert.equal(noticeArtifacts({root,packages:[additional]}).manifest.packages.length,2);verifyBundledModule(resolve(dir,'index.js'),{root,packages:[additional]});writeFileSync(resolve(root,'additional-license.txt'),'changed');
  assert.throws(()=>noticeArtifacts({root,packages:[additional]}),/original notice changed/);assert.throws(()=>verifyBundledModule(resolve(dir,'index.js'),{root,packages:[additional]}),/original notice changed/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('a package without declared license requires an explicit reviewed source notice and still fails closed',()=>{
 const root=mkdtempSync(resolve(tmpdir(),'pulso-license-source-')),name='own-source-fixture',dir=resolve(root,'node_modules',name);mkdirSync(dir,{recursive:true});
 const original=Buffer.from('Own source-fixture license only\n');
 const row={name,version:'1.0.0',license:'MIT',metadataLicense:null,noticeFiles:[{file:'source-license.txt',bytes:original.length,sha256:hash(original),external:true}]};
 try{
  writeFileSync(resolve(dir,'package.json'),JSON.stringify({name,version:'1.0.0'}));writeFileSync(resolve(root,'source-license.txt'),original);
  verifyBundledModule(resolve(dir,'index.js'),{root,packages:[row]});assert.equal(noticeArtifacts({root,packages:[row]}).manifest.packages[0].license,'MIT');
  const {metadataLicense:omitted,...unreviewed}=row;assert.equal(omitted,null);assert.throws(()=>verifyBundledModule(resolve(dir,'index.js'),{root,packages:[unreviewed]}),/metadata changed/);
  writeFileSync(resolve(dir,'package.json'),JSON.stringify({name,version:'1.0.0',license:'ISC'}));assert.throws(()=>noticeArtifacts({root,packages:[row]}),/metadata changed/);
  writeFileSync(resolve(dir,'package.json'),JSON.stringify({name,version:'1.0.0'}));writeFileSync(resolve(root,'source-license.txt'),'changed');assert.throws(()=>verifyBundledModule(resolve(dir,'index.js'),{root,packages:[row]}),/original notice changed/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
