'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('  function queueCloudWrite(snapshot)'),html.indexOf('  async function connect()'));
function harness(invoke){
  const c={client:{},connectionGeneration:1,cloudWriteQueue:Promise.resolve(),busy:false,localWriteRevision:0,
    cloudDirty:false,lastSaved:'',rows:[{_syncId:'a',sn:1,value:'initial'}],
    setCloudDirty:v=>c.cloudDirty=v,status(){},message(){},
    normalizeRecordsForSync:rows=>structuredClone(rows),currentSnapshotRecords:()=>c.rows,
    currentSnapshot:()=>JSON.stringify(c.rows),stableRecordKey:r=>r._syncId,
    recordChanged:(a,b)=>JSON.stringify(a)!==JSON.stringify(b),
    mergeRecordSets:(local,remote)=>{const m=new Map(remote.map(r=>[r._syncId,r]));local.forEach(r=>m.set(r._syncId,r));return [...m.values()]},
    persistMergedRecords:rows=>{c.rows=rows;return JSON.stringify(rows)},setRemoteBaseline(){},
    invokeFuelSync:(...args)=>invoke(c,...args),
  };
  vm.runInNewContext(source,c);return c;
}
test('queued save is cancelled if the signed-in account changes before it starts',async()=>{
  let calls=0;const c=harness(async()=>{calls++;return {}});
  const promise=c.queueCloudWrite('unused');c.connectionGeneration++;
  await assert.rejects(promise,/Account changed/);assert.equal(calls,0);assert.equal(c.cloudDirty,true);
});
test('server response cannot erase a newer local save while a request is pending',async()=>{
  const c=harness(async(ctx,action,rows)=>{
    if(action==='read')return {data:{records:[]}};
    ctx.rows=[...ctx.rows,{_syncId:'b',sn:2,value:'newer'}];ctx.localWriteRevision++;
    return {data:{records:rows,updated_at:'revision'}};
  });
  await c.queueCloudWrite('unused');
  assert.deepEqual(c.rows.map(r=>r._syncId),['a','b']);assert.equal(c.cloudDirty,true);
});
test('unchanged snapshot uses authorized read without attempting a write',async()=>{
  const actions=[];const c=harness(async(ctx,action)=>{
    actions.push(action);return {data:{records:structuredClone(ctx.rows),updated_at:'revision'}};
  });
  await c.queueCloudWrite('unused');assert.deepEqual(actions,['read']);assert.equal(c.cloudDirty,false);
});
test('real HTTP 409 retries after another read and keeps local change',async()=>{
  let reads=0,writes=0;const c=harness(async(ctx,action,rows)=>{
    if(action==='read'){reads++;return {data:{records:[]}}}
    if(++writes===1){const e=new Error('Stale record version.');e.status=409;throw e}
    return {data:{records:rows,updated_at:'revision'}};
  });
  await c.queueCloudWrite('unused');assert.equal(reads,2);assert.equal(writes,2);assert.equal(c.rows[0].value,'initial');
});

 test('acknowledged records sorted for display leave the device clean', async()=>{
  const c=harness(async(ctx)=>({data:{records:[{_syncId:'a',sn:1},{_syncId:'b',sn:2}],updated_at:'revision'}}));
  const persistSource=html.slice(html.indexOf('  const persistMergedRecords = records => {'),html.indexOf('  const recoveryBaselineRecords'));
  Object.assign(c,{deletedSyncIds:new Map(),fuelRecords:[],ADMIN_PASSWORD_SYNC_ID:'password',
    localStorage:{setItem(){}},DELETED_SYNC_IDS_KEY:'deleted',window:{},
    currentSortColumn:'sn',currentSortDirection:'desc',
    sortRecordsArray:rows=>rows.sort((a,b)=>b.sn-a.sn),console});
  vm.runInNewContext(persistSource+'\nthis.persistMergedRecords=persistMergedRecords;',c);
  c.currentSnapshotRecords=()=>c.fuelRecords;
  c.currentSnapshot=()=>JSON.stringify(c.fuelRecords);
  await c.queueCloudWrite('unused');
  assert.equal(c.cloudDirty,false);
  assert.deepEqual(Array.from(c.fuelRecords,r=>r.sn),[2,1]);
  assert.equal(c.lastSaved,c.currentSnapshot());
 });

test('a successful retry clears the old network failure without losing pending rows',async()=>{
 let networkDown=true;const messages=[],states=[];
 const c=harness(async(ctx,action,rows)=>{if(networkDown)throw Error('Failed to send a request to the Edge Function');return {data:{records:action==='read'?[]:rows,updated_at:'recovered'}}});
 c.message=m=>messages.push(m);c.status=s=>states.push(s);
 await assert.rejects(c.queueCloudWrite('unused'),/Failed to send/);
 assert.equal(c.cloudDirty,true);assert.equal(c.rows[0].value,'initial');assert.match(messages.at(-1),/Sync failed/);
 networkDown=false;await c.queueCloudWrite('unused');
 assert.equal(c.cloudDirty,false);assert.equal(c.rows[0].value,'initial');assert.equal(states.at(-1),'Connected & Synced');assert.equal(messages.at(-1),'');
});
