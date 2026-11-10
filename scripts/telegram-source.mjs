/** Accompany every distributed SDK WASM with its source, original notices and replacement recipe. */
import {readFileSync,writeFileSync,copyFileSync,statSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=data=>createHash('sha256').update(data).digest('hex');
const root=resolve(import.meta.dirname,'..');
const names=['@mtcute/web','@mtcute/core','@mtcute/wasm','@mtcute/file-id','@mtcute/tl-runtime','@fuman/io','@fuman/net','@fuman/utils','long'];
const phoneCountryFiles=[
 {file:'LICENSE',bytes:10173,sha256:'a6cba85bc92e0cff7a450b1d873c0eaa2e9fc96bf472df0247a26bec77bf3ff9'},
 {file:'UPSTREAM-HEADER.txt',bytes:2210,sha256:'24ac808638093a5d0977685025649d17bcad4a39bc93ea0efab54a78561403d2'},
 {file:'SOURCE.json',bytes:716,sha256:'ead1d484313f6581024c6c48cf906f3cd7ab70a7f15862b872e34128796297ba'},
];
export function writeTelegramSources(directory){
 const out=resolve(directory),index=JSON.parse(readFileSync(resolve(root,'vendor/telegram-wasm/SOURCE-MANIFEST.json')));
 for(const entry of index.sourceFiles){const data=readFileSync(resolve(root,'vendor/telegram-wasm',entry.path));if(data.length!==entry.bytes||sha(data)!==entry.sha256)throw Error('Telegram WASM source changed: review required');}
 const extra=readFileSync(resolve(root,'vendor/telegram-wasm/PULSO-NOTICES.txt'));
 const notices=resolve(out,'THIRD-PARTY-NOTICES.txt');writeFileSync(notices,Buffer.concat([readFileSync(notices),Buffer.from('\n\n===== Telegram composite WASM sources and licenses =====\n\n'),extra]));
 const manifest=JSON.parse(readFileSync(resolve(out,'third-party-licenses.json')));manifest.sha256=sha(readFileSync(notices));manifest.telegramSources={file:'/telegram-sources.tar.gz',notices:'vendor/telegram-wasm/PULSO-NOTICES.txt'};
 const countryChunks=[readFileSync(notices),Buffer.from('\n\n===== Country/calling-code facts derived from Google libphonenumber · Apache-2.0 =====\n\n')];
 let offset=countryChunks.reduce((n,bytes)=>n+bytes.length,0);const countryNotices=[];
 for(const record of phoneCountryFiles){
  const originalFile=`vendor/phone-countries/${record.file}`,bytes=readFileSync(resolve(root,originalFile));
  if(bytes.length!==record.bytes||sha(bytes)!==record.sha256)throw Error('Phone-country source notices changed: review required');
  const header=Buffer.from(`===== ${originalFile} =====\n\n`);countryChunks.push(header);offset+=header.length;
  countryNotices.push({originalFile,offset,bytes:bytes.length,sha256:sha(bytes)});countryChunks.push(bytes,Buffer.from('\n\n'));offset+=bytes.length+2;
 }
 writeFileSync(notices,Buffer.concat(countryChunks));manifest.sha256=sha(readFileSync(notices));
 manifest.phoneCountryData={license:'Apache-2.0',source:'vendor/phone-countries/SOURCE.json',notices:countryNotices};
 const sourceFiles=['package.json','package-lock.json','vite.config.ts','tsconfig.json','index.html','pilot.html','samples.html','src','public','scripts','tests','vendor/telegram-wasm','vendor/phone-countries',...names.map(n=>`node_modules/${n}`)];
 // All roots are explicit. No .local, owner configuration, attachment or session is archived.
 execFileSync('tar',['--sort=name','--mtime=2026-11-02T00:00:00Z','--owner=0','--group=0','--numeric-owner','-czf',relative(root,resolve(out,'telegram-sources.tar.gz')).split(sep).join('/'),...sourceFiles],{cwd:root,stdio:'pipe'});
 manifest.telegramSources.sha256=sha(readFileSync(resolve(out,'telegram-sources.tar.gz')));writeFileSync(resolve(out,'third-party-licenses.json'),JSON.stringify(manifest,null,2)+'\n');
 // The SW generation must also change when accompanying sources/recipe change.
 return sha(Buffer.from(JSON.stringify(manifest)));
}
export function writePrivateTelegramConfiguration(directory){
 const source=resolve(root,'.local/telegram-owner/api-identity.json');
 // Explicit private-delivery step only; not called by the ordinary product build.
 if(!statSync(source).isFile())throw Error('Private Telegram configuration absent');
 const config=JSON.parse(readFileSync(source));if(!Number.isSafeInteger(config.api_id)||!/^[a-f0-9]{32}$/.test(config.api_hash))throw Error('Invalid private Telegram configuration');
 copyFileSync(source,resolve(directory,'telegram-config.json'));
}
