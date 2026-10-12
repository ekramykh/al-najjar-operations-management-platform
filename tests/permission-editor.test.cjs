'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const admin={can_read:true,can_add:true,can_edit:true,can_delete:true,can_manage_users:true};
function harness(users){
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,disabled:false,hidden:false,handlers:{},addEventListener(event,fn){this.handlers[event]=fn},replaceChildren(){},appendChild(){},style:{}});return elements.get(id)};
 const c={currentPermissions:admin,connectionGeneration:1,$:el,window:{confirm:()=>true},setTimeout,clearTimeout,
 document:{createElement:()=>({style:{},appendChild(){},addEventListener(){}})},calls:[],users,
 invokeFuelSync:async(action,records,extra)=>{c.calls.push(extra);return extra.operation==='list'?{users:c.users}:{invited:false}}};
 el('cloudEmail').value='admin@example.com';
 vm.runInNewContext(html.slice(html.indexOf('  const permissionStatus ='),html.indexOf('  $("cloudSyncNow").addEventListener')),c);return {c,el};
}
test('existing email loads actual permissions, and another email clears stale checkboxes',async()=>{
 const {c,el}=harness([{email:'add@example.com',permissions:{can_read:true,can_add:true,can_edit:false}}]);
 el('permissionAdminEmail').value=' ADD@example.com ';await c.selectPermissionEmail();
 assert.equal(el('permissionCanAdd').checked,true);assert.equal(el('permissionCanEdit').checked,false);
 assert.equal(el('permissionAdminSave').disabled,false);assert.equal(el('permissionAdminInvite').hidden,false);assert.equal(el('permissionAdminInvite').disabled,true);
 el('permissionAdminEmail').value='new@example.com';await c.selectPermissionEmail();
 assert.equal(el('permissionCanAdd').checked,false);assert.equal(el('permissionCanRead').checked,true);
 assert.equal(el('permissionAdminSave').hidden,false);assert.equal(el('permissionAdminSave').disabled,true);assert.equal(el('permissionAdminInvite').disabled,false);
});
test('own administrator permissions display in full but cannot be changed or invited',async()=>{
 const {c,el}=harness([{email:'admin@example.com',permissions:admin}]);el('permissionAdminEmail').value='admin@example.com';await c.selectPermissionEmail();
 assert.equal(el('permissionCanManage').checked,true);assert.equal(el('permissionCanAdd').disabled,true);
 await c.savePermissionEditor(false);assert.equal(c.calls.filter(x=>x.operation!=='list').length,0);
});
test('existing permissions save uses selected flags and no invitation action can run',async()=>{
 const {c,el}=harness([{email:'add@example.com',permissions:{can_read:true,can_add:true}}]);el('permissionAdminEmail').value='add@example.com';await c.selectPermissionEmail();
 el('permissionCanEdit').checked=true;await c.savePermissionEditor(true);assert.equal(c.calls.length,1);
 await c.savePermissionEditor(false);const write=c.calls.find(x=>x.operation==='invite_or_assign');assert.equal(write.can_edit,true);assert.equal(write.email,'add@example.com');
});
test('cancelled invitation sends nothing; changed permissions prevent overwriting another administrator update',async()=>{
 const {c,el}=harness([]);el('permissionAdminEmail').value='new@example.com';await c.selectPermissionEmail();c.window.confirm=()=>false;
 await c.savePermissionEditor(true);assert.equal(c.calls.filter(x=>x.operation==='invite_or_assign').length,0);
 c.users=[{email:'new@example.com',permissions:{can_read:true}}];c.resetPermissionEditor();await c.selectPermissionEmail();
 c.users[0].permissions.can_edit=true;c.window.confirm=()=>true;await c.savePermissionEditor(false);
 assert.equal(c.calls.filter(x=>x.operation==='invite_or_assign').length,0);assert.match(el('permissionAdminStatus').textContent,/changed/);
});
test('reset button is enabled for existing accounts including self and confirmation cancellation sends nothing',async()=>{
 const {c,el}=harness([{email:'admin@example.com',permissions:admin}]);el('permissionAdminEmail').value='admin@example.com';await c.selectPermissionEmail();assert.equal(el('permissionAdminReset').disabled,false);
 c.window.confirm=()=>false;await el('permissionAdminReset').handlers.click();assert.equal(c.calls.some(x=>x.operation==='reset_password'),false);
 c.window.confirm=()=>true;await el('permissionAdminReset').handlers.click();const sent=c.calls.find(x=>x.operation==='reset_password');assert.equal(sent.email,'admin@example.com');assert.equal(sent.password,undefined);assert.equal(sent.can_read,undefined);
});
