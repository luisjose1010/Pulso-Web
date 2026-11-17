import test from 'node:test';import assert from 'node:assert/strict';
import {groupStorageDownloads} from '../../src/library/storage-groups';
import type {Track,Playlist,LocalAsset} from '../../src/library/library';
const t=(id:string,assetId:string|null,album:string|null=null)=>({id,assetId,title:id,artist:'Artist',album,favorite:false,manualOverrides:{}} as unknown as Track);
const a=(id:string)=>({id,bytes:100} as LocalAsset);
const p=(id:string,ids:string[])=>({id,name:id,entries:ids.map(trackId=>({trackId}))} as Playlist);
test('storage groups deduplicate aliases and repeated entries without hiding shared memberships',()=>{
 const tracks=[t('a','x','Album'),t('alias','x','Album'),t('missing',null,'Album')];tracks[0].favorite=true;
 const groups=groupStorageDownloads(tracks,[p('one',['a','a','alias','missing']),p('two',['a'])],[a('x')]);
 assert.equal(groups.length,4);for(const group of groups){assert.deepEqual(group.assetIds,['x']);assert.equal(group.bytes,100);}
 assert.equal(groups[0].favorite,true);assert.equal(groups.filter(g=>g.kind==='album').length,1);
});
test('loose downloads and orphaned assets remain manageable, absent copies and empty playlists omitted',()=>{
 const groups=groupStorageDownloads([t('loose','x'),t('missing','absent')],[p('empty',[])],[a('x'),a('orphan')]);
 assert.equal(groups.length,1);assert.equal(groups[0].id,'other');assert.deepEqual(groups[0].assetIds,['x','orphan']);assert.equal(groups[0].bytes,200);
 assert.deepEqual(groupStorageDownloads([],[],[]),[]);
});
test('same album title with different credits is not merged',()=>{
 const one=t('one','x','Album'),two={...t('two','y','Album'),artist:'Different'};
 const groups=groupStorageDownloads([one,two],[],[a('x'),a('y')]);assert.equal(groups.length,2);assert(groups.every(g=>g.bytes===100));
});
