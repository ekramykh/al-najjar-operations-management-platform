'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const bootstrap=html.slice(html.indexOf("    const storedRecords = localStorage.getItem('fuel_system_records');"),html.indexOf('    let isDataDirty = false;'));
const start=html.indexOf('  async function initializeCloudData(');
const implementation=html.slice(start,html.indexOf('  const localUrl',start));
const url='https://staging.invalid';
function harness({rows=[],stored=null,dirty=false,legacy=false,project='',backupOK=true,write=true}={}){
 const cache=new Map();if(stored!==null)cache.set('fuel_system_records',stored);
 const c={storedRecords:stored,cloudDirty:dirty,legacyMigrationPending:legacy,dataProject:project,
  currentPermissions:{can_add:write},CLOUD_DATA_PROJECT_KEY:'project',deletedSyncIds:new Map(),rows,
  backups:[],writes:0,reads:0,localStorage:{getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v)},
  currentSnapshotRecords:()=>c.rows,currentSnapshot:()=>JSON.stringify(c.rows),
  saveConflictBackup:s=>{c.backups.push(s);return backupOK},
  normalizeRecordsForSync:r=>structuredClone(r),persistMergedRecords:r=>{c.rows=r;return JSON.stringify(r)},
  setRemoteBaseline:r=>c.revision=r,setCloudDirty:v=>c.cloudDirty=v,
  markLegacyMigrationComplete:()=>c.legacyMigrationPending=false,
  queueCloudWrite:async()=>c.writes++,loadCloudReadOnly:async()=>c.reads++,
 };
 vm.runInNewContext(implementation,c);return c;
}
const remote={data:{records:[{_syncId:'cloud-new',sn:999}],updated_at:'cloud-revision'}};
test('fresh browser starts with zero rows and never seeds historical records or storage',()=>{
 let writes=0;const c={defaultInitialRecords:Array.from({length:520},(_,i)=>({sn:i+1})),localStorage:{getItem:()=>null,setItem:()=>writes++}};
 vm.runInNewContext(bootstrap+'this.rows=fuelRecords;',c);
 assert.equal(c.rows.length,0);assert.equal(writes,0);
});
test('existing cache with twelve new rows is not replaced by an old baseline on page load',()=>{
 const rows=Array.from({length:532},(_,i)=>({sn:i+1}));let writes=0;
 const c={defaultInitialRecords:[],localStorage:{getItem:()=>JSON.stringify(rows),setItem:()=>writes++}};
 vm.runInNewContext(bootstrap+'this.rows=fuelRecords;',c);
 assert.equal(JSON.stringify(c.rows),JSON.stringify(rows));assert.equal(writes,0);
});
test('fresh login loads cloud only and performs zero sync writes',async()=>{
 const c=harness();await c.initializeCloudData(remote,url);
 assert.deepEqual(c.rows,remote.data.records);assert.equal(c.writes,0);assert.equal(c.dataProject,url);
});
test('legacy dirty historical cache is backed up without being uploaded',async()=>{
 const rows=Array.from({length:532},(_,i)=>({sn:i+1}));
 const c=harness({rows,stored:JSON.stringify(rows),dirty:true,legacy:true});
 await c.initializeCloudData(remote,url);assert.equal(c.writes,0);
 assert.equal(c.backups[0],JSON.stringify(rows));assert.deepEqual(c.rows,remote.data.records);
});
test('backup failure preserves local cache and prevents any cloud write or replacement',async()=>{
 const rows=[{sn:1}];const c=harness({rows,stored:'cached',legacy:true,backupOK:false});
 await assert.rejects(c.initializeCloudData(remote,url),/backed up/);
 assert.equal(c.rows,rows);assert.equal(c.writes,0);assert.equal(c.dataProject,'');
});
test('changing projects does not upload the previous projects pending records',async()=>{
 const rows=[{sn:1}];const c=harness({rows,stored:'cached',dirty:true,project:'https://production.invalid'});
 await c.initializeCloudData(remote,url);assert.equal(c.writes,0);assert.equal(c.backups[0],JSON.stringify(rows));
});
test('known same-project pending saves retain the existing authorized queue',async()=>{
 const c=harness({dirty:true,project:url});await c.initializeCloudData(remote,url);assert.equal(c.writes,1);
});
test('missing cloud dataset never triggers an automatic initialization upload',async()=>{
 const c=harness({legacy:true,stored:'cached',rows:[{sn:1}]});
 await assert.rejects(c.initializeCloudData({data:null},url),/not initialized/);assert.equal(c.writes,0);assert.equal(c.rows.length,1);
});
