/* Company spreadsheet and public-page parsing. The workbook never leaves this browser. */
(() => {
  'use strict';
  const decoder = new TextDecoder();
  const xmlText = value => value.replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (whole, numeric, named) => {
    if (numeric) { try { return String.fromCodePoint(numeric[0].toLowerCase()==='x'?parseInt(numeric.slice(1),16):Number(numeric)); } catch { return whole; } }
    return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[named.toLowerCase()];
  });
  const amount = value => { const s=String(value??'').trim(); if (!s || s==='—' || s==='-') return ''; const clean=s.replace(/[€\s]/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'); const n=Number(clean); return Number.isFinite(n)?n:''; };
  const url = value => { try { const u=new URL(String(value||'').trim()); return u.protocol==='https:'&&u.hostname==='topaziende.quotidiano.net'&&/^\/[a-z0-9-]+\/[a-z0-9-]+\/fatturato-[a-z0-9_-]+\/?$/i.test(u.pathname)?u.href.replace(/\/$/,''):''; } catch { return ''; } };
  async function workbookEntries(file) {
    if (file.size>30*1024*1024) throw new Error('Company workbook exceeds 30 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer()), view=new DataView(bytes.buffer), u16=p=>view.getUint16(p,true), u32=p=>view.getUint32(p,true);
    let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(u32(p)===0x06054b50&&p+22+u16(p+20)===bytes.length){end=p;break;}
    if(end<0)throw new Error('Invalid XLSX ZIP directory.');
    const count=u16(end+10),start=u32(end+16),size=u32(end+12);
    if(count>1000||count===65535||start===0xffffffff||size===0xffffffff||start+size>end)throw new Error('Unsupported XLSX structure.');
    const found=[];let p=start,total=0;
    for(let i=0;i<count;i++){
      if(p+46>end||u32(p)!==0x02014b50)throw new Error('Damaged XLSX directory.');
      const flags=u16(p+8),method=u16(p+10),compressed=u32(p+20),length=u32(p+24),nameSize=u16(p+28),next=p+46+nameSize+u16(p+30)+u16(p+32),offset=u32(p+42);
      if(next>end)throw new Error('Damaged XLSX directory.');const name=decoder.decode(bytes.subarray(p+46,p+46+nameSize));p=next;
      if(!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name))continue;
      if(flags&1||![0,8].includes(method)||compressed===0xffffffff||length===0xffffffff||length>50*1024*1024||(total+=length)>100*1024*1024)throw new Error('XLSX entry exceeds safety limits.');
      found.push({name,method,compressed,length,offset});
    }
    const out={};for(const e of found){const p=e.offset;if(p+30>bytes.length||u32(p)!==0x04034b50)throw new Error('Damaged XLSX entry.');const from=p+30+u16(p+26)+u16(p+28);if(from+e.compressed>bytes.length)throw new Error('Truncated XLSX entry.');let data=bytes.subarray(from,from+e.compressed);
      if(e.method===8){if(typeof DecompressionStream!=='function')throw new Error('This browser cannot decompress XLSX files.');const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let n=0;while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>e.length){await reader.cancel();throw new Error('Expanded XLSX entry is too large.');}chunks.push(value);}data=new Uint8Array(n);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}}
      if(data.length!==e.length)throw new Error('XLSX entry size mismatch.');out[e.name]=decoder.decode(data);
    }return out;
  }
  function spreadsheetRows(xml,shared){const rows=[],rowRe=/<row\b[^>]*>([\s\S]*?)<\/row>/g,cellRe=/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;let row;
    while((row=rowRe.exec(xml))){let cell;const cells=[];cellRe.lastIndex=0;while((cell=cellRe.exec(row[1]))){const reference=/\br="([A-Z]+)\d+"/.exec(cell[1]);if(!reference)continue;let col=0;for(const letter of reference[1])col=col*26+letter.charCodeAt(0)-64;const type=/\bt="([^"]+)"/.exec(cell[1])?.[1],raw=/<v>([\s\S]*?)<\/v>/.exec(cell[2]||'')?.[1]||'',inline=/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(cell[2]||'')?.[1]||'';cells[col-1]=type==='s'?shared[Number(raw)]||'':type==='inlineStr'?xmlText(inline):type==='str'?xmlText(raw):raw;}rows.push(cells);if(rows.length>100001)throw new Error('Company workbook has too many rows.');}return rows;
  }
  function fromRows(rows){const header=rows[0]?.map(x=>String(x||'').trim().toLowerCase())||[],required=['company','city','region','province','sector','revenue_2024_eur','profit_2024_eur','production_2024_eur','detail_url'];if(required.some(x=>!header.includes(x)))return [];
    const get=(row,key)=>row[header.indexOf(key)]??'';return rows.slice(1).map(row=>({name:String(get(row,'company')).trim().slice(0,250),city:String(get(row,'city')).trim().slice(0,120),region:String(get(row,'region')).trim().slice(0,120),province:String(get(row,'province')).trim().slice(0,30),industry:String(get(row,'sector')).trim().slice(0,150),rank:amount(get(row,'position')),detailUrl:url(get(row,'detail_url')),revenue:amount(get(row,'revenue_2024_eur')),profit:amount(get(row,'profit_2024_eur')),production:amount(get(row,'production_2024_eur'))})).filter(x=>x.name&&x.detailUrl);
  }
  async function parseWorkbook(file){const entries=await workbookEntries(file),shared=[];if(entries['xl/sharedStrings.xml']){const xml=entries['xl/sharedStrings.xml'],re=/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;let match;while((match=re.exec(xml))){const ts=[...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x=>xmlText(x[1]));shared.push(ts.join(''));if(shared.length>500000)throw new Error('Too many XLSX shared strings.');}}
    const records=new Map();for(const name of Object.keys(entries).filter(x=>/^xl\/worksheets\/sheet\d+\.xml$/.test(x)).sort((a,b)=>Number(a.match(/\d+/g).at(-1))-Number(b.match(/\d+/g).at(-1))))for(const item of fromRows(spreadsheetRows(entries[name],shared)))records.set(item.detailUrl,item);
    if(!records.size)throw new Error('No Top Aziende company sheets were found.');return [...records.values()];
  }
  function parseCSV(text,rowsParser){const rows=rowsParser(text),index=rows.findIndex(row=>row.map(x=>String(x).trim().toLowerCase()).includes('detail_url')&&row.map(x=>String(x).trim().toLowerCase()).includes('company'));if(index<0)throw new Error('No Top Aziende company columns were found.');return fromRows(rows.slice(index));}
  function parseDetail(raw){if(raw.length>3*1024*1024)throw new Error('Company page is too large.');const doc=new DOMParser().parseFromString(raw,'text/html'),body=doc.body.innerText||doc.body.textContent||'';
    const field={};for(const div of doc.querySelectorAll('#line-home-black-article .detail, .detail')){const label=div.querySelector('label')?.textContent?.trim().toLocaleLowerCase();if(label)field[label]=(div.querySelector('div')?.textContent||'').replace(/ACQUISTA (VISURA|BILANCIO|SOCI)/gi,'').trim();}
    const lines=body.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);for(const [label,key] of [['settore','settore'],['natura giuridica','natura giuridica'],['partita iva','partita iva'],['indirizzo','indirizzo'],['comune','comune'],['telefono','telefono'],['numero di addetti','numero di addetti'],['provincia','provincia'],['regione','regione']]){if(field[key])continue;const i=lines.findIndex(x=>x.toLocaleLowerCase()===label);if(i>=0)field[key]=lines[i+1]||'';}
    const years=new Map();for(const table of doc.querySelectorAll('table')){const headings=[...table.querySelectorAll('th')].map(x=>x.textContent.trim().toLocaleLowerCase()).join(' ');const type=/fatturato/.test(headings)?'revenue':/produzione/.test(headings)?'production':/util[ei]/.test(headings)?'profit':'';if(!type)continue;for(const row of table.querySelectorAll('tr')){const cols=[...row.querySelectorAll('td')].map(x=>x.textContent.trim()),year=Number(cols[0]);if(!Number.isInteger(year)||year<1900||year>2200)continue;if(!years.has(year))years.set(year,{year,revenue:'',profit:'',production:''});years.get(year)[type]=amount(cols[1]);}}
    if(!years.size){let type='';for(const line of lines){if(/^Dati Fatturato/i.test(line))type='revenue';else if(/^Dati Produzione/i.test(line))type='production';else if(/^Dati Utili/i.test(line))type='profit';const match=/^(20\d\d)\s+([\d.,]+)/.exec(line);if(match&&type){const year=Number(match[1]);if(!years.has(year))years.set(year,{year,revenue:'',profit:'',production:''});years.get(year)[type]=amount(match[2]);}}}
    if(!years.size&&!field['partita iva']&&!field['numero di addetti'])throw new Error('Could not find company details in this page. Copy the full company page and try again.');
    return {industry:(field.settore||'').slice(0,150),legalForm:(field['natura giuridica']||'').slice(0,120),vat:(field['partita iva']||'').replace(/[^0-9A-Za-z]/g,'').slice(0,24),address:(field.indirizzo||'').slice(0,250),city:(field.comune||'').slice(0,120),phone:(field.telefono||'').slice(0,80),employees:amount(field['numero di addetti']),province:(field.provincia||'').slice(0,30),region:(field.regione||'').slice(0,120),years:[...years.values()].sort((a,b)=>b.year-a.year)};
  }
  globalThis.CompanyImport={parseWorkbook,parseCSV,parseDetail,url};
})();
