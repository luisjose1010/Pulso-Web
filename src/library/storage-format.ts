const megabyte=1000000;
const number=new Intl.NumberFormat('es',{minimumFractionDigits:2,maximumFractionDigits:2});
/** Display only. Storage contracts, limits, hashes and progress values stay in bytes. */
export function formatStorageMB(bytes:number|null|undefined):string {
 if(typeof bytes!=='number'||!Number.isFinite(bytes)||bytes<0)return 'Desconocido';
 if(bytes>0&&bytes<megabyte/100)return '< 0,01 MB';
 return `${number.format(bytes/megabyte)} MB`;
}
export function formatStorageProgress(read:number,total:number):string {
 return `${formatStorageMB(Math.max(0,Math.min(read,total)))} de ${formatStorageMB(total)}`;
}
