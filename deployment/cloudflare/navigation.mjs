/** Old version URLs remain immutable for fetch/precache/audits. A user opening
 * or refreshing one gets today's app, rather than reinstalling an obsolete UI. */
export function shellAssetRequest(request){
 const url=new URL(request.url);
 // Older Safari/web clips may omit Fetch Metadata. Their navigation still
 // requests HTML; precache and update-pointer fetches accept */* instead.
 const accept=request.headers.get('Accept')??'',dest=request.headers.get('Sec-Fetch-Dest');
 const html=accept.split(',').some(part=>{const [mime,...parameters]=part.trim().toLowerCase().split(';');return mime.trim()==='text/html'&&!parameters.some(p=>/^\s*q\s*=\s*0(?:\.0*)?\s*$/.test(p));});
 const navigation=request.mode==='navigate'||request.headers.get('Sec-Fetch-Mode')==='navigate'&&dest==='document'||html&&(!dest||dest==='document');
 return navigation&&(/^(?:\/(?:index\.html|try(?:\.html)?|listen(?:\.html)?|web(?:\.html)?))$/.test(url.pathname)||/^\/releases\/[a-f0-9]{16}(?:\.html)?$/.test(url.pathname))?new Request(new URL('/',url),request):request;
}
