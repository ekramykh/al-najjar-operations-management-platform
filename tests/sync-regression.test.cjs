const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('  const mergeRecordSets = (localInput, remoteInput) => {');
const end = html.indexOf('\n  };', start);
assert.ok(start >= 0 && end > start, 'mergeRecordSets source exists');
const implementation = html.slice(start, end + 5);
function makeMerge() {
  const context = {
    deletedSyncIds: new Map(),
    normalizeRecordsForSync: rows => structuredClone(rows),
    stableRecordKey: row => row._syncId,
    nextAvailableSn: used => { let n = 1; while (used.has(n)) n++; return n; },
    recordChanged: (a,b) => JSON.stringify(a) !== JSON.stringify(b),
    recordTime: row => Date.parse(row._syncUpdatedAt || '') || 0,
    saveConflictBackup: () => {},
  };
  vm.runInNewContext(implementation + '\nthis.merge = mergeRecordSets;', context);
  return context;
}
const row = (id, sn, updated, extra={}) => ({_syncId:id,sn,_syncUpdatedAt:updated,...extra});
const early = '2026-10-10T10:00:00.000Z', late='2026-10-10T11:00:00.000Z';

test('concurrent additions keep remote number and allocate another number', () => {
  const {merge} = makeMerge();
  const result = merge([row('local',1,late)], [row('remote',1,early)]);
  assert.equal(result.find(r=>r._syncId==='remote').sn,1);
  assert.equal(result.find(r=>r._syncId==='local').sn,2);
});
test('remote newer edit wins without duplicate record', () => {
  const {merge} = makeMerge();
  const result = merge([row('a',1,early,{value:'old'})], [row('a',1,late,{value:'new'})]);
  assert.equal(result.length,1);
  assert.equal(result[0].value,'new');
});
test('remote deletion suppresses stale local copy', () => {
  const {merge} = makeMerge();
  const result = merge([row('a',1,late,{value:'old'})], [row('a',1,early,{_deleted:true})]);
  assert.equal(result.filter(r=>r._syncId==='a').length,1);
  assert.equal(result[0]._deleted,true);
});
test('deleted marker is retained across later merges', () => {
  const {merge} = makeMerge();
  merge([], [row('a',1,early,{_deleted:true})]);
  const result = merge([row('a',1,late)], []);
  assert.equal(result.length,1);
  assert.equal(result[0]._deleted,true);
});
