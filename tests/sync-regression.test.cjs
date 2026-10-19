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

    recordChanged: (a,b) => JSON.stringify(a) !== JSON.stringify(b),
    recordTime: row => Date.parse(row._syncUpdatedAt || '') || 0,
    saveConflictBackup: () => {},
  };
  vm.runInNewContext(html.slice(html.indexOf('  const nextAvailableSn = used => {'), html.indexOf('  // Remember cloud-confirmed identities')) + '\nconst knownCloudSyncIds = new Set();\n' + implementation + '\nthis.merge = mergeRecordSets;', context);
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

test('offline-created then deleted record does not upload an unknown tombstone', () => {
  const {merge,deletedSyncIds} = makeMerge();
  deletedSyncIds.set('offline', late);
  const result = merge([], [row('cloud',1,early)]);
  assert.equal(result.length,1);
  assert.equal(result[0]._syncId,'cloud');
});
test('cloud deletion retains its tombstone and excludes old active copy', () => {
  const {merge} = makeMerge();
  const result = merge([row('a',1,late)], [row('a',1,early,{_deleted:true}),row('b',2,early)]);
  assert.equal(result.length,2);
  assert.equal(result.find(r=>r._syncId==='a')._deleted,true);
  assert.equal(result.find(r=>r._syncId==='b').sn,2);
});

test('a cloud-confirmed deletion remains authoritative if a later read omits it', () => {
  const {merge,deletedSyncIds} = makeMerge();
  merge([], [row('a',1,early)]);
  deletedSyncIds.set('a',late);
  const result = merge([row('a',1,early)], []);
  assert.equal(result.length,1);
  assert.equal(result[0]._deleted,true);
});

test('cloud tombstone retains every field so reconnect produces no stale delta', () => {
  const {merge} = makeMerge();
  const tombstone = row('deleted', 123, early, {_deleted:true, notes:'temporary test', car:'Volvo'});
  const result = merge([row('deleted',123,late)], [tombstone]);
  assert.equal(JSON.stringify(result[0]),JSON.stringify(tombstone));
  assert.equal(JSON.stringify(merge(result,[tombstone])[0]),JSON.stringify(tombstone));
});


test('concurrent additions with historical gaps allocate above the highest number', () => {
  const {merge} = makeMerge();
  const remote = [row('existing',535,early),row('device-B',536,late)];
  const local = [row('device-A',536,late)];
  const result = merge(local,remote);
  assert.equal(result.find(r=>r._syncId==='device-A').sn,537);
  assert.deepEqual(remote.map(r=>r.sn),[535,536]);
  assert.equal(local[0].sn,536);
  const repeated = merge(result,result);
  assert.equal(repeated.find(r=>r._syncId==='device-A').sn,537);
});

test('multiple pending additions get distinct numbers after remote maximum', () => {
  const {merge} = makeMerge();
  const result=merge([row('a',536,late),row('b',537,late)],[row('remote',536,early)]);
  assert.equal(result.find(r=>r._syncId==='a').sn,537);
  assert.equal(result.find(r=>r._syncId==='b').sn,538);
  assert.equal(new Set(result.map(r=>r.sn)).size,3);
});


test('deleted test numbers do not inflate concurrent addition numbers or lose tombstones',()=>{
 const {merge}=makeMerge();
 const tombstone=row('deleted-test',900000101,early,{_deleted:true});
 const remote=[row('device-B',538,late),tombstone];
 const result=merge([row('device-A',538,late)],remote);
 assert.equal(result.find(r=>r._syncId==='device-A').sn,539);
 assert.equal(result.find(r=>r._syncId==='device-B').sn,538);
 assert.equal(JSON.stringify(result.find(r=>r._syncId==='deleted-test')),JSON.stringify(tombstone));
});
