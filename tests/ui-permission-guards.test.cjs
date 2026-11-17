'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
function harness(flags = {}, ready = true) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {value: id === 'editIndex' ? '-1' : id==='auditEditReason'?'Test correction':'', style:{},classList:{add(){},remove(){}},checkValidity:()=>true,reportValidity(){},focus(){},addEventListener(){},contains(){return false},scrollIntoView(){}});
    return elements.get(id);
  };
  let id = 0;
  const context = {
    Event:class {},
    client: {}, permissionsReady: ready, currentPermissions: flags,
     $:element, window:{dispatchEvent(){}}, document:{dispatchEvent(){},getElementById:element,querySelector:()=>({click(){}}),body:{classList:{add(){},remove(){}}}},
    prepareAuditForm(){},stageRecordAudit(){},showAuditEditConfirmation(before,after,callback){if(context.window.confirm('هل تريد حفظ التعديلات؟'))callback();},
    alerts:[], alert(message){context.alerts.push(message)},
    fuelRecords:[{sn:1,_syncId:'existing',_syncUpdatedAt:'2026-10-11T00:00:00Z',date:'11/10/2026',fuel:1}],
    isDataDirty:false, driverPhonesMap:{}, currentSortColumn:'sn',currentSortDirection:'asc',
    stationDisplayName:x=>x,formatDateDisplay:x=>x, formatTitleCase:x=>x,parseFlexibleDate:()=>null,
    checkInvoiceAmountWarning(){},confirmInvoiceAmountMinimum:()=>true,
    tripDocuments:r=>r.tripDocuments||[{...r}],readTripDocuments:()=>[],loadTripDocuments(){},
    sortRecordsArray(){},filterAndRender(){},closeRecordModal(){},
    updateFormAndFilterDatalists(){},onDriverSelectionChange(){},
    promptPassword(_message,callback){context.passwordCallback=callback},
    confirm:()=>true,adminPassword:'unchanged',
  };
  context.window.confirm=()=>true;
  context.window.generateSyncId=()=>`new-${++id}`;
  context.window.saveToLocalStorage=()=>context.saves=(context.saves||0)+1;
  context.window.markFuelRecordDeleted=()=>context.deletions=(context.deletions||0)+1;
  vm.runInNewContext(html.slice(html.indexOf('    function escapeHtml(value)'),html.indexOf('    function renderDashboard(')),context);
  vm.runInNewContext(html.slice(html.indexOf('    function tripDocumentSummary'),html.indexOf('    function readTripDocuments')),context);
  context.window.ReferenceDashboardMetrics={dateKey:x=>String(x||'')};
  for(const name of ['fuel-purchases-model','fuel-purchase-form']) {
    const source=html.match(new RegExp('<script id="'+name+'">([\\s\\S]*?)</script>'))[1];
    vm.runInNewContext(source,context);
  }
  element('fuelPurchaseNone').checked=true;
  element('fuelPurchaseYes').checked=false;
  context.fuelRecords[0].refuelingStatus='none';context.fuelRecords[0].fuel=0;
  const bridge = html.slice(html.indexOf('  window.hasFuelPermission ='), html.indexOf('  // All protected reads'));
  vm.runInNewContext(bridge,context);
  const start = html.indexOf('    function requireFuelPermission(action)');
  const end = html.indexOf('    function resetForm()',start);
  vm.runInNewContext(html.slice(start,end),context);
  return {context,element};
}
const admin={can_read:true,can_add:true,can_edit:true,can_delete:true};
const adder={can_read:true,can_add:true,can_edit:false,can_delete:false};
const reader={can_read:true,can_add:false,can_edit:false,can_delete:false};
test('all inline scripts parse',()=>{
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1]);
});
test('reader and signed-out user cannot mutate local records or prompt for deletion',()=>{
  for(const [flags,ready] of [[reader,true],[admin,false],[{},true]]){
    const {context:c}=harness(flags,ready);
    const before=JSON.stringify(c.fuelRecords);
    c.saveRecord('new');c.saveRecordAsNew();c.deleteRecord(0);
    assert.equal(JSON.stringify(c.fuelRecords),before);
    assert.equal(c.saves,undefined);assert.equal(c.passwordCallback,undefined);
  }
});
test('add-only Save Record and Save as New create distinct identities and preserve source',()=>{
  const {context:c}=harness(adder);
  const before=JSON.stringify(c.fuelRecords[0]);
  c.saveRecord('new');c.saveRecordAsNew();
  assert.equal(c.fuelRecords.length,3);assert.equal(c.saves,2);
  assert.equal(new Set(c.fuelRecords.map(r=>r._syncId)).size,3);
  assert.equal(new Set(c.fuelRecords.map(r=>r.sn)).size,3);
  assert.equal(JSON.stringify(c.fuelRecords.find(r=>r._syncId==='existing')),before);
  c.editRecord(2);c.saveRecord('update');c.deleteRecord(2);
  assert.equal(c.saves,2);assert.equal(c.passwordCallback,undefined);
});
test('modal controls reflect edit versus copy permissions',()=>{
  const {context:c,element}=harness(adder);
  c.editRecord(0);
  assert.equal(element('btnModalSubmit').disabled,false);
  assert.equal(element('btnModalSaveAsNew').disabled,false);
  c.permissionsReady=false;c.window.refreshFuelPermissionControls();
  assert.equal(element('btnModalSaveAsNew').disabled,true);
});
test('admin edit follows identity when polling reorders records',()=>{
  const {context:c}=harness(admin);
  c.editRecord(0);
  c.fuelRecords.unshift({sn:2,_syncId:'remote'});
  c.saveRecord('update');
  assert.equal(c.fuelRecords[0]._syncId,'remote');
  assert.equal(c.fuelRecords[1]._syncId,'existing');assert.equal(c.saves,1);
});
test('changed or deleted open record rejects stale edit but permits a new copy',()=>{
  for(const remove of [true,false]){
    const {context:c}=harness(admin);c.editRecord(0);
    if(remove)c.fuelRecords=[];else c.fuelRecords[0].fuel=999;
    const before=JSON.stringify(c.fuelRecords);c.saveRecord('update');
    assert.equal(JSON.stringify(c.fuelRecords),before);assert.equal(c.saves,undefined);
    c.saveRecordAsNew();assert.equal(c.saves,1);
  }
});
test('delete rechecks permission after password prompt and uses stable identity',()=>{
  const {context:c}=harness(admin);c.deleteRecord(0);
  c.currentPermissions=reader;c.passwordCallback('unchanged');
  assert.equal(c.fuelRecords.length,1);assert.equal(c.deletions,undefined);
  c.currentPermissions=admin;c.deleteRecord(0);
  c.fuelRecords.unshift({sn:2,_syncId:'remote'});c.passwordCallback('unchanged');
  assert.equal(c.fuelRecords.length,1);assert.equal(c.fuelRecords[0]._syncId,'remote');assert.equal(c.saves,1);
});
test('replacement import requires all three mutation permissions',()=>{
  for(const [flags,expected] of [[adder,false],[reader,false],[admin,true]]){
    const {context:c}=harness(flags);assert.equal(c.window.hasFuelPermission('import'),expected);
  }
});
test('multi-invoice save and edit remain one trip; Save as New copies documents with a distinct identity',()=>{
 const {context:c,element}=harness(admin);
 const documents=[{invoiceNumber:'A',invoiceAmount:300,branch:'TURAYF BRANCH',deliveryNumber:'D1'},{invoiceNumber:'B',invoiceAmount:700,branch:'BARKAH BRANCH',deliveryNumber:'D2'}];
 c.readTripDocuments=()=>structuredClone(documents);
 c.saveRecord('new');assert.equal(c.fuelRecords.length,2);assert.equal(c.fuelRecords[0].tripDocuments.length,2);
 assert.equal(c.fuelRecords[0].invoiceAmount,1000);const id=c.fuelRecords[0]._syncId;
 c.editRecord(0);documents[1].invoiceAmount=800;c.saveRecord('update');
 assert.equal(c.fuelRecords.length,2);assert.equal(c.fuelRecords[0]._syncId,id);assert.equal(c.fuelRecords[0].invoiceAmount,1100);
 c.editRecord(0);c.saveRecordAsNew();assert.equal(c.fuelRecords.length,3);assert.notEqual(c.fuelRecords[0]._syncId,id);
 assert.deepEqual(c.fuelRecords[0].tripDocuments,documents);assert.deepEqual(c.fuelRecords[1].tripDocuments,documents);
});

test('cancelling update confirmation preserves original record and performs no save',()=>{
 const {context:c}=harness(admin);c.editRecord(0);const before=JSON.stringify(c.fuelRecords);let prompts=0;
 c.window.confirm=message=>{prompts++;assert.match(message,/هل تريد حفظ التعديلات/);return false};
 c.saveRecord('update');assert.equal(prompts,1);assert.equal(JSON.stringify(c.fuelRecords),before);assert.equal(c.saves,undefined);
});
test('accepted update saves once while new and copy actions do not ask update confirmation',()=>{
 const {context:c}=harness(admin);let prompts=0;c.window.confirm=()=>{prompts++;return true};
 c.editRecord(0);c.saveRecord('update');assert.equal(prompts,1);assert.equal(c.saves,1);
 c.saveRecord('new');c.saveRecordAsNew();assert.equal(prompts,1);assert.equal(c.saves,3);
});

test('record notes preserve multiline text through create, edit and Save as New',()=>{
 const {context:c,element}=harness(admin);const notes='ملاحظات الرحلة\nMiXeD <text> & delivery';
 element('inputNotes').value=notes;c.saveRecord('new');const record=c.fuelRecords[0];assert.equal(record.notes,notes);
 c.editRecord(0);assert.equal(element('inputNotes').value,notes);
 element('inputNotes').value=notes+'\nUpdated';c.saveRecord('update');assert.equal(c.fuelRecords[0].notes,notes+'\nUpdated');
 c.editRecord(0);c.saveRecordAsNew();assert.equal(c.fuelRecords[0].notes,notes+'\nUpdated');assert.notEqual(c.fuelRecords[0]._syncId,c.fuelRecords[1]._syncId);
});
test('opening a legacy record clears notes left from another record',()=>{
 const {context:c,element}=harness(admin);element('inputNotes').value='Previous notes';c.editRecord(0);assert.equal(element('inputNotes').value,'');
});

test('edit confirmation defers writes and rechecks stale records and permissions',()=>{for(const failure of ['stale','permission']){const {context:c}=harness(admin);let confirm;c.showAuditEditConfirmation=(_before,_after,callback)=>confirm=callback;c.editRecord(0);c.saveRecord('update');assert.equal(c.saves,undefined);assert.equal(typeof confirm,'function');if(failure==='stale')c.fuelRecords[0].fuel=999;else c.currentPermissions=reader;confirm();assert.equal(c.saves,undefined);}});

test('missing required hidden site blocks both new save and Save as New without writes',()=>{
 const {context:c,element}=harness(admin);element('fuelPurchaseNone').checked=false;element('fuelPurchaseYes').checked=true;element('inputFuel').value='10';element('inputFuelCostPending').checked=true;c.saveRecord('new');c.saveRecordAsNew();
 assert.equal(c.saves,undefined);assert.equal(c.fuelRecords.length,1);assert.equal(element('fuelPurchaseError').hidden,false);assert.match(element('fuelPurchaseError').textContent,/Select a fuel station/);
 element('inputSite').value='QA SITE';c.saveRecord('new');assert.equal(c.saves,1);assert.equal(c.fuelRecords[0].site,'QA SITE');
});
test('native invalid fields stop both save paths before any data write',()=>{
 const {context:c,element}=harness(admin);let reports=0;element('fuelForm').checkValidity=()=>false;element('fuelForm').reportValidity=()=>reports++;
 c.saveRecord('new');c.saveRecordAsNew();assert.equal(c.saves,undefined);assert.equal(c.fuelRecords.length,1);assert.equal(reports,2);
});

test('purchase choice and positive liters and receipt total are validated without writes',()=>{
 const {context:c,element:e}=harness(admin);
 e('fuelPurchaseNone').checked=false;c.saveRecord('new');assert.match(e('fuelPurchaseError').textContent,/Select No refueling/);assert.equal(c.saves,undefined);
 e('fuelPurchaseYes').checked=true;e('inputSite').value='Station';e('inputFuel').value='0';c.saveRecord('new');assert.match(e('fuelPurchaseError').textContent,/quantity/);assert.equal(c.saves,undefined);
 e('inputFuel').value='10';e('inputTnxAuth').value='R1';e('inputFuelCost').value='0';c.saveRecord('new');assert.match(e('fuelPurchaseError').textContent,/positive receipt total/);assert.equal(c.saves,undefined);
 e('inputFuelCost').value='12.345';c.saveRecord('new');assert.equal(c.saves,1);assert.equal(c.fuelRecords[0].fuelCost,12.345);assert.equal(c.fuelRecords[0].fuel,10);
});
test('duplicate receipt and copying source purchase cannot create a second purchase',()=>{
 const {context:c,element:e}=harness(admin);
 e('fuelPurchaseNone').checked=false;e('fuelPurchaseYes').checked=true;
 for(const [id,value] of Object.entries({inputSite:'Station',inputFuel:'10',inputTnxAuth:'R1',inputFuelCost:'12.345',inputDateDisplay:'17/11/2026',inputCar:'Volvo'}))e(id).value=value;
 c.saveRecord('new');assert.equal(c.saves,1);c.saveRecord('new');assert.equal(c.saves,1);assert.match(e('fuelPurchaseError').textContent,/already recorded/);
 c.editRecord(0);c.saveRecordAsNew();assert.equal(c.saves,1);assert.match(e('fuelPurchaseError').textContent,/source record/);
 e('fuelPurchaseYes').checked=false;e('fuelPurchaseNone').checked=true;c.saveRecordAsNew();assert.equal(c.saves,2);assert.equal(c.fuelRecords[0].refuelingStatus,'none');assert.equal(c.fuelRecords[0].fuel,0);
});
test('pending purchase and optional odometer readings retain their validation',()=>{
 const {context:c,element:e}=harness(admin);e('fuelPurchaseNone').checked=false;e('fuelPurchaseYes').checked=true;e('inputSite').value='Station';e('inputFuel').value='10';e('inputFuelCostPending').checked=true;
 e('inputLastKm').value='100';e('inputCurrentKm').value='99';c.saveRecord('new');assert.equal(c.saves,undefined);assert.match(e('fuelPurchaseError').textContent,/ascending order/);
 e('inputCurrentKm').value='150';c.saveRecord('new');assert.equal(c.saves,1);assert.equal(c.fuelRecords[0].fuelCost,null);assert.equal(c.fuelRecords[0].lastKm,100);assert.equal(c.fuelRecords[0].currentKm,150);
});
