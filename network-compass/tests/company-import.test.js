const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const zlib=require('node:zlib');
const context={URL,Blob,TextDecoder,DecompressionStream,Uint8Array,DataView,Number,String,Map,Promise};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../company-import.js'),'utf8'),context);
function zip(files){const local=[],central=[];let offset=0;for(const [name,text] of Object.entries(files)){const n=Buffer.from(name),raw=Buffer.from(text),data=zlib.deflateRawSync(raw),l=Buffer.alloc(30),c=Buffer.alloc(46);l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(8,8);l.writeUInt32LE(data.length,18);l.writeUInt32LE(raw.length,22);l.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(8,10);c.writeUInt32LE(data.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);local.push(l,n,data);central.push(c,n);offset+=l.length+n.length+data.length;}const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,dir,end]);}
const headers=['position','company','city','region','province','sector','revenue_2024_eur','profit_2024_eur','production_2024_eur','detail_url'];
const strings=[...headers,'Acme & Figli SPA','Milano','Lombardia','MI','Manufacturing','https://topaziende.quotidiano.net/lombardia/milano/fatturato-acme_figli-spa'];
const shared='<sst>'+strings.map(s=>'<si><t>'+s.replace(/&/g,'&amp;')+'</t></si>').join('')+'</sst>';
const cells=(row,values)=>'<row r="'+row+'">'+values.map((v,i)=>v==null?'':`<c r="${String.fromCharCode(65+i)}${row}"${typeof v==='number'?'':' t="s"'}><v>${v}</v></c>`).join('')+'</row>';
const header=cells(1,headers.map((_,i)=>String(i))),base=[1,'10','11','12','13','14',null,null,null,'15'];
const sheet1='<worksheet><sheetData>'+header+cells(2,base)+'</sheetData></worksheet>';
const sheet2='<worksheet><sheetData>'+header+cells(2,[2,'10','11','12','13','14',1250000,120000,1350000,'15'])+'</sheetData></worksheet>';
const workbook=zip({'xl/sharedStrings.xml':shared,'xl/worksheets/sheet1.xml':sheet1,'xl/worksheets/sheet2.xml':sheet2});
(async()=>{const records=await context.CompanyImport.parseWorkbook({size:workbook.length,arrayBuffer:async()=>workbook.buffer.slice(workbook.byteOffset,workbook.byteOffset+workbook.length)});assert.equal(records.length,1,'Same source URL is merged across sheets');assert.equal(records[0].name,'Acme & Figli SPA');assert.equal(records[0].revenue,1250000);assert.equal(records[0].profit,120000);assert.equal(records[0].production,1350000);assert.equal(records[0].detailUrl,'https://topaziende.quotidiano.net/lombardia/milano/fatturato-acme_figli-spa');assert.equal(context.CompanyImport.url('https://other.example/thing'),'');console.log('XLSX shared strings, multiple sheets, 2024 financials and safe source URLs passed.');})().catch(e=>{console.error(e);process.exitCode=1;});
