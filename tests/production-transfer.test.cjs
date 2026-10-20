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
 for(const setting of ['app.release_admin_email','app.release_add_email','app.release_reader_email'])assert(sql.includes(setting));
 assert(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(sql));
 assert(!/\b(?:update|insert\s+into|delete\s+from)\s+(?:auth\.users|public\.fuel_shared_state)/i.test(sql));
 assert(sql.includes('current_setting'));
});

test('published markup contains no saved record rows, driver contacts or real driver defaults',()=>{
 assert.match(html,/<tbody id="tableBody">\s*<\/tbody>/);
 assert(!/\+968\d{8}/.test(html));
 assert(!html.includes('8245 BA'));assert(!html.includes('8797 AK'));
 assert(!html.includes('PREVIOUS_DEFAULT_ADMIN_PASSWORD'));
 assert(!html.includes('MUSTHAQ'));assert(!html.includes('RAHIM'));
 assert.match(html,/<input[^>]*id="inputDriverPhone"[^>]*value=""/);
});

test('driver phone lookup follows loaded records and clears missing or deleted contact',()=>{
 const start=html.indexOf('    const driverPhonesMap =');
 const end=html.indexOf('    const ADMIN_PASSWORD_KEY',start);
 const c={fuelRecords:[{driver:'Driver A',driverPhone:'+999111'},{driver:'Removed',driverPhone:'+999222',_deleted:true}]};
 vm.runInNewContext(html.slice(start,end)+'\nthis.phones=driverPhonesMap;',c);
 assert.equal(c.phones['Driver A'],'+999111');assert.equal(c.phones.Removed,'');assert.equal(c.phones.Missing,'');
 c.fuelRecords=[{driver:'Driver A',driverPhone:'+999333'}];assert.equal(c.phones['Driver A'],'+999333');
 const phone={value:'+999333'},selection={value:'Missing'};
 c.document={getElementById:id=>id==='inputDriver'?selection:phone};
 const fn=html.slice(html.indexOf('    function onDriverSelectionChange()'),html.indexOf('    function openRecordModal()'));
 vm.runInNewContext(fn,c);c.onDriverSelectionChange();assert.equal(phone.value,'');
 selection.value='Driver A';c.onDriverSelectionChange();assert.equal(phone.value,'+999333');
});

test('WhatsApp with no driver number never falls back to another employee',()=>{
 const opened=[],alerts=[];const c={driverPhonesMap:{},alert:s=>alerts.push(s),sendMsgToAPI:(...args)=>opened.push(args)};
 const fn=html.slice(html.indexOf('    function openWhatsAppDirect('),html.indexOf('    function sendMsgToAPI('));
 vm.runInNewContext(fn,c);c.openWhatsAppDirect('','car','Missing','date',0,0,0);
 assert.equal(opened.length,0);assert.equal(alerts.length,1);
 c.openWhatsAppDirect('+999123','car','Driver','date',0,0,0);assert.equal(opened[0][0],'999123');
});
