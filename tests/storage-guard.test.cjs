'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {IDBFactory}=require('fake-indexeddb');const {randomUUID}=require('node:crypto');
const code=fs.readFileSync('assets/storage-guard.js','utf8');
function local(rows={},limit=100000){
 const data=new Map(Object.entries(rows));const removed=[];let writes=0;
 return {data,removed,limit,get writes(){return writes},get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,
 setItem(k,v){writes++;v=String(v);const n=[...data].reduce((n,[a,b])=>n+(a===k?0:a.length+b.length),k.length+v.length);if(n>this.limit)throw Object.assign(new Error('Quota'),{name:'QuotaExceededError'});data.set(k,v)},removeItem(k){removed.push(k);data.delete(k)}};
}
function harness(storage=local()){
 const els={cloudStorageWarning:{hidden:true,textContent:''},cloudArchivedBackups:{hidden:true}};
 const window={indexedDB:new IDBFactory(),addEventListener(){}};
 const c={window,localStorage:storage,document:{getElementById:id=>els[id]},crypto:{randomUUID},structuredClone,Map,Date,Blob,URL,setTimeout,Promise};
 vm.runInNewContext(code,c);return {c,els,guard:window.fuelStorageGuard,storage};
}
function memoryArchive({put=async()=>{},get=x=>x}={}){
 const rows=new Map();return {async put(key,value){await put();const row={key,value};const id=String(rows.size);rows.set(id,row);return id},async get(id){return get(rows.get(id))},async all(){return [...rows.values()]},rows};
}
test('unchanged settings do not consume quota or rewrite data',()=>{const s=local({url:'existing'},0);const {guard}=harness(s);assert.equal(guard.setting('url','existing'),true);assert.equal(s.writes,0)});
test('full session storage falls back in memory and sign-out masks stale tokens',()=>{const s=local({token:'old'},0),{guard,els}=harness(s);guard.authStorage.setItem('token','new');assert.equal(guard.authStorage.getItem('token'),'new');assert.equal(els.cloudStorageWarning.hidden,false);guard.authStorage.removeItem('token');assert.equal(guard.authStorage.getItem('token'),null);assert.equal(s.data.has('token'),false)});
test('real IndexedDB archives retain exact values through a second connection',async()=>{
 const {c}=harness();const factory=new IDBFactory();const a=c.fuelRecoveryArchive(factory),b=c.fuelRecoveryArchive(factory);const id=await a.put('fuel_conflict_backup_a','{"records":[1,2]}');const row=await b.get(id);assert.equal(row.value,'{"records":[1,2]}');assert.equal((await b.all()).length,1);
});
test('only recognized backup copies are archived; active and unrelated keys survive',async()=>{
 const initial={fuel_system_records:'current',fuel_cloud_dirty:'1',fuel_deleted_sync_ids_v1:'tombstones',fuel_cloud_data_project_v1:'project',token:'session',unrelated:'other',fuel_conflict_backup_a:'x'.repeat(20000)};
 const s=local(initial,21000),{guard}=harness(s);await guard.prepare();assert.deepEqual(s.removed.filter(k=>k!=='fuel_storage_capacity_probe_v1'),['fuel_conflict_backup_a']);for(const [key,value]of Object.entries(initial))if(!key.startsWith('fuel_conflict_backup_'))assert.equal(s.getItem(key),value);
});
test('failed archive never deletes the original backup',async()=>{const s=local({fuel_conflict_backup_a:'safe'},0),{c}=harness(s);const a=memoryArchive({put:async()=>{throw Error('disk full')}}),g=c.createFuelStorageGuard(s,a);await g.prepare();assert.equal(s.getItem('fuel_conflict_backup_a'),'safe');assert.equal(s.removed.length,0)});
test('read-back mismatch never deletes the original backup',async()=>{const s=local({fuel_conflict_backup_a:'safe'},0),{c}=harness(s);const g=c.createFuelStorageGuard(s,memoryArchive({get:row=>({...row,value:'wrong'})}));await g.prepare();assert.equal(s.getItem('fuel_conflict_backup_a'),'safe')});
test('original backup stays present until archive commit and read-back finish',async()=>{
 let release;const gate=new Promise(r=>release=r);const s=local({fuel_conflict_backup_a:'safe'},0),{c}=harness(s);const a=memoryArchive({put:()=>gate}),g=c.createFuelStorageGuard(s,a);const pending=g.prepare();await Promise.resolve();await Promise.resolve();assert.equal(s.getItem('fuel_conflict_backup_a'),'safe');release();await pending;assert.equal(s.getItem('fuel_conflict_backup_a'),null);assert.equal([...a.rows.values()][0].value,'safe');
});
test('a backup changed by another tab is not removed after archiving the old version',async()=>{
 let release;const gate=new Promise(r=>release=r);const s=local({fuel_conflict_backup_a:'old'},0),{c}=harness(s);const g=c.createFuelStorageGuard(s,memoryArchive({put:()=>gate}));const pending=g.prepare();await Promise.resolve();await Promise.resolve();s.data.set('fuel_conflict_backup_a','new');release();await pending;assert.equal(s.getItem('fuel_conflict_backup_a'),'new');
});
test('failed record writes recover after archive without overwriting newer edits',async()=>{
 const s=local({fuel_conflict_backup_a:'x'.repeat(20000)},21000),{guard}=harness(s);guard.saveRecords('A'.repeat(2000));guard.saveRecords('B'.repeat(2200));await guard.whenIdle();assert.equal(s.getItem('fuel_system_records'),'B'.repeat(2200));assert.equal(guard.unsafe(),false);
});
test('a newer successful cache write cannot be overwritten by stale queued repair',async()=>{
 let release;const gate=new Promise(r=>release=r);const s=local({fuel_conflict_backup_a:'backup'},0),{c}=harness(s);const g=c.createFuelStorageGuard(s,memoryArchive({put:()=>gate}));g.saveRecords('old');await Promise.resolve();await Promise.resolve();s.limit=100000;g.saveRecords('new');release();await g.whenIdle();assert.equal(s.getItem('fuel_system_records'),'new');
});
test('dirty marker and deletion failures remain protected, and a later acknowledgment cancels stale dirty writes',async()=>{
 const s=local({},0),{guard,els}=harness(s);guard.critical('fuel_cloud_dirty','1');guard.critical('fuel_deleted_sync_ids_v1','{"deleted":true}');guard.saveRecords('[1]');await guard.whenIdle();assert.equal(guard.unsafe(),true);assert.equal(els.cloudStorageWarning.hidden,false);
 guard.removeCritical('fuel_cloud_dirty');s.limit=100000;guard.saveRecords('[2]');await guard.whenIdle();assert.equal(s.getItem('fuel_cloud_dirty'),null);assert.equal(s.getItem('fuel_deleted_sync_ids_v1'),'{"deleted":true}');assert.equal(s.getItem('fuel_system_records'),'[2]');assert.equal(guard.unsafe(),false);
});
test('archived recovery export is hidden and rejected without administrator permission',async()=>{const {guard,els}=harness();await assert.rejects(guard.exportArchives(),/Administrator/);assert.equal(els.cloudArchivedBackups.hidden,true)});
test('normal storage preserves values and does not report unsafe records',async()=>{const {guard,storage,els}=harness();guard.saveRecords('[{"sn":1}]');await guard.whenIdle();assert.equal(storage.getItem('fuel_system_records'),'[{"sn":1}]');assert.equal(guard.unsafe(),false);assert.equal(els.cloudStorageWarning.hidden,true)});
test('an IndexedDB transaction aborted after request success cannot delete the original',async()=>{
 const {c}=harness();const real=new IDBFactory();
 const api={open(...args){const request=real.open(...args);request.addEventListener('success',()=>{
  const db=request.result,transaction=db.transaction.bind(db);
  db.transaction=(...args)=>{const tx=transaction(...args);if(args[1]==='readwrite'){
   const store=tx.objectStore('backups'),put=store.put.bind(store);
   store.put=(...values)=>{const request=put(...values);request.addEventListener('success',()=>tx.abort());return request};
  }return tx};
 });return request}};
 const s=local({fuel_conflict_backup_a:'safe'},0),g=c.createFuelStorageGuard(s,c.fuelRecoveryArchive(api));
 await g.prepare();assert.equal(s.getItem('fuel_conflict_backup_a'),'safe');assert.equal(s.removed.length,0);
});
test('archive supports HTTP contexts without crypto.randomUUID',async()=>{
 const {c}=harness();c.crypto={getRandomValues:require('node:crypto').webcrypto.getRandomValues.bind(require('node:crypto').webcrypto)};
 const archive=c.fuelRecoveryArchive(new IDBFactory());const first=await archive.put('fuel_conflict_backup_http','synthetic');const second=await archive.put('fuel_conflict_backup_http','newer');
 assert.notEqual(first,second);assert.equal((await archive.get(first)).value,'synthetic');assert.equal((await archive.get(second)).value,'newer');
});
