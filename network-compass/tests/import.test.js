const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const context = { Date, URL, Map, Set, Array, Number, String, JSON, Blob, TextDecoder, DecompressionStream, Uint8Array, DataView, Promise };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../zip-reader.js'), 'utf8'), context);
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8').replace(
  '  init();\n})();',
  '  globalThis.testAPI={prepareZip,parseBackup,normalizePerson,hasNoRecordedIncoming,hasTwoWayExchange,setState(v){state=v}};\n})();'
);
vm.runInContext(source, context);
const app = context.testAPI;

function zip(files) {
  const locals = [], central = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes=Buffer.from(name), data=Buffer.from(content), compressed=zlib.deflateRawSync(data);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBytes.length,26);
    locals.push(local,nameBytes,compressed);
    const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50,0);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(8,10);record.writeUInt32LE(compressed.length,20);record.writeUInt32LE(data.length,24);record.writeUInt16LE(nameBytes.length,28);record.writeUInt32LE(offset,42);
    central.push(record,nameBytes);offset+=local.length+nameBytes.length+compressed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
const csv = rows=>rows.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\n');
const person = slug=>'https://www.linkedin.com/in/'+slug+'/';

(async()=>{
  const dana=app.normalizePerson({first:'Dana',last:'Example',company:'Example Co',url:person('dana'),note:'Offer a relevant introduction'});
  app.setState({version:1,people:[dana],groups:[{id:'group-1',name:'Peers',ids:[dana.id]}],invites:[{id:'outgoing|'+person('pat').replace(/\/$/,'')+'|2026-10-01',status:'interesting',action:'Research their work'}],sample:false,messagesMeta:null});
  const archive=zip({
    'Connections.csv':csv([['First Name','Last Name','URL','Company','Position','Connected On'],['Dana','Example',person('dana'),'Example Co','CEO','1 Oct 2026'],['Eli','Example',person('eli'),'Example Co','Founder','2 Oct 2026']]),
    'Profile.csv':csv([['First Name','Last Name'],['Me','Example']]),
    'messages.csv':csv([['CONVERSATION ID','FROM','SENDER PROFILE URL','TO','RECIPIENT PROFILE URLS','DATE','CONTENT'],['thread-1','Dana Example',person('dana'),'Me Example',person('me'),'2026-10-02','Hello'],['thread-2','Me Example',person('me'),'Dana Example',person('dana'),'2026-10-03','Thank you'],['thread-3','Me Example',person('me'),'Eli Example',person('eli'),'2026-10-04','board peer advisory']]),
    'Invitations.csv':csv([['From','To','Sent At','Message','Direction','inviterProfileUrl','inviteeProfileUrl'],['Me Example','Dana Example','2026-09-01','', 'OUTGOING',person('me'),person('dana')],['Me Example','Pat Prospect','2026-10-01','board peer advisory', 'OUTGOING',person('me'),person('pat')],['Riley Prospect','Me Example','2026-10-02','', 'INCOMING',person('riley'),person('me')]]),
    'Recommendations_Received.csv':csv([['First Name','Last Name','Text'],['Dana','Example','Great work']]),
    'Endorsement_Given_Info.csv':csv([['Endorsee First Name','Endorsee Last Name','Endorsee Public Url','Endorsement Status'],['Dana','Example','www.linkedin.com/in/dana/','ACCEPTED'],['Dana','Example','www.linkedin.com/in/dana/','PENDING']]),
    'SearchQueries.csv':'private search terms should never be extracted'
  });
  const files=await context.readLinkedInZip({size:archive.length,arrayBuffer:async()=>archive.buffer.slice(archive.byteOffset,archive.byteOffset+archive.length)});
  assert.equal(files['searchqueries.csv'],undefined);
  const report=app.prepareZip(files);
  assert.equal(report.incoming,2);
  assert.equal(report.people[0].note,'Offer a relevant introduction');
  assert.equal(report.invites.length,3);
  assert.equal(report.invites.filter(i=>!i.connected).length,2);
  assert.equal(report.invites.find(i=>i.name==='Pat Prospect').status,'interesting');
  assert.equal(report.invites.find(i=>i.name==='Pat Prospect').action,'Research their work');
  assert.equal(report.messages.meta.matchedMessages,3);
  assert.equal(app.hasTwoWayExchange(report.messages.byId.get(dana.id)),true);
  assert.equal(app.hasNoRecordedIncoming(report.messages.byId.get(dana.id)),false);
  const eli=report.people.find(p=>p.name==='Eli Example');
  assert.equal(app.hasNoRecordedIncoming(report.messages.byId.get(eli.id)),true);
  assert.equal(report.trust.signals.get(dana.id).recommendationsReceived,1);
  assert.equal(report.trust.signals.get(dana.id).endorsementsGiven,1,'Pending endorsements do not count');
  const restored=app.parseBackup(JSON.stringify({version:1,people:report.people,groups:[{id:'group-1',name:'Peers',ids:[dana.id]}],invites:report.invites}));
  assert.equal(restored.invites.find(i=>i.name==='Pat Prospect').status,'interesting');
  assert.equal(restored.groups[0].name,'Peers');
  console.log('ZIP extraction, invitation queue, message classification, signals, notes and backup passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
