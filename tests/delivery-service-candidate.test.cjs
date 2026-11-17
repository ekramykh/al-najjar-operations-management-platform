'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root='operations/production-transfer/delivery-manage/';
function service({url='https://mykwxfifrjohhjhomegf.supabase.co',permission={can_read:true,can_manage_users:true},invalid=false,rpcError=null}={}){
 let handler;const calls=[];
 const chain={select(){return this},eq(){return this},maybeSingle:async()=>({data:permission}),order(){return this},limit:async()=>({data:[]})};
 const admin={auth:{getUser:async()=>({data:{user:invalid?null:{id:'server-user',email:'server@example.invalid',user_metadata:{}}},error:invalid?Error('expired'):null})},from:name=>{calls.push(name);return chain},rpc:async(name,args)=>{calls.push({name,args});return {data:{revision:2},error:rpcError}}};
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
test('reader and add-only roles can list but cannot save or upload under current delivery policy',async()=>{
 for(const can_add of [false,true]){
  const s=service({permission:{can_read:true,can_manage_users:false,can_add}});
  const list=await s.request({action:'list'});assert.equal(list.status,200);assert.equal((await list.json()).canWrite,false);
  for(const action of ['save','proofUpload'])assert.equal((await s.request({action})).status,403);
  assert(!s.calls.some(c=>typeof c==='object'));
 }
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
