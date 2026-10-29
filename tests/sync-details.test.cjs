'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const code=html.slice(html.indexOf('  // Read-only sync diagnostics.'),html.indexOf('  window.syncAdminPasswordToCloud'));
function harness(){
 const els=Object.fromEntries(['cloudLastSuccess','cloudPendingChanges','cloudLastErrorRow','cloudLastError','cloudStatus','cloudMessage'].map(id=>[id,{textContent:'',dataset:{},hidden:false}]));
 const c={cloudDirty:true,rows:[],Map,Date,$:id=>els[id],legacySyncId:r=>r?.sn?'legacy-sn:'+r.sn:null,currentSnapshotRecords:()=>c.rows,recordChanged:(a,b)=>JSON.stringify(a)!==JSON.stringify(b)};
 vm.runInNewContext(code,c);return {c,els};
}
test('dirty device shows unknown until an authorized baseline arrives',()=>{const {c,els}=harness();c.renderSyncDetails();assert.match(els.cloudPendingChanges.textContent,/Checking/);assert.match(els.cloudLastSuccess.textContent,/Not confirmed/)});
test('pending count includes add/edit/delete but excludes acknowledged deletions and settings',()=>{
 const {c,els}=harness();const remote=[{_syncId:'a',value:1},{_syncId:'b',value:1},{_syncId:'c',value:1},{_syncId:'already-deleted',_deleted:true}];
 c.rows=[{_syncId:'a',value:1},{_syncId:'b',value:2},{_syncId:'c',_deleted:true},{_syncId:'new',value:1},{_syncId:'already-deleted',_deleted:true},{_syncId:'offline-deletion',_deleted:true},{_syncId:'settings',_appSetting:true}];
 const original=JSON.stringify(c.rows);c.observeSyncDetailsResponse({data:{records:remote}},'read');assert.equal(els.cloudPendingChanges.textContent,'3 records');assert.equal(JSON.stringify(c.rows),original);
});
test('acknowledgment updates pending count without declaring newer local edits synchronized',()=>{
 const {c,els}=harness();c.rows=[{_syncId:'a',value:2}];c.observeSyncDetailsResponse({data:{records:[{_syncId:'a',value:1}]}},'sync');assert.equal(els.cloudPendingChanges.textContent,'1 record');c.noteSyncDetailsStatus('Pending local changes');assert.match(els.cloudLastSuccess.textContent,/Not confirmed/);
 c.cloudDirty=false;c.noteSyncDetailsStatus('Connected & Synced');assert.equal(els.cloudPendingChanges.textContent,'0 records');assert.doesNotMatch(els.cloudLastSuccess.textContent,/Not confirmed/);
});
test('errors are explained without advancing last success; reconnect clears prior session details',()=>{
 const {c,els}=harness();c.cloudDirty=false;c.noteSyncDetailsStatus('Connected & Synced');const last=els.cloudLastSuccess.textContent;
 els.cloudStatus.dataset.syncState='error';els.cloudStatus.textContent='Save failed';els.cloudMessage.textContent='Failed to fetch';c.noteSyncDetailsStatus('Save failed');assert.equal(els.cloudLastSuccess.textContent,last);assert.match(els.cloudLastError.textContent,/internet/);assert.equal(els.cloudLastErrorRow.hidden,false);
 c.noteSyncDetailsStatus('Connecting...');assert.match(els.cloudLastSuccess.textContent,/Not confirmed/);
});
test('signed out is not displayed as a sync failure and text is never inserted as HTML',()=>{const {c,els}=harness();els.cloudStatus.dataset.syncState='error';els.cloudStatus.textContent='Signed out';c.noteSyncDetailsStatus('Signed out');assert.equal(els.cloudLastErrorRow.hidden,true);els.cloudStatus.textContent='Save failed';els.cloudMessage.textContent='<img src=x onerror=alert(1)>';c.renderSyncDetails();assert.equal(els.cloudLastError.textContent,els.cloudMessage.textContent);assert.equal(els.cloudLastError.innerHTML,undefined)});
