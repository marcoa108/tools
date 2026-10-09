/* Google Contacts CSV and vCard parsing. No phone numbers or private notes are retained. */
(() => {
  'use strict';
  const clean=(value,max=300)=>String(value??'').trim().slice(0,max);
  const nameKey=value=>clean(value,300).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
  const unique=values=>[...new Set(values.filter(Boolean))];
  const emails=values=>unique(values.map(v=>clean(v,254).toLowerCase()).filter(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))).slice(0,8);
  const labels=values=>unique(values.map(v=>clean(v,80)).filter(v=>v&&!/^(all contacts|contacts|takeout|tutti i contatti|contatti|\* mycontacts)$/i.test(v))).slice(0,30);
  function categoryFor(sourceLabels,company){const s=sourceLabels.map(x=>x.toLowerCase());if(s.some(x=>/^(family|famiglia)$/.test(x)))return 'Family';if(s.some(x=>/^(personal|personale|contatti personali)$/.test(x)))return 'Personal';if(s.some(x=>/^(business|work|lavoro|coworkers|\* coworkers)$/.test(x)))return 'Business';return company?'Business':'Uncategorized';}
  function normalize(raw){const mail=emails(raw.emails||[]),name=clean(raw.name||[raw.first,raw.last].filter(Boolean).join(' '),240)||mail[0]||'';if(!name)return null;const company=clean(raw.company,250),sourceLabels=labels(raw.labels||[]);return {
    id:clean(raw.id,600)||('google:'+(mail[0]||nameKey(name)+'|'+nameKey(company))),name,first:clean(raw.first,120),last:clean(raw.last,120),emails:mail,company,position:clean(raw.position,250),city:clean(raw.city,120),region:clean(raw.region,120),country:clean(raw.country,120),labels:sourceLabels,category:clean(raw.category,80)||categoryFor(sourceLabels,company),linkedPersonId:clean(raw.linkedPersonId,600),addedPersonId:clean(raw.addedPersonId,600),ambiguous:!!raw.ambiguous
  };}
  function parseCSV(text,readRows){const rows=readRows(text),at=rows.findIndex(r=>{const h=r.map(x=>x.trim().toLowerCase());return (h.includes('first name')||h.includes('given name')||h.includes('name'))&&h.some(x=>/^e-?mail \d+ - value$/.test(x));});
    if(at<0)throw new Error('Could not find Google Contacts name and email columns.');
    const heads=rows[at].map(x=>x.trim().toLowerCase()),out=[];
    for(const row of rows.slice(at+1)){const get=k=>row[heads.indexOf(k)]||'',first=get('first name')||get('given name'),last=get('last name')||get('family name'),name=[first,get('middle name'),last].filter(Boolean).join(' ')||get('name');const mail=heads.flatMap((h,i)=>/^e-?mail \d+ - value$/.test(h)?[row[i]]:[]);
      const sourceLabels=(get('labels')||get('group membership')).split(/\s*:::\s*/).map(x=>x.trim());let city='',region='',country='';for(let n=1;n<=5;n++){city||=(get(`address ${n} - city`));region||=(get(`address ${n} - region`));country||=(get(`address ${n} - country`));}
      const contact=normalize({first,last,name,emails:mail,company:get('organization name')||get('organization 1 - name'),position:get('organization title')||get('organization 1 - title'),labels:sourceLabels,city,region,country});if(contact)out.push(contact);
    }return combine([],out);
  }
  function unescape(value){return clean(value,2000).replace(/\\n/gi,'\n').replace(/\\([,;\\])/g,'$1');}
  function parseVCF(text,folder=''){
    const lines=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n'),unfolded=[];
    for(const line of lines){if(/^[ \t]/.test(line)&&unfolded.length)unfolded[unfolded.length-1]+=line.slice(1);else unfolded.push(line);}
    const output=[];let props=null;
    for(const line of unfolded){if(/^BEGIN:VCARD$/i.test(line)){props=[];continue;}if(/^END:VCARD$/i.test(line)){if(props){const get=k=>props.filter(p=>p.key===k).map(p=>p.value),n=(get('N')[0]||'').split(';'),adr=(get('ADR')[0]||'').split(';');const sourceLabels=[...get('CATEGORIES').flatMap(x=>x.split(/(?<!\\),/)),folder];const contact=normalize({first:unescape(n[1]),last:unescape(n[0]),name:unescape(get('FN')[0])||[unescape(n[1]),unescape(n[0])].filter(Boolean).join(' '),emails:get('EMAIL').map(unescape),company:unescape((get('ORG')[0]||'').split(';')[0]),position:unescape(get('TITLE')[0]),labels:sourceLabels,city:unescape(adr[3]),region:unescape(adr[4]),country:unescape(adr[6])});if(contact)output.push(contact);}props=null;continue;}
      if(!props)continue;const colon=line.indexOf(':');if(colon<0)continue;const key=line.slice(0,colon).split(';')[0].split('.').at(-1).toUpperCase();props.push({key,value:line.slice(colon+1)});
    }return combine([],output);
  }
  function combine(existing,incoming){const byId=new Map(existing.map(c=>[c.id,normalize(c)]));for(const raw of incoming){const next=normalize(raw);if(!next)continue;const old=byId.get(next.id);if(!old){byId.set(next.id,next);continue;}const conflicting=nameKey(old.name)!==nameKey(next.name)&&old.emails.length&&next.emails.length;
      byId.set(next.id,{...old,emails:unique([...old.emails,...next.emails]),labels:unique([...old.labels,...next.labels]),company:old.company||next.company,position:old.position||next.position,city:old.city||next.city,region:old.region||next.region,country:old.country||next.country,category:old.category==='Uncategorized'?next.category:old.category,ambiguous:old.ambiguous||next.ambiguous||!!conflicting});
    }return [...byId.values()];}
  function match(contacts,people){const byName=new Map(),contactsByName=new Map(),contactKey=c=>nameKey(c.first&&c.last?c.first+' '+c.last:c.name);for(const p of people){const key=nameKey(p.name);if(!key)continue;if(!byName.has(key))byName.set(key,[]);byName.get(key).push(p.id);}for(const c of contacts){const key=contactKey(c);if(!contactsByName.has(key))contactsByName.set(key,[]);contactsByName.get(key).push(c);}
    let linked=0,ambiguous=0;
    for(const c of contacts){const key=contactKey(c),candidates=byName.get(key)||[],siblings=contactsByName.get(key)||[];if(c.addedPersonId&&people.some(p=>p.id===c.addedPersonId)){c.linkedPersonId=c.addedPersonId;linked++;continue;}if(!c.ambiguous&&candidates.length===1&&siblings.length===1){c.linkedPersonId=candidates[0];linked++;}else{c.linkedPersonId='';if(candidates.length||siblings.length>1){c.ambiguous=true;ambiguous++;}}}
    return {linked,ambiguous};
  }
  globalThis.NetworkContacts={parseCSV,parseVCF,combine,match,normalize,nameKey};
})();
