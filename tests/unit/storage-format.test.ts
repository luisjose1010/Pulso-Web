import test from 'node:test';import assert from 'node:assert/strict';
import {formatStorageMB,formatStorageProgress} from '../../src/library/storage-format';
test('storage displays decimal MB, including real binary limits, rather than bits or relabelled MiB',()=>{
 assert.equal(formatStorageMB(1000000),'1,00 MB');assert.equal(formatStorageMB(1048576),'1,05 MB');assert.equal(formatStorageMB(32*1048576),'33,55 MB');assert.equal(formatStorageMB(0),'0,00 MB');assert.equal(formatStorageMB(500),'< 0,01 MB');
});
test('unknown or invalid sizes stay unknown and do not look like zero occupied space',()=>{
 for(const value of [null,undefined,NaN,Infinity,-1])assert.equal(formatStorageMB(value),'Desconocido');assert.equal(formatStorageProgress(2000000,1000000),'1,00 MB de 1,00 MB');assert.equal(formatStorageProgress(100000,1000000),'0,10 MB de 1,00 MB');
});
