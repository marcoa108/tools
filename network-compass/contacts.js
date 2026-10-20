/* Google/Outlook CSV and VCF parsing. Personal contact location is separate from employer location. */
(() => {
  'use strict';
  const clean=(value,max=300)=>String(value??'').trim().slice(0,max);
  const nameKey=value=>clean(value,300).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
  const unique=values=>[...new Set(values.filter(Boolean))];
  const emails=values=>unique(values.map(v=>clean(v,254).toLowerCase()).filter(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))).slice(0,8);
  const labels=values=>unique(values.map(v=>clean(v,80)).filter(v=>v&&!/^(all contacts|contacts|takeout|tutti i contatti|contatti|\* mycontacts)$/i.test(v))).slice(0,30);
  function categoryFor(sourceLabels,company){const s=sourceLabels.map(x=>x.toLowerCase());if(s.some(x=>/^(family|famiglia)$/.test(x)))return 'Family';if(s.some(x=>/^(personal|personale|contatti personali)$/.test(x)))return 'Personal';if(s.some(x=>/^(business|work|lavoro|coworkers|\* coworkers)$/.test(x)))return 'Business';return company?'Business':'Uncategorized';}
  function normalize(raw){const mail=emails(raw.emails||[]),name=clean(raw.name||[raw.first,raw.last].filter(Boolean).join(' '),240)||mail[0]||'';if(!name)return null;const company=clean(raw.company,250),sourceLabels=labels(raw.labels||[]);return {
    id:clean(raw.id,600)||((raw.source==='outlook'?'outlook:':'google:')+(mail[0]||nameKey(name)+'|'+nameKey(company))),source:raw.source==='outlook'?'outlook':'google',name,first:clean(raw.first,120),last:clean(raw.last,120),emails:mail,company,position:clean(raw.position,250),phone:clean(raw.phone,80),city:clean(raw.city,120),province:clean(raw.province,120),region:clean(raw.region,120),country:clean(raw.country,120),workCity:clean(raw.workCity,120),workProvince:clean(raw.workProvince,120),note:clean(raw.note,4000),labels:sourceLabels,category:clean(raw.category,80)||categoryFor(sourceLabels,company),linkedPersonId:clean(raw.linkedPersonId,600),addedPersonId:clean(raw.addedPersonId,600),ambiguous:!!raw.ambiguous
  };}
  function parseCSV(text,readRows){
    const headerName = value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
    const isGoogleEmail=h=>/^e-?mail \d+ - value$/.test(h);
    const isOutlookEmail=h=>/^(?:e-?mail(?: [23])? address|email(?: [23])? address|primary email|email)$/.test(h);
    const locate=rows=>rows.findIndex(row=>{
      const h=row.map(headerName);
      return h.some(x=>isGoogleEmail(x)||isOutlookEmail(x)) &&
        h.some(x=>['first name','given name','last name','family name','name','full name','display name'].includes(x)) &&
        !(h.includes('connected on')&&h.includes('url'));
    });
    let rows=readRows(text),at=locate(rows);
    if(at<0&&text.includes(';')){const alternate=readRows(text,';'),index=locate(alternate);if(index>=0){rows=alternate;at=index;}}
    if(at<0)throw new Error('Could not find Google Contacts or Outlook CSV name and email columns.');
    const heads=rows[at].map(headerName),out=[],google=heads.some(isGoogleEmail);
    const value=(row,...keys)=>{for(const key of keys){const index=heads.indexOf(key);if(index>=0&&row[index])return row[index];}return '';};
    for(const row of rows.slice(at+1)){
      const first=value(row,'first name','given name'),last=value(row,'last name','family name');
      const name=value(row,'full name','display name','name')||[first,value(row,'middle name'),last].filter(Boolean).join(' ');
      const mail=heads.flatMap((h,i)=>isGoogleEmail(h)||isOutlookEmail(h)?[row[i]]:[]);
      const sourceLabels=google?
        value(row,'labels','group membership').split(/\s*:::\s*/):
        value(row,'categories','category').split(/\s*[;,]\s*/);
      const address={
        city:value(row,'home city','other city','city'),
        province:value(row,'home state','home state/province','other state','state','province','provincia'),
        region:value(row,'region'),
        country:value(row,'home country/region','home country','other country/region','country','country/region'),
        workCity:value(row,'business city'),workProvince:value(row,'business state','business state/province')
      };
      if(google)for(let n=1;n<=5;n++){
        address.city ||= value(row,'address '+n+' - city');
        address.province ||= value(row,'address '+n+' - region');
        address.country ||= value(row,'address '+n+' - country');
      }
      address.region ||= address.province;
      const contact=normalize({source:google?'google':'outlook',first,last,name,emails:mail,
        company:value(row,'organization name','organization 1 - name','company','company name'),
        position:value(row,'organization title','organization 1 - title','job title','position'),
        labels:sourceLabels,
        phone:google?value(row,'phone 1 - value','phone 2 - value','phone 3 - value','phone 4 - value','phone 5 - value','phone 6 - value'):value(row,'mobile phone','primary phone','home phone','business phone','other phone'),
        note:value(row,'notes','note'),...address});
      if(contact)out.push(contact);
    }
    return combine([],out);
  }
  function unescape(value){return clean(value,4000).replace(/\\n/gi,'\n').replace(/\\([,;\\])/g,'$1');}
  function parseVCF(text,folder='',source='google'){
    const lines=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n'),unfolded=[];
    for(const line of lines){if(/^[ \t]/.test(line)&&unfolded.length)unfolded[unfolded.length-1]+=line.slice(1);else unfolded.push(line);}
    const output=[];let props=null;
    for(const line of unfolded){
      if(/^BEGIN:VCARD$/i.test(line)){props=[];continue;}
      if(/^END:VCARD$/i.test(line)){
        if(props){
          const get=k=>props.filter(p=>p.key===k).map(p=>p.value);
          const n=(get('N')[0]||'').split(';');
          const adrs=props.filter(p=>p.key==='ADR');
          const home=adrs.find(p=>/TYPE=(?:[^:;]*,)?HOME\b|;HOME\b/i.test(p.params))||adrs.find(p=>!/WORK\b/i.test(p.params))||null;
          const work=adrs.find(p=>/\bWORK\b/i.test(p.params));
          const homeAddress=(home?.value||'').split(';'),workAddress=(work?.value||'').split(';');
          const phones=props.filter(p=>p.key==='TEL');
          const preferred=phones.find(p=>/CELL|MOBILE/i.test(p.params))||phones.find(p=>/HOME/i.test(p.params))||phones[0];
          const sourceLabels=[...get('CATEGORIES').flatMap(x=>x.split(/(?<!\\),/)),folder];
          const contact=normalize({source,first:unescape(n[1]),last:unescape(n[0]),name:unescape(get('FN')[0])||[unescape(n[1]),unescape(n[0])].filter(Boolean).join(' '),
            emails:get('EMAIL').map(unescape),company:unescape((get('ORG')[0]||'').split(';')[0]),
            position:unescape(get('TITLE')[0]),labels:sourceLabels,phone:unescape(preferred?.value),
            note:get('NOTE').map(unescape).filter(Boolean).join('\n').slice(0,4000),
            city:unescape(homeAddress[3]),province:unescape(homeAddress[4]),region:unescape(homeAddress[4]),country:unescape(homeAddress[6]),
            workCity:unescape(workAddress[3]),workProvince:unescape(workAddress[4])});
          if(contact)output.push(contact);
        }
        props=null;continue;
      }
      if(!props)continue;
      const colon=line.indexOf(':');if(colon<0)continue;
      const meta=line.slice(0,colon),key=meta.split(';')[0].split('.').at(-1).toUpperCase();
      props.push({key,params:meta.slice(meta.indexOf(';')<0?meta.length:meta.indexOf(';')),value:line.slice(colon+1)});
    }
    return combine([],output);
  }
  function combine(existing,incoming){
    const byId=new Map();
    for(const raw of existing){const contact=normalize(raw);if(contact)byId.set(contact.id,contact);}
    for(const raw of incoming){
      const next=normalize(raw);if(!next)continue;
      let target=next.id,old=byId.get(target);
      if(!old&&next.emails.length){
        const duplicates=[...byId.values()].filter(c=>nameKey(c.name)===nameKey(next.name)&&c.emails.some(email=>next.emails.includes(email)));
        if(duplicates.length===1){old=duplicates[0];target=old.id;}
      }
      if(!old){byId.set(target,next);continue;}
      const conflicting=nameKey(old.name)!==nameKey(next.name)&&old.emails.length&&next.emails.length;
      byId.set(target,{...old,emails:unique([...old.emails,...next.emails]),labels:unique([...old.labels,...next.labels]),
        company:old.company||next.company,position:old.position||next.position,phone:old.phone||next.phone,city:old.city||next.city,
        province:old.province||next.province,region:old.region||next.region,country:old.country||next.country,workCity:old.workCity||next.workCity,workProvince:old.workProvince||next.workProvince,note:old.note||next.note,
        category:old.category==='Uncategorized'?next.category:old.category,
        ambiguous:old.ambiguous||next.ambiguous||!!conflicting});
    }
    return [...byId.values()];
  }
  function match(contacts,people){const byName=new Map(),contactsByName=new Map(),contactKey=c=>nameKey(c.first&&c.last?c.first+' '+c.last:c.name);for(const p of people){const key=nameKey(p.name);if(!key)continue;if(!byName.has(key))byName.set(key,[]);byName.get(key).push(p.id);}for(const c of contacts){const key=contactKey(c);if(!contactsByName.has(key))contactsByName.set(key,[]);contactsByName.get(key).push(c);}
    let linked=0,ambiguous=0;
    for(const c of contacts){const key=contactKey(c),candidates=byName.get(key)||[],siblings=contactsByName.get(key)||[];if(c.addedPersonId&&people.some(p=>p.id===c.addedPersonId)){c.linkedPersonId=c.addedPersonId;linked++;continue;}if(!c.ambiguous&&candidates.length===1&&siblings.length===1){c.linkedPersonId=candidates[0];linked++;}else{c.linkedPersonId='';if(candidates.length||siblings.length>1){c.ambiguous=true;ambiguous++;}}}
    return {linked,ambiguous};
  }
  globalThis.NetworkContacts={parseCSV,parseVCF,combine,match,normalize,nameKey};
})();
