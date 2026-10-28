'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const source = fs.readFileSync('supabase/functions/fuel-sync/index.ts', 'utf8');
function harness(role, initial=[], options={}) {
  const resetRequests=[],audit=[];
  let records = structuredClone(initial), revision = 'rev0', saves = 0;
  const user = { id: 'test-user', email: 'test@example.invalid' };
  const permissions = role;
  const query = (table) => {
    const q = {
      select() { return q; }, eq() { return q; }, order(){return q;},limit(){return q;},async range(){return {data:audit,error:null}},async in(_key,ids){return {data:audit.filter(e=>ids.includes(e.event_id)),error:null}},
      async maybeSingle() {
        if (table === 'app_user_permissions') return { data: permissions, error: null };
        if(table === 'fuel_record_audit') return {data:audit.find(e=>e.operation==='create') || null,error:null};
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
    : {from:query,rpc:async(_name,p)=>{if(options.commitError)return {data:null,error:{message:'atomic failure'}};if(p.p_expected!== (records.length||saves?revision:null))return {data:null,error:null};records=structuredClone(p.p_records);revision=new Date().toISOString();audit.push(...p.p_events);saves++;return {data:{updated_at:revision},error:null}},auth:{admin:{listUsers:async()=>({data:{users:options.users || []},error:null})},resetPasswordForEmail:async(email,settings)=>{resetRequests.push({email,settings});return {error:options.resetError || null}}}};
  let handler;
  const stripped=stripTypeScriptTypes(source.replace(/^import \{ createClient \} from .*;\s*/m,''));
  vm.runInNewContext(stripped.replace('Deno.serve(async (req: Request) => {','Deno.serve(async (req: Request) => {'),{
    createClient,
    Deno:{env:{get:key=>({SUPABASE_URL:'https://staging.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',FUEL_PASSWORD_RESET_REDIRECT_URL:options.resetRedirect}[key])},serve:fn=>{handler=fn;}},
    Response,Date,Map,Set,JSON,Number,String,Array,RegExp,URL,crypto:require('node:crypto').webcrypto,
  });
  return {
    request:async (action,token='valid')=>{
      if(action.action==='sync' && !Object.hasOwn(action,'audit_events')) {
        const business=r=>r?Object.fromEntries(Object.entries(r).filter(([k])=>!k.startsWith('_')&&!['sn','dayVal','kmDay','difference'].includes(k))):null;
        action={...action,audit_events:(action.records||[]).filter(r=>!r._deleted).filter(r=>{const old=records.find(o=>o._syncId===r._syncId);return !old || JSON.stringify(old)!==JSON.stringify(r)}).map(r=>({event_id:require('node:crypto').randomUUID(),record_id:r._syncId,actor_id:user.id,reason:'Test correction',before:business(records.find(o=>o._syncId===r._syncId)),after:business(r)}))};
      }
      const res=await handler(new Request('https://staging.invalid/functions/v1/fuel-sync',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(action)}));
      return {status:res.status,body:await res.json()};
    },
    state:()=>({records,saves,resetRequests,audit})
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

test('password reset requires administrator and sends no email without approved hosting',async()=>{
 for(const role of [reader,addOnly]){const h=harness(role);assert.equal((await h.request({action:'manage_users',operation:'reset_password',email:'user@example.com'})).status,403);assert.equal(h.state().resetRequests.length,0)}
 const h=harness(admin);assert.equal((await h.request({action:'manage_users',operation:'password_reset_status'})).body.ready,false);
 assert.equal((await h.request({action:'manage_users',operation:'reset_password',email:'user@example.com'})).status,503);assert.equal(h.state().resetRequests.length,0);
});
test('reset link uses server-approved URL and public key, never changes records or permissions or sets password',async()=>{
 const initial=[row('a',1,time1)];const h=harness(admin,initial,{resetRedirect:'https://staging.example.com/password-reset.html',users:[{id:'target',email:'user@example.com'}]});
 const response=await h.request({action:'manage_users',operation:'reset_password',email:' USER@example.com ',password:'never-use-this',redirect_to:'https://attacker.invalid'});
 assert.equal(response.status,200);const state=h.state();assert.equal(state.saves,0);assert.deepEqual(state.records,initial);assert.equal(state.resetRequests.length,1);
 const request=state.resetRequests[0];assert.equal(request.email,'user@example.com');const redirect=new URL(request.settings.redirectTo);assert.equal(redirect.origin,'https://staging.example.com');assert.equal(redirect.searchParams.get('public_key'),'anon');assert.ok(!request.settings.redirectTo.includes('service'));
});
test('nonexistent account and provider failure report errors instead of false reset success',async()=>{
 const opts={resetRedirect:'https://staging.example.com/password-reset.html'};const h=harness(admin,[],opts);assert.equal((await h.request({action:'manage_users',operation:'reset_password',email:'missing@example.com'})).status,404);assert.equal(h.state().resetRequests.length,0);
 const failed=harness(admin,[],{...opts,users:[{id:'u',email:'user@example.com'}],resetError:{status:429}});assert.equal((await failed.request({action:'manage_users',operation:'reset_password',email:'user@example.com'})).status,429);
});

test('missing edit reason cannot bypass the server',async()=>{const h=harness(admin,[row('a',1,time1,{fuel:10})]);const r=await h.request({action:'sync',records:[row('a',1,time2,{fuel:20})],audit_events:[]});assert.equal(r.status,409);assert.equal(h.state().saves,0);});
test('every offline edit is logged; verified actor replaces client name',async()=>{const a=row('a',1,time1,{fuel:10}),b=row('a',1,time2,{fuel:30}),h=harness(admin,[a]);const r=await h.request({action:'sync',records:[b],audit_events:[{event_id:'edit-1',record_id:'a',actor_id:'test-user',actor_label:'FAKE',reason:'First correction',before:{fuel:10},after:{fuel:20}},{event_id:'edit-2',record_id:'a',actor_id:'test-user',reason:'Second correction',before:{fuel:20},after:{fuel:30}}]});assert.equal(r.status,200);assert.equal(h.state().audit.length,2);assert.equal(h.state().audit[0].actor_email,'test@example.invalid');assert.equal(h.state().audit[0].before_data.fuel,10);assert.equal(h.state().audit[1].after_data.fuel,30);});
test('audit failure prevents saving business data',async()=>{const h=harness(admin,[row('a',1,time1,{fuel:10})],{commitError:true});const r=await h.request({action:'sync',records:[row('a',1,time2,{fuel:20})]});assert.equal(r.status,500);assert.equal(h.state().records[0].fuel,10);assert.equal(h.state().audit.length,0);});
test('reader can access history but cannot create an edit',async()=>{const h=harness(reader,[row('a',1,time1)]);assert.equal((await h.request({action:'audit',record_id:'a'})).status,200);assert.equal((await h.request({action:'sync',records:[row('a',1,time2)]})).status,403);});
test('mismatched before/after chain and another account are rejected',async()=>{for(const [before,actor] of [[{fuel:99},'test-user'],[{fuel:10},'someone-else']]){const h=harness(admin,[row('a',1,time1,{fuel:10})]);const r=await h.request({action:'sync',records:[row('a',1,time2,{fuel:20})],audit_events:[{event_id:'bad',record_id:'a',actor_id:actor,reason:'Correction',before,after:{fuel:20}}]});assert.equal(r.status,409);assert.equal(h.state().saves,0)}});
test('offline creation followed by deletion preserves both events without creating a live record',async()=>{const h=harness(admin);const r=await h.request({action:'sync',records:[{_syncId:'offline-only',_deleted:true,_syncUpdatedAt:time2}],audit_events:[{event_id:'offline-create',record_id:'offline-only',record_sn:1,actor_id:'test-user',reason:'Initial record creation',before:null,after:{fuel:10}},{event_id:'offline-delete',record_id:'offline-only',record_sn:1,actor_id:'test-user',reason:'Authorized deletion',before:{fuel:10},after:null}]});assert.equal(r.status,200);assert.equal(h.state().audit.length,2);assert.equal(h.state().audit[1].operation,'delete');assert.equal(h.state().records[0]._deleted,true)});

test('audit keeps per-operation profile name but derives account identity from authentication',async()=>{const h=harness(admin);const record={_syncId:'name-test',sn:123,fuel:10};const r=await h.request({action:'sync',records:[record],audit_events:[{event_id:'name-event',record_id:'name-test',actor_id:'test-user',actor_email:'forged@example.invalid',actor_name:'Saved Name',reason:'Initial record creation',before:null,after:{fuel:10}}]});assert.equal(r.status,200);const event=h.state().audit[0];assert.equal(event.actor_name,'Saved Name');assert.equal(event.actor_email,'test@example.invalid');assert.equal(event.actor_id,'test-user');});
