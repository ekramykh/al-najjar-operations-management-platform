'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
function connection({session={user:{id:'verified'}},sessionError=null,user={id:'verified'},userError=null,readError=null,permissions={can_read:true},actor={id:'verified'}}={}){
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:true,open:false});return elements.get(id)};
 el('cloudUrl').value='https://configured.invalid';el('cloudKey').value='public';
 const calls=[];
 const client={auth:{async getSession(){calls.push('session');return {data:{session},error:sessionError}},async getUser(){calls.push('verify');return {data:{user},error:userError}}}};
 const c={profileSaveBusy:false,connectionGeneration:0,pollTimer:null,resetPermissionEditor(){},permissionsReady:false,currentPermissions:null,client:null,clientConnectionSignature:null,
 window:{supabase:{createClient(){calls.push('client');return client}},fuelStorageGuard:{async prepare(){},setting(){}},refreshFuelPermissionControls(){}},$:el,
 FUEL_PRODUCTION_URL:'https://configured.invalid',FUEL_PRODUCTION_PUBLIC_KEY:'public',FUEL_STAGING_URL:'https://configured.invalid',FUEL_STAGING_PUBLIC_KEY:'public',
 async signInWithExactEmail(){calls.push('password');return {data:{session,user},error:null}},headerSignedInUser:null,
 async invokeFuelSync(action){calls.push(action);if(readError)throw readError;return {permissions,actor,data:{records:[]}}},
 async initializeCloudData(){calls.push('initialize')},async startRealtime(){calls.push('poll')},status(){},message(){},navigator:{onLine:true},clearInterval(){calls.push('clear')}
 };
 const a=html.indexOf('  async function connect('),b=html.indexOf('  async function pullCloud',a);vm.runInNewContext(html.slice(a,b),c);
 return {c,calls,client,el};
}
test('saved session is validated online and permission checked before initialization and readiness',async()=>{
 const {c,calls}=connection();const hold=deferred();c.invokeFuelSync=async()=>{calls.push('read');return hold.promise};
 const pending=c.connect({restoreSession:true});await new Promise(setImmediate);assert.equal(c.permissionsReady,false);assert.deepEqual(calls,['client','session','verify','read']);
 hold.resolve({permissions:{can_read:true},actor:{id:'verified'}});assert.equal(await pending,true);assert.equal(c.permissionsReady,true);assert.deepEqual(calls,['client','session','verify','read','initialize','poll']);
});
test('no saved session returns to manual sign in without reading or initializing records',async()=>{
 const {c,calls}=connection({session:null});assert.equal(await c.connect({restoreSession:true}),false);assert.equal(c.permissionsReady,false);assert.deepEqual(calls,['client','session']);
});
test('invalid, expired, offline and mismatched saved sessions cannot initialize data',async()=>{
 for(const options of [{sessionError:Error('Expired refresh token')},{userError:Error('Failed to fetch')},{user:null},{user:{id:'other'}}]){
  const {c,calls}=connection(options);await assert.rejects(c.connect({restoreSession:true}));assert.equal(c.permissionsReady,false);assert.ok(!calls.includes('read'));assert.ok(!calls.includes('initialize'));
 }
});
test('server rejection, removed read permission or actor mismatch blocks restore',async()=>{
 for(const options of [{readError:Error('Access denied')},{permissions:{can_read:false}},{actor:{id:'other'}}]){
  const {c,calls}=connection(options);await assert.rejects(c.connect({restoreSession:true}));assert.equal(c.permissionsReady,false);assert.ok(!calls.includes('initialize'));assert.ok(!calls.includes('poll'));
 }
});
test('signout during online session verification prevents later permission reads',async()=>{
 const {c,client,calls}=connection();const hold=deferred();client.auth.getUser=()=>hold.promise;
 const p=c.connect({restoreSession:true});await new Promise(setImmediate);c.connectionGeneration++;hold.resolve({data:{user:{id:'verified'}},error:null});
 await assert.rejects(p,/Connection changed/);assert.equal(c.permissionsReady,false);assert.ok(!calls.includes('read'));
});
test('manual login retains fresh email/password requirement and exact-email sign in',async()=>{
 const {c,el,calls}=connection();await assert.rejects(c.connect(),/email, and password/);assert.ok(!calls.includes('password'));
 el('cloudEmail').value='User@example.invalid';el('cloudPassword').value='test-only';assert.equal(await c.connect(),true);assert.ok(calls.includes('password'));assert.ok(!calls.includes('session'));
});
function gate(restore){
 const els=new Map(),listeners=new Map();let locked=false;
 const el=id=>{if(!els.has(id))els.set(id,{value:'',style:{},classList:{toggle(){}},setAttribute(){},removeAttribute(){},focus(){},querySelector(){return null},addEventListener(type,fn){listeners.set(id+':'+type,fn)}});return els.get(id)};
 const c={window:{restoreFuelCloudSession:restore},FUEL_PRODUCTION_URL:'https://configured.invalid',FUEL_PRODUCTION_PUBLIC_KEY:'public',FUEL_STAGING_URL:'https://configured.invalid',FUEL_STAGING_PUBLIC_KEY:'public',setTimeout(){},document:{getElementById:el,querySelector:()=>el('app'),documentElement:{classList:{add(){locked=true},remove(){locked=false}}}}};
 const a=html.indexOf('(() => {\n  const gate=document.getElementById("requiredCloudLoginGate")');vm.runInNewContext(html.slice(a,html.indexOf('</script>',a)),c);
 return {c,el,listeners,locked:()=>locked};
}
test('login gate stays locked while verifying and opens only on verified success',async()=>{
 const hold=deferred(),g=gate(()=>hold.promise);assert.equal(g.locked(),true);assert.equal(g.el('requiredCloudLoginButton').disabled,true);
 hold.resolve(true);await new Promise(setImmediate);assert.equal(g.locked(),false);assert.equal(g.el('requiredCloudLoginButton').disabled,false);
});
test('missing or rejected session leaves manual login enabled without exposing app',async()=>{
 for(const restore of [async()=>false,async()=>{throw Error('Network unavailable') }]){const g=gate(restore);await new Promise(setImmediate);assert.equal(g.locked(),true);assert.equal(g.el('requiredCloudLoginButton').disabled,false);}
});
test('signout while restoration is pending cannot reopen login gate afterward',async()=>{
 const hold=deferred(),g=gate(()=>hold.promise);g.listeners.get('cloudSignOut:click')();hold.resolve(true);await new Promise(setImmediate);assert.equal(g.locked(),true);
});
