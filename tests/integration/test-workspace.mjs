import {mkdir,mkdtemp,realpath,rm,statfs,readdir,lstat} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';

// Only this invocation's mkdtemp directory is disposable. Evidence is separate.
export async function createTestWorkspace(name){
 if(!/^[a-z0-9-]+$/.test(name))throw Error('Invalid test workspace name');
 const disk=await statfs('/data');
 if(disk.bavail*disk.bsize<2*1024**3)throw Error('Less than 2 GiB free on /data; clean verified artifacts first');
 const evidenceBase=resolve('.local/test-evidence');await mkdir(evidenceBase,{recursive:true});
 if(await realpath(evidenceBase)!==evidenceBase)throw Error('Evidence directory must not be a symlink');
 async function size(dir){let bytes=0;for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isSymbolicLink())throw Error('Unexpected evidence symlink');bytes+=e.isDirectory()?await size(p):(await lstat(p)).size;}return bytes;}
 if(await size(evidenceBase)>=200*1024**2)throw Error('Test evidence budget reached (200 MiB); compact reviewed evidence first');
 const base=resolve('.local/tmp');await mkdir(base,{recursive:true});
 if(await realpath(base)!==base)throw Error('Test tmp directory must not be a symlink');
 const path=await mkdtemp(`${base}/${name}-`);
 const evidence=resolve('.local/test-evidence',path.split(sep).at(-1));
 await mkdir(evidence,{recursive:true});
 const device=(await lstat(path)).dev;
 async function checkTree(dir){for(const e of await readdir(dir,{withFileTypes:true})){const child=resolve(dir,e.name),st=await lstat(child);if(st.dev!==device)throw Error('Refusing mounted test path');if(e.isDirectory())await checkTree(child);}}
 return {dir:relative(process.cwd(),path),evidence,freeBefore:disk.bavail*disk.bsize,async cleanup(){
  if(await realpath(path)!==path||!path.startsWith(base+sep))throw Error('Test workspace identity changed');
  await checkTree(path);await rm(path,{recursive:true});
  const evidenceBytes=await size(evidence);if(evidenceBytes>20*1024**2)throw Error('Run evidence exceeds20MiB; temporary files removed, review evidence manually');
  const after=await statfs('/data');return {removed:true,freeBefore:disk.bavail*disk.bsize,freeAfter:after.bavail*after.bsize};
 }};
}
