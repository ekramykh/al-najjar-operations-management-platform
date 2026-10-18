'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('password-reset.html','utf8');const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
function harness(options={}){
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:'',disabled:true,textContent:'',addEventListener(event,fn){this[event]=fn}});return elements.get(id)};
 const updates=[],signouts=[];let config,cleaned=false;
 const auth={getSession:async()=>({data:{session:options.expired?null:{}},error:null}),getUser:async()=>({data:{user:{email:'user@example.com'}},error:null}),updateUser:async body=>{updates.push(body);return {error:options.saveError||null}},signOut:async body=>signouts.push(body.scope)};
 const c={document:{getElementById:el},URLSearchParams,location:{search:'?project_url=https%3A%2F%2Flfmuxtnurxaanixxflwc.supabase.co&public_key=anon',hash:options.hash ?? (options.invalid?'':'#type=recovery&access_token=test'),pathname:'/password-reset.html'},history:{replaceState(){cleaned=true}},window:{supabase:{createClient(_url,_key,settings){config=settings;return {auth}}}}};
 vm.runInNewContext(script+'\nthis.ready=passwordRecoveryReady;',c);return {c,el,updates,signouts,settings:()=>config,cleaned:()=>cleaned};
}
test('recovery session is isolated from application login and rejects expired or absent link',async()=>{
 for(const options of [{invalid:true},{expired:true}]){const h=harness(options);await h.c.ready;assert.equal(h.el('saveNewPassword').disabled,true);assert.equal(h.updates.length,0);assert.equal(h.cleaned(),true)}
 const h=harness();await h.c.ready;assert.equal(h.settings().auth.persistSession,false);assert.equal(h.el('saveNewPassword').disabled,false);
});
test('password validation stops short or mismatched passwords and confirmed update clears fields',async()=>{
 const h=harness();await h.c.ready;const submit=()=>h.el('passwordResetForm').submit({preventDefault(){}});
 h.el('newPassword').value='short';await submit();assert.equal(h.updates.length,0);
 h.el('newPassword').value='New-test-123';h.el('confirmPassword').value='different';await submit();assert.equal(h.updates.length,0);
 h.el('confirmPassword').value='New-test-123';await submit();assert.equal(h.updates.length,1);assert.equal(h.el('newPassword').value,'');assert.equal(h.el('confirmPassword').value,'');assert.deepEqual(h.signouts,['local']);assert.equal(h.el('saveNewPassword').disabled,true);
});
test('provider error never reports password saved and permits retry',async()=>{
 const h=harness({saveError:new Error('Password policy rejected')});await h.c.ready;h.el('newPassword').value=h.el('confirmPassword').value='New-test-123';await h.el('passwordResetForm').submit({preventDefault(){}});
 assert.equal(h.el('saveNewPassword').disabled,false);assert.match(h.el('resetStatus').textContent,/policy/);assert.equal(h.signouts.length,0);
});

test('used email link shows expiry rather than misleading configuration error',async()=>{
 const h=harness({hash:'#error=access_denied&error_code=otp_expired'});await h.c.ready;assert.match(h.el('resetStatus').textContent,/expired or already used/);assert.equal(h.el('saveNewPassword').disabled,true);assert.equal(h.updates.length,0);
});
