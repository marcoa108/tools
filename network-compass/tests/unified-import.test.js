const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.equal((html.match(/type="file"/g)||[]).length,1,'One file picker handles all imports');
assert.doesNotMatch(html,/id="messages-button"|id="messages-file"|id="contacts-file"/);

const nodes=new Map();
const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,open:false,disabled:false,showModal(){this.open=true},close(){this.open=false}});return nodes.get(id)};
const context={Date,URL,Map,Set,Array,Number,String,JSON,Blob,Promise,TextDecoder,Uint8Array,DataView,
  document:{getElementById:element},setTimeout,clearTimeout,
  readLinkedInZip:async file=>file.archive};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'contacts.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'company-import.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').replace(
  '  init();\n})();',
  '  globalThis.testAPI={receiveFile,receiveMessagesFile,normalizePerson,setState(v){state=v},getStaged(){return stagedImport}};\n})();'
),context);
const app=context.testAPI;
const person=app.normalizePerson({first:'Ari',last:'Example',company:'Example Co',url:'https://www.linkedin.com/in/ari/'});
const state=()=>({version:1,people:[person],groups:[],contacts:[],invites:[],contactCategories:['Personal','Family','Business'],companies:{},sample:false,messagesMeta:null});
const file=(name,contents)=>({name,size:contents.length,text:async()=>contents});
const rows=values=>values.map(row=>row.join(',')).join('\n');
const google=rows([['First Name','Last Name','E-mail 1 - Value'],['Ari','Example','ari@example.test']]);
const messages=rows([['FROM','TO','DATE','CONTENT'],['Me Owner','Ari Example','2026-01-02','Hello'],['Ari Example','Me Owner','2026-01-03','Hi']]);

(async()=>{
  app.setState(state());
  await app.receiveFile(file('contacts.csv',google));
  assert.equal(element('contacts-dialog').open,true,'Google CSV opens its preview from the shared picker');
  assert.equal(app.getStaged().kind,'google');
  element('contacts-dialog').close();

  await app.receiveFile(file('Messages',messages));
  assert.equal(element('messages-dialog').open,true,'Extensionless Messages opens identity step');
  assert.equal(element('messages-selected-file').textContent,'Messages');
  element('messages-dialog').close();

  app.setState(state());
  const archive={
    'connections.csv':rows([['First Name','Last Name','URL','Company'],['Ari','Example','https://www.linkedin.com/in/ari/','Example Co']]),
    'messages.csv':messages
  };
  await app.receiveFile({name:'LinkedIn.zip',size:100,archive});
  assert.equal(element('messages-dialog').open,true,'ZIP without profile asks for identity');
  element('messages-own-name').value='Me Owner';
  await app.receiveMessagesFile({preventDefault(){}});
  assert.equal(element('messages-dialog').open,false);
  assert.equal(element('zip-dialog').open,true,'The same ZIP continues to import preview');
  assert.equal(app.getStaged().messages.meta.matchedMessages,2);
  console.log('One picker routes Google CSV, extensionless messages and a LinkedIn ZIP requiring identity.');
})().catch(e=>{console.error(e);process.exitCode=1;});
