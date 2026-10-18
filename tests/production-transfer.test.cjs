'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const config=html.match(/<script>\s*(const FUEL_PRODUCTION_URL[\s\S]*?)<\/script>/)[1];
const init=html.slice(html.indexOf('  async function initializeCloudData('),html.indexOf('  const localUrl',html.indexOf('  async function initializeCloudData(')));
const migration=html.slice(html.indexOf('  const FUEL_PRODUCTION_BOOTSTRAP_KEY'),html.indexOf('  // ---------------------------------------------------------------------------',html.indexOf('  const FUEL_PRODUCTION_BOOTSTRAP_KEY')));
test('production artifact contains no embedded test records or staging project',()=>{
 const embedded=html.match(/let defaultInitialRecords = (\[[\s\S]*?\]);/)[1];assert.deepEqual(JSON.parse(embedded),[]);
 assert(!html.includes('lfmuxtnurxaanixxflwc'));assert(!/service_role|sb_secret_/.test(config));
});
test('every inline JavaScript block parses',()=>{for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);});
test('production target overrides stale staging connection preferences without mutating cache',()=>{
 const c={localStorage:{getItem:()=> 'https://staging.invalid'}};vm.runInNewContext(config+'\n'+html.slice(html.indexOf('  const localUrl'),html.indexOf('  $("cloudUrl").value',html.indexOf('  const localUrl')))+'\nthis.result={localUrl,localKey};',c);
 assert.equal(c.result.localUrl,'https://mykwxfifrjohhjhomegf.supabase.co');assert(c.result.localKey.startsWith('eyJ'));
});
test('first production rollout loads cloud without uploading dirty cache even when cached project matches production',async()=>{
 const cache=new Map([['fuel_cloud_legacy_migration_v1','old'],['fuel_system_records','test-cache']]);
 const c={localStorage:{getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v)},cloudDirty:true,storedRecords:'test-cache',dataProject:'https://mykwxfifrjohhjhomegf.supabase.co',CLOUD_DATA_PROJECT_KEY:'project',deletedSyncIds:new Map(),currentPermissions:{can_add:true},rows:[{_syncId:'TEST-DO-NOT-UPLOAD'}],writes:0,backups:[],currentSnapshotRecords:()=>c.rows,currentSnapshot:()=>JSON.stringify(c.rows),saveConflictBackup:s=>{c.backups.push(s);return true},normalizeRecordsForSync:r=>r,persistMergedRecords:r=>{c.rows=r;return JSON.stringify(r)},setRemoteBaseline(){},setCloudDirty:v=>c.cloudDirty=v,queueCloudWrite:async()=>c.writes++,loadCloudReadOnly:async()=>{throw Error('unexpected')}};
 vm.runInNewContext(migration+'\n'+init,c);const live=[{_syncId:'PRODUCTION',sn:539}];await c.initializeCloudData({data:{records:live,updated_at:'revision'}},c.dataProject);assert.equal(c.writes,0);assert.equal(c.rows,live);assert.equal(c.cloudDirty,false);assert(c.backups[0].includes('TEST-DO-NOT-UPLOAD'));assert.equal(cache.get('fuel_production_rollout_20261018'),'cloud-loaded');
});
test('production roles seed only existing production accounts and never updates auth credentials or shared records',()=>{
 const sql=fs.readFileSync('supabase/migrations/202610100001_security_permissions_foundation.sql','utf8');
 for(const email of ['ekramykh@gmail.com','khaloudalmamri96@gmail.com','jaall77@yahoo.com'])assert(sql.includes(email));
 assert(!/\b(?:update|insert\s+into|delete\s+from)\s+(?:auth\.users|public\.fuel_shared_state)/i.test(sql));
 assert(!sql.includes('ekramykh@aol.com'));
});
