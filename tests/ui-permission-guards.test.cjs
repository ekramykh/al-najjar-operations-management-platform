'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
function harness(flags = {}, ready = true) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {value: id === 'editIndex' ? '-1' : '', style:{},classList:{add(){},remove(){}},checkValidity:()=>true,reportValidity(){}});
    return elements.get(id);
  };
  let id = 0;
  const context = {
    client: {}, permissionsReady: ready, currentPermissions: flags,
    $:element, window:{}, document:{getElementById:element,body:{classList:{add(){},remove(){}}}},
    alerts:[], alert(message){context.alerts.push(message)},
    fuelRecords:[{sn:1,_syncId:'existing',_syncUpdatedAt:'2026-10-11T00:00:00Z',date:'11/10/2026',fuel:1}],
    isDataDirty:false, driverPhonesMap:{}, currentSortColumn:'sn',currentSortDirection:'asc',
    formatDateDisplay:x=>x, formatTitleCase:x=>x,parseFlexibleDate:()=>null,
    checkInvoiceAmountWarning(){},confirmInvoiceAmountMinimum:()=>true,
    readTripDocuments:()=>[],loadTripDocuments(){},
    sortRecordsArray(){},filterAndRender(){},closeRecordModal(){},
    updateFormAndFilterDatalists(){},onDriverSelectionChange(){},
    promptPassword(_message,callback){context.passwordCallback=callback},
    confirm:()=>true,adminPassword:'unchanged',
  };
  context.window.confirm=()=>true;
  context.window.generateSyncId=()=>`new-${++id}`;
  context.window.saveToLocalStorage=()=>context.saves=(context.saves||0)+1;
  context.window.markFuelRecordDeleted=()=>context.deletions=(context.deletions||0)+1;
  vm.runInNewContext(html.slice(html.indexOf('    function tripDocumentSummary'),html.indexOf('    function readTripDocuments')),context);
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
  assert.equal(element('btnModalSubmit').disabled,true);
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
