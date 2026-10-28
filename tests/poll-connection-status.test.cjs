'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
function harness(){const pending=deferred();let tick;const c={client:{},permissionsReady:true,connectionGeneration:1,channel:null,pollTimer:null,cloudDirty:false,busy:false,document:{hidden:false},pullCloud:()=>pending.promise,setInterval:fn=>(tick=fn,1),clearInterval(){},states:[],messages:[],status:(...a)=>c.states.push(a),message:m=>c.messages.push(m)};const start=html.indexOf('  async function startRealtime()');vm.runInNewContext(html.slice(start,html.indexOf('  // Preserve the system',start)),c);return {c,pending,tick:()=>tick()};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('old polling rejection cannot mark a new connection as lost',async()=>{const h=harness();await h.c.startRealtime();h.tick();h.c.connectionGeneration++;h.c.states.push(['Connected & Synced']);h.pending.reject(Error('Account changed while a server request was pending.'));await settle();assert.equal(h.c.states.length,1);assert.equal(h.c.messages.length,0);});
test('old polling success cannot replace current account status',async()=>{const h=harness();await h.c.startRealtime();h.tick();h.c.connectionGeneration++;h.pending.resolve();await settle();assert.equal(h.c.states.length,0);});
test('current connection errors stay visible and a successful poll restores status',async()=>{const h=harness();await h.c.startRealtime();h.tick();h.pending.reject(Error('Network unavailable'));await settle();assert.equal(h.c.states.at(-1)[0],'Reconnecting...');assert.equal(h.c.messages.at(-1),'Network unavailable');h.c.pullCloud=async()=>{};h.tick();await settle();assert.equal(h.c.states.at(-1)[0],'Connected & Synced');});
test('connect cancels polling before awaiting sign in',()=>{const source=html.slice(html.indexOf('  async function connect()'),html.indexOf('  async function pullCloud'));assert.ok(source.indexOf('clearInterval(pollTimer)')<source.indexOf('signInWithPassword'));});
test('dirty offline save retries on a later poll after first reconnect request fails',async()=>{
 const h=harness();let attempts=0;h.c.cloudDirty=true;h.c.currentPermissions={can_add:true};h.c.currentSnapshot=()=>'{pending}';h.c.queueCloudWrite=async()=>{attempts++;if(attempts===1)throw Error('Failed to send a request to the Edge Function');h.c.cloudDirty=false;};
 await h.c.startRealtime();h.tick();await settle();assert.equal(attempts,1);assert.equal(h.c.cloudDirty,true);
 h.tick();await settle();assert.equal(attempts,2);assert.equal(h.c.cloudDirty,false);assert.equal(h.c.states.at(-1)[0],'Connected & Synced');assert.equal(h.c.messages.at(-1),'');
});
test('offline, busy, and unprivileged sessions do not start automatic writes',async()=>{
 for(const mode of ['offline','busy','reader']){const h=harness();h.c.cloudDirty=true;h.c.currentPermissions={can_add:mode!=='reader'};h.c.currentSnapshot=()=>'';let writes=0;h.c.queueCloudWrite=async()=>{writes++};if(mode==='offline')h.c.navigator={onLine:false};if(mode==='busy')h.c.busy=true;await h.c.startRealtime();h.tick();await settle();assert.equal(writes,0,mode);}
});
test('slow read prevents overlapping background requests until completion',async()=>{
 const h=harness();let calls=0;h.c.pullCloud=()=>{calls++;return h.pending.promise};await h.c.startRealtime();
 h.tick();h.tick();h.tick();await settle();assert.equal(calls,1);
 h.pending.resolve();await settle();h.c.pullCloud=async()=>{calls++};await h.tick();assert.equal(calls,2);
});
test('three consecutive transport failures become lost and success resets the counter',async()=>{
 const h=harness();h.c.pullCloud=async()=>{throw Error('Failed to fetch')};await h.c.startRealtime();
 await h.tick();assert.equal(h.c.states.at(-1)[0],'Reconnecting...');
 await h.tick();assert.equal(h.c.states.at(-1)[0],'Reconnecting...');
 await h.tick();assert.equal(h.c.states.at(-1)[0],'Connection lost');
 h.c.pullCloud=async()=>{};await h.tick();assert.equal(h.c.states.at(-1)[0],'Connected & Synced');
 h.c.pullCloud=async()=>{throw Error('Failed to fetch')};await h.tick();assert.equal(h.c.states.at(-1)[0],'Reconnecting...');
});
test('auth, permission and non-network errors are immediate and never treated as temporary connectivity',async()=>{
 for(const [code,label] of [[401,'Session expired'],[403,'Access denied'],[400,'Sync failed']]){
  const h=harness();h.c.pullCloud=async()=>{throw Object.assign(Error('Rejected'),{status:code})};await h.c.startRealtime();await h.tick();assert.equal(h.c.states.at(-1)[0],label);
 }
});
test('offline status is immediate and online alone cannot declare synchronization successful',async()=>{
 const h=harness();h.c.navigator={onLine:false};let calls=0;h.c.pullCloud=async()=>{calls++;throw Error('Network unavailable')};
 await h.c.startRealtime();await h.tick();assert.equal(calls,0);assert.equal(h.c.states.at(-1)[0],'Offline');
 h.c.navigator.onLine=true;await h.tick();assert.equal(calls,1);assert.equal(h.c.states.at(-1)[0],'Reconnecting...');
});
test('failed writes remain failed and dirty instead of becoming a reassuring reconnect message',async()=>{
 const h=harness();h.c.cloudDirty=true;h.c.currentPermissions={can_add:true};h.c.currentSnapshot=()=>'{pending}';h.c.queueCloudWrite=async()=>{throw Error('Failed to fetch')};
 await h.c.startRealtime();await h.tick();assert.equal(h.c.states.at(-1)[0],'Save failed');assert.equal(h.c.cloudDirty,true);
});
test('completion while offline cannot mark the device synchronized',async()=>{
 const h=harness();h.c.navigator={onLine:true};await h.c.startRealtime();h.tick();h.c.navigator.onLine=false;h.pending.resolve();await settle();assert.equal(h.c.states.at(-1)[0],'Offline');
});
