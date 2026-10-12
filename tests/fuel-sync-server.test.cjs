'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const source = fs.readFileSync('supabase/functions/fuel-sync/index.ts', 'utf8');
function harness(role, initial=[]) {
  let records = structuredClone(initial), revision = 'rev0', saves = 0;
  const user = { id: 'test-user', email: 'test@example.invalid' };
  const permissions = role;
  const query = (table) => {
    const q = {
      select() { return q; }, eq() { return q; },
      async maybeSingle() {
        if (table === 'app_user_permissions') return { data: permissions, error: null };
        return { data: records.length || saves ? {records: structuredClone(records),updated_at:revision} : null, error:null };
      },
      insert(data) { records=structuredClone(data.records);revision=data.updated_at;saves++;return Promise.resolve({error:null}); },
      update(data) {
        const original = revision;
        return {
          eq() { return this; },select() { return this; },
          async maybeSingle() {
            if(original!==revision) return {data:null,error:null};
            records=structuredClone(data.records);revision=data.updated_at;saves++;
            return {data:{updated_at:revision},error:null};
          }
        };
      }
    };
    return q;
  };
  const createClient = (_url,key) => key==='anon'
    ? {auth:{getUser:async token => token==='valid' ? {data:{user},error:null}:{data:{user:null},error:{message:'invalid'}}}}
    : {from:query,auth:{admin:{}}};
  let handler;
  const stripped=stripTypeScriptTypes(source.replace(/^import \{ createClient \} from .*;\s*/m,''));
  vm.runInNewContext(stripped.replace('Deno.serve(async (req: Request) => {','Deno.serve(async (req: Request) => {'),{
    createClient,
    Deno:{env:{get:key=>({SUPABASE_URL:'https://staging.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'}[key])},serve:fn=>{handler=fn;}},
    Response,Date,Map,Set,JSON,Number,String,Array,RegExp,
  });
  return {
    request:async (action,token='valid')=>{
      const res=await handler(new Request('https://staging.invalid/functions/v1/fuel-sync',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(action)}));
      return {status:res.status,body:await res.json()};
    },
    state:()=>({records,saves})
  };
}
const admin={can_read:true,can_add:true,can_edit:true,can_delete:true,can_manage_users:true};
const addOnly={can_read:true,can_add:true,can_edit:false,can_delete:false,can_manage_users:false};
const reader={can_read:true,can_add:false,can_edit:false,can_delete:false,can_manage_users:false};
const time1='2026-10-10T10:00:00.000Z',time2='2026-10-10T11:00:00.000Z';
const row=(id,sn,time,extra={})=>({_syncId:id,sn,_syncUpdatedAt:time,...extra});

test('unauthenticated requests cannot read records',async()=>{
  const h=harness(admin,[row('a',1,time1)]);
  const r=await h.request({action:'read'},'invalid');
  assert.equal(r.status,401);
});
test('unassigned user cannot access records',async()=>{
  const h=harness(null);
  assert.equal((await h.request({action:'read'})).status,403);
});
test('reader may read but cannot sync changes',async()=>{
  const h=harness(reader,[row('a',1,time1)]);
  assert.equal((await h.request({action:'read'})).status,200);
  assert.equal((await h.request({action:'sync',records:[row('b',2,time2)]})).status,403);
  assert.equal(h.state().saves,0);
});
test('add-only can add but cannot edit or delete',async()=>{
  const h=harness(addOnly,[row('a',1,time1)]);
  assert.equal((await h.request({action:'sync',records:[row('b',2,time2)]})).status,200);
  assert.equal((await h.request({action:'sync',records:[row('a',1,time2,{value:'edited'})]})).status,403);
  assert.equal((await h.request({action:'sync',records:[row('a',1,time2,{_deleted:true})]})).status,403);
  assert.equal(h.state().records.length,2);
});
test('admin can add, edit and delete with tombstones',async()=>{
  const h=harness(admin);
  assert.equal((await h.request({action:'sync',records:[row('a',1,time1)]})).status,200);
  assert.equal((await h.request({action:'sync',records:[row('a',1,time2,{value:'changed'})]})).status,200);
  assert.equal((await h.request({action:'sync',records:[row('a',1,'2026-10-10T12:00:00.000Z',{_deleted:true})]})).status,200);
  assert.equal(h.state().records[0]._deleted,true);
});
test('rejects stale overwrites and duplicate record numbers',async()=>{
  const h=harness(admin,[row('a',1,time2)]);
  assert.equal((await h.request({action:'sync',records:[row('a',1,time1,{value:'stale'})]})).status,409);
  assert.equal((await h.request({action:'sync',records:[row('b',1,time2)]})).status,409);
  assert.equal(h.state().saves,0);
});
test('rejects unknown tombstones and application settings',async()=>{
  const h=harness(admin);
  assert.equal((await h.request({action:'sync',records:[row('unknown',1,time2,{_deleted:true})]})).status,409);
  assert.equal((await h.request({action:'sync',records:[row('setting',1,time2,{_appSetting:'adminPassword'})]})).status,403);
});
test('unchanged snapshots do not write and remote-only records survive',async()=>{
  const h=harness(addOnly,[row('a',1,time1)]);
  assert.equal((await h.request({action:'sync',records:[row('a',1,time1)]})).status,200);
  assert.equal(h.state().saves,0);
  assert.equal((await h.request({action:'sync',records:[row('b',2,time2)]})).status,200);
  assert.deepEqual(h.state().records.map(x=>x._syncId).sort(),['a','b']);
});

test('two-device lifecycle retains twelve unrelated new business records and permanent deletion',async()=>{
  const protectedRows=Array.from({length:12},(_,i)=>row('today-'+i,100+i,time1,{value:'business-'+i}));
  const h=harness(admin,protectedRows);
  // Both simulated devices access the same server handler/storage.
  const first=await h.request({action:'sync',records:[row('temporary',500,time1)]});
  assert.equal(first.status,200);
  const device2=await h.request({action:'read'});
  assert.ok(device2.body.data.records.some(r=>r._syncId==='temporary'));
  assert.equal((await h.request({action:'sync',records:[row('temporary',500,time2,{value:'edited-on-device-2'})]})).status,200);
  const device1=await h.request({action:'read'});
  assert.equal(device1.body.data.records.find(r=>r._syncId==='temporary').value,'edited-on-device-2');
  assert.equal((await h.request({action:'sync',records:[row('temporary',500,'2026-10-10T12:00:00Z',{_deleted:true})]})).status,200);
  const deleted=await h.request({action:'read'});
  assert.equal(deleted.body.data.records.find(r=>r._syncId==='temporary')._deleted,true);
  assert.equal((await h.request({action:'sync',records:[row('temporary',500,'2026-10-10T13:00:00Z')]})).status,409);
  assert.deepEqual(h.state().records.filter(r=>r._syncId.startsWith('today-')),protectedRows);
  assert.equal(h.state().records.length,13);
});

test('multiple invoice documents survive server add edit read and deletion with permissions',async()=>{
 const h=harness(admin);
 const row={sn:1,_syncId:'multi',_syncUpdatedAt:'2026-10-12T00:00:00Z',tripDocuments:[
 {invoiceNumber:'A',invoiceAmount:300,branch:'TURAYF BRANCH',deliveryNumber:'D1'},
 {invoiceNumber:'B',invoiceAmount:700,branch:'BARKAH BRANCH',deliveryNumber:'D2'}]};
 assert.equal((await h.request({action:'sync',records:[row]})).status,200);
 const changed={...row,_syncUpdatedAt:'2026-10-12T00:00:01Z',tripDocuments:structuredClone(row.tripDocuments)};
 changed.tripDocuments[1].invoiceAmount=750;
 assert.equal((await h.request({action:'sync',records:[changed]})).status,200);
 const read=await h.request({action:'read'});assert.deepEqual(read.body.data.records[0].tripDocuments,changed.tripDocuments);
 const restricted=harness(addOnly,[changed]);assert.equal((await restricted.request({action:'sync',records:[{...changed,_syncUpdatedAt:'2026-10-12T00:00:02Z',tripDocuments:[]}]})).status,403);
 assert.equal((await h.request({action:'sync',records:[{...changed,_deleted:true,_syncUpdatedAt:'2026-10-12T00:00:02Z'}]})).status,200);
 assert.equal(h.state().records[0]._deleted,true);
});
