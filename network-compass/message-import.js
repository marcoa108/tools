/* Network Compass: stable event metadata, incremental message import (no message bodies saved). */
(() => {
  'use strict';
  function fingerprint(input) {
    const text=String(input??'');let a=2166136261,b=2166136261^0x9e3779b9;
    for(let i=0;i<text.length;i++){
      const code=text.charCodeAt(i);a=Math.imul(a^code,16777619);b=Math.imul(b^(code^0x5a),16777619);
    }
    return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
  }
  const safe=(v,n=300)=>String(v??'').slice(0,n);
  function normalizeEvents(events) {
    if(!Array.isArray(events))return [];
    const unique=new Map();
    for(const e of events.slice(0,500000)){
      if(!e||typeof e!=='object'||typeof e.key!=='string'||!e.key||!e.personId)continue;
      const item={key:safe(e.key,64),personId:safe(e.personId,600),thread:safe(e.thread,180),
        outgoing:!!e.outgoing,date:/^\d{4}-\d\d-\d\d$/.test(e.date||'')?e.date:'',
        timestamp:safe(e.timestamp,80),board:!!e.board,peer:!!e.peer};
      unique.set(item.key,item);
    }
    return [...unique.values()];
  }
  function mergeEvents(previous,incoming) {
    const combined=new Map(normalizeEvents(previous).map(e=>[e.key,e]));let added=0;
    for(const e of normalizeEvents(incoming))if(!combined.has(e.key)){combined.set(e.key,e);added++;}
    return {events:[...combined.values()],added,existing:combined.size-added};
  }
  function summarize(events,referenceTime=Date.now()) {
    const result=new Map(),threads=new Map(),activeMonths=new Map();
    const threshold=referenceTime-365*86400000;
    for(const e of normalizeEvents(events)){
      if(!result.has(e.personId))result.set(e.personId,{sent:0,received:0,total:0,lastDate:'',last12m:0,activeMonths:0,replies:0,vistage:'none',vistageLastDate:'',vistageTerms:[]});
      const c=result.get(e.personId);c.total++;
      if(e.outgoing)c.sent++;else c.received++;
      if(e.date>c.lastDate)c.lastDate=e.date;
      const t=Date.parse(e.timestamp);
      if(Number.isFinite(t)&&t>=threshold)c.last12m++;
      if(e.date){if(!activeMonths.has(e.personId))activeMonths.set(e.personId,new Set());activeMonths.get(e.personId).add(e.date.slice(0,7));}
      if(e.outgoing&&(e.board||e.peer)){
        if(e.board&&e.peer)c.vistage='both';else if(c.vistage==='none')c.vistage='possible';
        if(e.board&&!c.vistageTerms.includes('board'))c.vistageTerms.push('board');
        if(e.peer&&!c.vistageTerms.includes('peer advisory'))c.vistageTerms.push('peer advisory');
        if(e.date>c.vistageLastDate)c.vistageLastDate=e.date;
      }
      const threadKey=e.personId+'\u0000'+e.thread;
      if(!threads.has(threadKey))threads.set(threadKey,[]);
      threads.get(threadKey).push(e);
    }
    for(const [id,c] of result)c.activeMonths=activeMonths.get(id)?.size||0;
    for(const thread of threads.values()){
      thread.sort((a,b)=>{const t1=Date.parse(a.timestamp),t2=Date.parse(b.timestamp);
        if(Number.isFinite(t1)&&Number.isFinite(t2)&&t1!==t2)return t1-t2;
        return a.date.localeCompare(b.date)||a.key.localeCompare(b.key);});
      let awaiting=false;
      for(const e of thread){if(e.outgoing)awaiting=true;else if(awaiting){result.get(e.personId).replies++;awaiting=false;}}
    }
    return result;
  }
  globalThis.NetworkMessages={fingerprint,normalizeEvents,mergeEvents,summarize};
})();