const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(
  '  init();\n})();',
  '  globalThis.testAPI={analyzeMessagesCSV,hasTwoWayExchange,hasNoRecordedIncoming,parseBackup,normalizePerson,setState(v){state=v},setFilters(v){filters={...defaultFilters(),...v}},filteredPeople};\n})();'
);
const context = { Date, URL, Map, Set, Array, Number, String, JSON };
vm.createContext(context);
vm.runInContext(source, context);
const app = context.testAPI;

const self = 'https://www.linkedin.com/in/me/';
const url = slug => 'https://www.linkedin.com/in/' + slug + '/';
const people = ['Dana', 'Eli'].map(name => app.normalizePerson({ name: name + ' Example', company: 'Example Co', url: url(name.toLowerCase()) }));
app.setState({ version: 1, people, groups: [], sample: false, messagesMeta: null });

const header = 'CONVERSATION ID,FROM,FROM PROFILE URL,TO,TO PROFILE URL,DATE,CONTENT';
const row = (id, from, fromURL, to, toURL, date, content) =>
  [id, from, fromURL, to, toURL, date, content].map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',');
const csv = [header,
  row('first', 'Dana Example', url('dana'), 'Me Example', self, '2026-06-01 10:00:00 UTC', 'Hello.'),
  row('second', 'Me Example', self, 'Dana Example', url('dana'), '2026-06-02 10:00:00 UTC', 'Thanks, Dana.'),
  row('third', 'Me Example', self, 'Eli Example', url('eli'), '2026-06-03 10:00:00 UTC', 'Hello, Eli.')
].join('\n');
const report = app.analyzeMessagesCSV(csv, 'Me Example', self);
people.forEach(person => person.comms = report.byId.get(person.id));

assert.equal(people[0].comms.replies, 0, 'The sequence-based count has no reply after my outbound message');
assert.equal(app.hasTwoWayExchange(people[0].comms), true, 'Dana has exchanged messages in both directions');
assert.equal(app.hasNoRecordedIncoming(people[0].comms), false);
assert.equal(app.hasNoRecordedIncoming(people[1].comms), true, 'Eli has only an outgoing message');

const restored = app.parseBackup(JSON.stringify({ version: 1, people, groups: [], messagesMeta: report.meta }));
app.setState(restored);
app.setFilters({ response: 'no-reply' });
assert.deepEqual(app.filteredPeople().map(person => person.name), ['Eli Example']);
app.setFilters({ response: 'replied' });
assert.deepEqual(app.filteredPeople().map(person => person.name), ['Dana Example']);
console.log('Response classification passes for a last outbound message, split threads, and saved summaries.');
