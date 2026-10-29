/* Storage pressure recovery: never clear active data or delete unverified backups. */
function createFuelStorageGuard(storage, archive) {
  let maintenance = Promise.resolve(), archived = false;
  const memoryAuth = new Map(), pendingWrites = new Map();
  function present() {
    const node = document.getElementById('cloudStorageWarning');
    const download = document.getElementById('cloudArchivedBackups');
    if (node) {
      node.hidden = pendingWrites.size === 0 && memoryAuth.size === 0;
      node.textContent = pendingWrites.size > 0
        ? 'Local storage is full. Keep this page open and export Backup before closing; pending changes may not survive a restart.'
        : memoryAuth.size ? 'Session storage is full. You can continue, but may need to sign in again after closing this page.' : '';
    }
    if (download) download.hidden = !archived || window.hasFuelPermission?.('manage_users') !== true;
  }
  function setting(key, value) {
    try { if (storage.getItem(key) !== value) storage.setItem(key, value); return true; }
    catch (_) { return false; }
  }
  const isBackup = key => /^fuel_conflict_backup_/.test(key) || key === 'fuel_system_records_backup_before_excel_import';
  async function makeRoom() {
    // Only old recovery copies are eligible. Current records, tombstones,
    // dirty markers, project identity, roles and credentials are never removed.
    const keys = [];
    try { for (let i=0;i<storage.length;i++) { const key=storage.key(i);if(isBackup(key || '')) keys.push(key); } }
    catch (_) { return false; }
    for (const key of keys) {
      let value;
      try { value=storage.getItem(key); } catch (_) { continue; }
      if (value === null) continue;
      try {
        const id=await archive.put(key,value);
        // put() resolves only after transaction completion; read-back must
        // match exactly before deleting the redundant localStorage copy.
        const saved=await archive.get(id);
        if (saved?.key !== key || saved.value !== value) continue;
        archived=true;
        if (storage.getItem(key) === value) storage.removeItem(key);
      } catch (_) { /* Keep the original if IndexedDB is blocked/full. */ }
    }
    present();return archived;
  }
  function prepare() {
    maintenance=maintenance.catch(()=>{}).then(async()=>{
      try {
        const key='fuel_storage_capacity_probe_v1';
        if (storage.getItem(key) !== null) return; // Do not overwrite an existing value.
        storage.setItem(key,'x'.repeat(16384));storage.removeItem(key);
      } catch (_) { await makeRoom(); }
      try { if ((await archive.all()).length) archived=true; } catch (_) {}
      present();
    });
    return maintenance;
  }
  function queueRepair() {
    maintenance=maintenance.catch(()=>{}).then(async()=>{
      await makeRoom();
      // Persist safety markers before records. Re-read the current queue after
      // await so a newer save/acknowledgment cannot be replaced by stale work.
      const keys=[...pendingWrites.keys()].sort((a,b)=>(a==='fuel_system_records')-(b==='fuel_system_records'));
      for(const key of keys) {
        if(!pendingWrites.has(key))continue;
        const value=pendingWrites.get(key);
        try {
          if(value===null)storage.removeItem(key);
          else if(!setting(key,value))break;
          pendingWrites.delete(key);
        } catch(_){break;}
      }
      present();
    });
  }
  function critical(key,value) {
    const saved=setting(key,value);
    if(saved)pendingWrites.delete(key);else pendingWrites.set(key,value);
    present();if(pendingWrites.size)queueRepair();return saved;
  }
  function removeCritical(key) {
    pendingWrites.delete(key);
    try{storage.removeItem(key);}catch(_){pendingWrites.set(key,null);}
    present();if(pendingWrites.size)queueRepair();
  }
  function saveRecords(value) { return critical('fuel_system_records',value); }
  const authStorage={
    getItem(key) { if(memoryAuth.has(key))return memoryAuth.get(key);try{return storage.getItem(key);}catch(_){return null;} },
    setItem(key,value) { if(setting(key,value))memoryAuth.delete(key);else memoryAuth.set(key,value);present(); },
    removeItem(key) { try{storage.removeItem(key);memoryAuth.delete(key);}catch(_){memoryAuth.set(key,null);}present(); }
  };
  async function exportArchives() {
    if(window.hasFuelPermission?.('manage_users') !== true)throw new Error('Administrator access required');
    const rows=await archive.all();
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),backups:rows},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='fuel-archived-recovery-backups.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return {setting,critical,removeCritical,prepare,saveRecords,authStorage,exportArchives,present,unsafe:()=>pendingWrites.size>0,whenIdle:()=>maintenance};
}
function fuelRecoveryArchive(indexedDB) {
  let opened;
  function open() {
    if(opened)return opened;
    opened=new Promise((resolve,reject)=>{
      if(!indexedDB){reject(new Error('IndexedDB unavailable'));return;}
      const request=indexedDB.open('najjar-recovery-backups-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('backups',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('Recovery storage is blocked'));
    });return opened;
  }
  async function run(mode,action) {
    const db=await open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('backups',mode);let result;
      const request=action(tx.objectStore('backups'));
      request.onsuccess=()=>{result=request.result;};
      tx.oncomplete=()=>resolve(result);
      tx.onabort=tx.onerror=()=>reject(tx.error || new Error('Recovery transaction did not commit'));
    });
  }
  return {
    async put(key,value) {
      // Archive identifiers are not credentials; support HTTP/local preview contexts too.
      const nonce=typeof crypto.randomUUID==='function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('');
      const id=key+':'+Date.now()+':'+nonce;
      await run('readwrite',store=>store.put({id,key,value,archivedAt:new Date().toISOString()}));return id;
    },
    get:id=>run('readonly',store=>store.get(id)),
    all:()=>run('readonly',store=>store.getAll())
  };
}
window.fuelStorageGuard=createFuelStorageGuard(localStorage,fuelRecoveryArchive(window.indexedDB));
window.addEventListener('beforeunload',event=>{
  if(window.fuelStorageGuard.unsafe()){event.preventDefault();event.returnValue='';}
});
