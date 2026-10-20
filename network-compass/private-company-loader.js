/* Optional private catalog loader. Public builds must exclude _private/company-data. */
(() => {
  'use strict';
  async function readResponse(response,limit) {
    if(!response.ok)throw new Error('Private company data is unavailable.');
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength>limit)throw new Error('Company data part exceeds safety limits.');
    return bytes;
  }
  async function loadPrivateCompanyData() {
    const base=new URL('../_private/company-data/',window.location.href);
    if(base.origin!==window.location.origin)throw new Error('Invalid company-data origin.');
    const manifestResponse=await fetch(new URL('manifest.json',base),{cache:'no-store'});
    if(!manifestResponse.ok)return [];
    const manifest=await manifestResponse.json();
    if(manifest?.schemaVersion!==1||manifest.format!=='gzip-json'||!Array.isArray(manifest.parts)||
      manifest.parts.length>30||manifest.count>100000)throw new Error('Invalid company-data manifest.');
    const entries=new Map();
    for(const part of manifest.parts) {
      if(!/^chunk-\d{3}\.json\.gz$/.test(part.path))throw new Error('Invalid company-data path.');
      const response=await fetch(new URL(part.path,base),{cache:'no-store'});
      const zipped=await readResponse(response,2*1024*1024);
      if(typeof DecompressionStream!=='function')throw new Error('Browser does not support gzip decoding.');
      const text=await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      if(text.length>9*1024*1024)throw new Error('Company-data part is too large.');
      const data=JSON.parse(text),items=data?.companies;
      if(!Array.isArray(items)||items.length!==part.records)throw new Error('Company-data part count mismatch.');
      for(const item of items) {
        if(!item||typeof item.name!=='string'||!item.name||!CompanyImport.url(item.detailUrl))continue;
        entries.set(item.detailUrl,item);
      }
    }
    if(entries.size!==manifest.count)throw new Error('Company-data total count mismatch.');
    return [...entries.values()];
  }
  globalThis.loadPrivateCompanyData=loadPrivateCompanyData;
})();