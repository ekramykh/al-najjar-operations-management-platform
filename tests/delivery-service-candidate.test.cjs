'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root='operations/production-transfer/delivery-manage/';
function service({url='https://mykwxfifrjohhjhomegf.supabase.co',permission={can_read:true,can_add:true,can_edit:true,can_manage_users:true},invalid=false,rpcError=null,existing=null,lookupError=null}={}){
 let handler;const calls=[];
 const chain={select(){return this},eq(){return this},is(){return this},maybeSingle:async()=>({data:permission}),order(){return this},limit:async()=>({data:[]})};
 const admin={auth:{getUser:async()=>({data:{user:invalid?null:{id:'server-user',email:'server@example.invalid',user_metadata:{}}},error:invalid?Error('expired'):null})},from:name=>{calls.push(name);return name==='app_user_permissions'?chain:{...chain,maybeSingle:async()=>({data:existing,error:lookupError})}},storage:{from:()=>({upload:async()=>{calls.push('upload');return {error:null}}})},rpc:async(name,args)=>{calls.push({name,args});return {data:{revision:2},error:rpcError}}};
 const context={Response,Uint8Array,atob,crypto,createClient:()=>admin,validateEntity(){},deliveryPlaces:[],Deno:{env:{get:key=>key==='SUPABASE_URL'?url:'server-only-test-key'},serve:fn=>{handler=fn}}};
 vm.runInNewContext(fs.readFileSync(root+'index.ts','utf8').replace(/^import .*;\n/gm,''),context);
 return {calls,request:async(body,token='test')=>handler({method:'POST',headers:new Headers(token?{Authorization:'Bearer '+token}:{}),json:async()=>body})};
}
test('candidate refuses staging and hostname lookalikes before database access',async()=>{
 for(const url of ['https://lfmuxtnurxaanixxflwc.supabase.co','https://mykwxfifrjohhjhomegf.supabase.co.attacker.invalid']){
  const s=service({url});assert.equal((await s.request({action:'list'})).status,403);assert.equal(s.calls.length,0);
 }
});
test('missing or invalid session cannot access delivery tables',async()=>{
 for(const options of [{token:''},{invalid:true}]){const s=service(options);assert.equal((await s.request({action:'list'},options.token)).status,401);assert.equal(s.calls.length,0);}
});
test('server read permission is required',async()=>{
 const s=service({permission:{can_read:false,can_manage_users:true}});assert.equal((await s.request({action:'list'})).status,403);assert.deepEqual(s.calls,['app_user_permissions']);
});
const entity={action:'save',kind:'trip',id:'12345678-1234-1234-1234-123456789012',revision:0,data:{},reason:''};
const attachment={action:'proofUpload',id:entity.id,mime:'application/pdf',base64:btoa('%PDF-1.4')};
test('read-only lists with separate flags but cannot create, edit or upload',async()=>{
 const s=service({permission:{can_read:true}});
 const list=await s.request({action:'list'});assert.equal(list.status,200);const flags=await list.json();
 assert.equal(flags.canWrite,false);assert.equal(flags.canAdd,false);assert.equal(flags.canEdit,false);
 for(const body of [entity,{...entity,revision:1},attachment])assert.equal((await s.request(body)).status,403);
 assert(!s.calls.some(c=>typeof c==='object'||c==='upload'));
});
test('add-only creates orders and trips but cannot edit or upload to existing entries',async()=>{
 const permission={can_read:true,can_add:true,can_edit:false};
 for(const kind of ['order','trip']){
  const s=service({permission});const list=await (await s.request({action:'list'})).json();
  assert.equal(list.canAdd,true);assert.equal(list.canEdit,false);
  assert.equal((await s.request({...entity,kind,data:{tripIds:[]}})).status,200);
  assert.equal((await s.request({...entity,kind,revision:1})).status,403);
 }
 const fresh=service({permission});assert.equal((await fresh.request(attachment)).status,200);assert(fresh.calls.includes('upload'));
 const saved=service({permission,existing:{id:entity.id}});assert.equal((await saved.request(attachment)).status,403);assert(!saved.calls.includes('upload'));
});
test('edit-only cannot create or upload for new entries but can update existing entries',async()=>{
 const permission={can_read:true,can_add:false,can_edit:true};
 const s=service({permission});assert.equal((await s.request(entity)).status,403);
 assert.equal((await s.request({...entity,revision:1})).status,200);
 assert.equal((await s.request(attachment)).status,403);
 assert.equal((await service({permission,existing:{id:entity.id}}).request(attachment)).status,200);
});
test('administrator can create and edit and upload for new and existing entries',async()=>{
 for(const existing of [null,{id:entity.id}]){
  const s=service({existing});assert.equal((await s.request({...entity,revision:existing?1:0})).status,200);
  assert.equal((await s.request(attachment)).status,200);
 }
});
test('permission and entity lookup failures fail closed before attachment storage',async()=>{
 const s=service({lookupError:Error('lookup failed')});assert.equal((await s.request(attachment)).status,400);assert(!s.calls.includes('upload'));
});
test('forged zero revision still reaches transaction as create and cannot bypass revision conflict',async()=>{
 const s=service({permission:{can_read:true,can_add:true},rpcError:Error('Delivery changed on another device. Reload before saving.')});
 const r=await s.request(entity);assert.equal(r.status,400);assert.match((await r.json()).error,/another device/);
 const sql=fs.readFileSync('operations/production-transfer/delivery-schema.sql','utf8');assert.match(sql,/oldrow.revision<>p_revision/);
});
test('administrator save attributes actor to verified session and passes revision to transaction',async()=>{
 const s=service();const response=await s.request({action:'save',kind:'trip',id:'entity',revision:1,data:{},reason:'Correction',actor:'forged'});
 assert.equal(response.status,200);const rpc=s.calls.find(c=>typeof c==='object');assert.equal(rpc.args.p_actor,'server-user');assert.equal(rpc.args.p_email,'server@example.invalid');assert.equal(rpc.args.p_revision,1);
});
test('stale revision rejection is returned without reporting a successful save',async()=>{
 const s=service({rpcError:Error('Delivery changed on another device. Reload before saving.')});
 const response=await s.request({action:'save',kind:'trip',id:'entity',revision:1,data:{},reason:'Correction'});
 assert.equal(response.status,400);assert.match((await response.json()).error,/another device/);
});
test('production candidate retains published validation and all behavior except project guard',()=>{
 for(const file of ['validate.js','places.js'])assert.equal(fs.readFileSync(root+file,'utf8'),fs.readFileSync('supabase/functions/delivery-manage/'+file,'utf8'));
 const candidate=fs.readFileSync(root+'index.ts','utf8').replace('// Production deployment candidate only; not deployed. Exact project boundary.','// This development service must never serve another project.').replace("if(url!=='https://mykwxfifrjohhjhomegf.supabase.co')return reply(403,{error:'Production project required.'});","if(!url?.includes('lfmuxtnurxaanixxflwc.supabase.co'))return reply(403,{error:'Staging service only.'});");
 assert.equal(candidate,fs.readFileSync('supabase/functions/delivery-manage/index.ts','utf8'));
});

test('only full administrators can delete a delivery order', async () => {
 const full = {can_read:true, can_add:true, can_edit:true, can_delete:true, can_manage_users:true};
 const request = {action:'delete', id:entity.id, revision:1};
 for (const key of Object.keys(full)) {
  const client = service({permission:{...full, [key]:false}});
  assert.equal((await client.request(request)).status,403);
  assert(!client.calls.some(call=>typeof call==='object'));
 }
 const client = service({permission:full});
 assert.equal((await client.request(request)).status,200);
 assert.deepEqual(JSON.parse(JSON.stringify(client.calls.at(-1))),{name:'delivery_delete_order',args:{
  p_id:entity.id,p_revision:1,p_actor:'server-user',p_email:'server@example.invalid'
 }});
});
