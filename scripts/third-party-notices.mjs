import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export const reviewedPackages=JSON.parse(readFileSync(new URL('./license-packages.json',import.meta.url),'utf8')).packages;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function checkPackage(record,root){
 const actual=JSON.parse(readFileSync(resolve(root,record.packageRoot??`node_modules/${record.name}`,'package.json'),'utf8'));
 if(actual.name!==record.name||actual.version!==record.version||(record.metadataLicense===null?actual.license!==undefined:actual.license!==record.license))throw new Error(`License review required for ${record.name}: package metadata changed`);
 return [...record.noticeFiles,...record.additionalNoticeFiles??[]].map(notice=>{
  const bytes=readFileSync(resolve(root,notice.file));
  if(bytes.length!==notice.bytes||digest(bytes)!==notice.sha256)throw new Error(`License review required for ${record.name}: original notice changed`);
  return {notice,bytes};
 });
}
export function verifyBundledModule(id,{root=projectRoot,packages=reviewedPackages}={}){
 const normalized=id.replace(/^\0+/,'').replaceAll('\\','/'),marker='/node_modules/',start=normalized.lastIndexOf(marker);
 if(start<0)return;
 const parts=normalized.slice(start+marker.length).split('/');
 const name=parts[0].startsWith('@')?parts.slice(0,2).join('/'):parts[0];
 // Resolve the actual module's package location too: a nested copy must match.
 const packageRoot=normalized.slice(0,start+marker.length)+name;
 const actual=JSON.parse(readFileSync(resolve(packageRoot,'package.json'),'utf8'));
 const record=packages.find(p=>p.name===name&&p.version===actual.version);
 if(!record&&packages.some(p=>p.name===name))throw new Error(`License review required for bundled ${name}: package metadata changed`);
 if(!record)throw new Error(`License review required before bundling ${name}@${actual.version}`);
 if(actual.version!==record.version||actual.name!==record.name||(record.metadataLicense===null?actual.license!==undefined:actual.license!==record.license))throw new Error(`License review required for bundled ${name}: package metadata changed`);
 for(const notice of record.noticeFiles){
  const file=notice.external?resolve(root,notice.file):resolve(packageRoot,notice.file.slice((record.packageRoot??`node_modules/${name}`).length+1));
  const bytes=readFileSync(file);
  if(bytes.length!==notice.bytes||digest(bytes)!==notice.sha256)throw new Error(`License review required for bundled ${name}: original notice changed`);
 }
 checkPackage(record,root);
}
export function licenseGuard(){
 return {name:'pulso-reviewed-third-party-licenses',generateBundle(_options,bundle){
  const seen=new Set();
  for(const output of Object.values(bundle))if(output.type==='chunk')for(const id of Object.keys(output.modules)){
   if(!id.includes('/node_modules/')||seen.has(id))continue;
   verifyBundledModule(id);seen.add(id);
  }
 }};
}
export function noticeArtifacts({root=projectRoot,packages=reviewedPackages}={}){
 // UTF-8 BOM keeps static text navigation readable even when the host omits charset.
 // Original package bytes remain unchanged at their recorded offsets.
 const chunks=[Buffer.from('\uFEFFPulso Web — avisos originales de dependencias de producción\n\nLos textos siguientes se conservan íntegros. Esta entrega incluye el SDK de acceso a Telegram y sus componentes WASM. Sus avisos compuestos se incluyen al final; fuentes y receta de sustitución en /telegram-sources.tar.gz.\n\n')];
 let offset=chunks[0].length;const entries=[];
 for(const record of packages){
  for(const {notice,bytes}of checkPackage(record,root)){
   const header=Buffer.from(`===== ${record.name}@${record.version} · ${record.license} =====\n\n`);chunks.push(header);offset+=header.length;
   entries.push({name:record.name,version:record.version,license:record.license,originalFile:notice.file.split('/').at(-1),offset,bytes:bytes.length,sha256:digest(bytes)});
   chunks.push(bytes,Buffer.from('\n\n'));offset+=bytes.length+2;
  }
 }
 const text=Buffer.concat(chunks);
 return {text,manifest:{version:1,file:'/THIRD-PARTY-NOTICES.txt',sha256:digest(text),packages:entries}};
}
export function writeNoticeArtifacts(outDir){
 const {text,manifest}=noticeArtifacts();mkdirSync(outDir,{recursive:true});
 writeFileSync(resolve(outDir,'THIRD-PARTY-NOTICES.txt'),text);
 writeFileSync(resolve(outDir,'third-party-licenses.json'),JSON.stringify(manifest,null,2)+'\n');
 return manifest.sha256;
}
