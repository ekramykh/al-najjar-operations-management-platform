'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function bridge(connect){
 const el={disabled:false,addEventListener(){}};const c={window:{},$:()=>el,connect,
  permissionsReady:true,currentPermissions:{},pollTimer:null,status(){},message(){}};
 c.window.refreshFuelPermissionControls=()=>{};
 const start=html.indexOf('  let connectionAttempt = null;');
 vm.runInNewContext(html.slice(start,html.indexOf('  const permissionStatus',start)),c);
 return c;
}
test('connection double click returns one pending promise and starts only one attempt',async()=>{
 const d=deferred();let calls=0;const c=bridge(()=>{calls++;return d.promise});
 const a=c.window.connectFuelCloud(),b=c.window.connectFuelCloud();assert.equal(a,b);assert.equal(calls,1);
 d.resolve();await a;
});
test('real error is propagated and next connection can succeed',async()=>{
 let calls=0;const c=bridge(async()=>{if(++calls===1)throw Error('Actual server error')});
 await assert.rejects(c.window.connectFuelCloud(),/Actual server error/);
 await c.window.connectFuelCloud();assert.equal(calls,2);
});
function gate(connect){
 const element=()=>({value:'value',focus(){}});const c={email:element(),pass:element(),url:element(),key:element(),details:{},
  window:{connectFuelCloud:connect},unlocks:0,messages:[],status:m=>c.messages.push(m),loading(){},unlock:()=>c.unlocks++,
  document:{getElementById:()=>element()}};
 const start=html.indexOf('  let loginPending = false;');
 vm.runInNewContext(html.slice(start,html.indexOf('  btn.addEventListener',start))+'this.login=login;',c);return c;
}
test('login awaits current connection instead of rejecting old disconnected status',async()=>{
 const d=deferred();const c=gate(()=>d.promise);const p=c.login();
 assert.equal(c.unlocks,0);d.resolve();await p;assert.equal(c.unlocks,1);
 assert.equal(c.messages.some(m=>/Unable to connect/.test(m)),false);
});
test('Enter while signing in cannot trigger overlapping authentication',async()=>{
 const d=deferred();let calls=0;const c=gate(()=>{calls++;return d.promise});
 const p=c.login();await c.login();assert.equal(calls,1);d.resolve();await p;
});
test('failed attempt retains actual error and next login succeeds',async()=>{
 let calls=0;const c=gate(async()=>{if(++calls===1)throw Error('Permission denied')});
 await c.login();assert.equal(c.unlocks,0);assert.ok(c.messages.includes('Permission denied'));
 c.pass.value='retry';await c.login();assert.equal(c.unlocks,1);assert.equal(calls,2);
});
