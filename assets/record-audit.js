// Business fields exclude calculated distances, synchronization metadata and serial renumbering.
function auditBusiness(record) {
    if (!record) return null;
    const copy=JSON.parse(JSON.stringify(record));
    for(const key of Object.keys(copy)) if(key.startsWith('_') || ['sn','dayVal','kmDay','difference'].includes(key)) delete copy[key];
    return copy;
}
function auditStable(value) {
    if(Array.isArray(value)) return '['+value.map(auditStable).join(',')+']';
    if(value && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+auditStable(value[k])).join(',')+'}';
    return JSON.stringify(value);
}
const fuelAuditJournalKey=()=> 'fuel_record_audit_journal_v1:'+String(localStorage.getItem('fuel_cloud_url')||'unconfigured');
function auditJournal() {try{return JSON.parse(localStorage.getItem(fuelAuditJournalKey())||'[]');}catch(_){throw Error('The pending audit journal cannot be read. Keep this page open and contact the administrator.');}}
function auditDevice() {
    let device;try{device=JSON.parse(localStorage.getItem('fuel_audit_device_v1')||'null');}catch(_){}
    if(!device) {device={id:window.generateSyncId(),name:'Office browser'};if(!window.fuelStorageGuard.setting('fuel_audit_device_v1',JSON.stringify(device))) throw Error('Unable to save this browser identification.');}
    return device;
}
function stageRecordAudit(after,before,reason) {
    if(!window.fuelAuditActor?.id) throw Error('Sign in again before saving: verified user identity is unavailable.');
    const device=auditDevice(),account=window.fuelHeaderAccount;
    const actorName=account?.id===window.fuelAuditActor.id?String(account.fullName||'').trim().slice(0,80):'';
    const entries=auditJournal();
    entries.push({event_id:window.generateSyncId(),record_id:after._syncId,record_sn:after.sn,operation:after._deleted?'delete':before?'update':'create',actor_id:window.fuelAuditActor.id,actor_label:window.fuelAuditActor.email,actor_name:actorName,client_at:new Date().toISOString(),device_id:device.id,device_name:'Browser ID',reason:before?reason:'Initial record creation',before:auditBusiness(before),after:after._deleted?null:auditBusiness(after)});
    // Do not accept another edit if its history cannot be persisted.
    if(!window.fuelStorageGuard.setting(fuelAuditJournalKey(),JSON.stringify(entries))) throw Error('Storage is full. This change was not saved because its audit history could not be preserved.');
}
function stageImportAudit(records) {
    const reason=window.prompt('Reason for Excel import (required):','Excel import');
    if(!reason?.trim()) throw Error('Import cancelled: a reason is required.');
    const previous=JSON.stringify(auditJournal());
    try {
        for(const record of records) {
            const old=fuelRecords.find(r=>Number(r.sn)===Number(record.sn));
            record._syncId=old?._syncId || (old?'legacy-sn:'+old.sn:window.generateSyncId());
            record._syncUpdatedAt=new Date().toISOString();
            stageRecordAudit(record,old || null,reason.trim());
        }
    } catch(error){window.fuelStorageGuard.critical(fuelAuditJournalKey(),previous);throw error;}
}
window.pendingFuelAudit=()=>auditJournal();
window.acknowledgeFuelAudit=ids=>{
    const kept=auditJournal().filter(e=>!ids.includes(e.event_id));
    window.fuelStorageGuard.critical(fuelAuditJournalKey(),JSON.stringify(kept));
};
function prepareAuditForm(item) {
    const field=document.getElementById('auditDeviceName');
    if(field){
        const actor=window.fuelAuditActor,account=window.fuelHeaderAccount;
        const current=account?.id && (!actor?.id || account.id===actor.id)?account:null;
        const email=String(current?.email||actor?.email||'');
        const name=String(current?.fullName||'').trim();
        field.value=name?name+' · '+email:email;
    }
    const reason=document.getElementById('auditEditReason');if(reason){reason.value='';reason.required=false;}
    document.getElementById('auditReasonGroup').hidden=!item || !window.hasFuelPermission('edit');
    const history=document.getElementById('btnRecordAudit');history.hidden=!item;history.dataset.recordId=item?._syncId || (item?'legacy-sn:'+item.sn:'');history.dataset.sn=item?.sn || '';
}
// Display only: stored before/after snapshots remain untouched.
function auditFieldLabel(key) {
    const labels={date:'Date',car:'Vehicle',driver:'Driver name',driverPhone:'Driver phone',notes:'Notes',branch:'Branch',salesOrderNumber:'Sales Order number',salesOrderDescription:'Sales Order description',salesOrderAmount:'Sales Order amount (OMR)',invoiceNumber:'Invoice number',invoiceDescription:'Invoice description',invoiceAmount:'Invoice amount (OMR)',deliveryNumber:'Delivery number',deliveryDescription:'Delivery description',deliveryAmount:'Delivery amount (OMR)',startingKm:'Starting KM',endKm:'End KM',trip1:'Trip 1 — From / To',trip1Km:'Trip 1 KM',trip2:'Trip 2 — From / To',trip2Km:'Trip 2 KM',tnxAuth:'Transaction reference',site:'Fuel station',fuel:'Fuel quantity (liters)',lastKm:'Last KM',currentKm:'Current KM'};
    return labels[key] || String(key).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/^./,c=>c.toUpperCase());
}
function auditReadableValue(value,key) {
    if(value===undefined || value===null || value==='') return '—';
    if(typeof value==='number' && /Amount$/.test(key)) return value.toFixed(3);
    if(typeof value==='boolean') return value?'Yes':'No';
    return String(value);
}
function auditChangeRows(before,after) {
    const rows=[];
    const equal=(a,b)=>((a===undefined||a===null||a==='') && (b===undefined||b===null||b==='')) || auditStable(a)===auditStable(b);
    function walk(a,b,label,key) {
        if(equal(a,b)) return;
        const object=v=>v!==null && typeof v==='object';
        if(object(a)||object(b)) {
            const left=object(a)?a:{},right=object(b)?b:{};
            for(const child of [...new Set([...Object.keys(left),...Object.keys(right)])]) {
                if(child.startsWith('_')) continue;
                const name=Array.isArray(a)||Array.isArray(b)?'Item '+(Number(child)+1):auditFieldLabel(child);
                walk(left[child],right[child],label?label+' — '+name:name,child);
            }
            return;
        }
        rows.push({field:label,before:auditReadableValue(a,key),after:auditReadableValue(b,key)});
    }
    before=before||{};after=after||{};
    for(const key of [...new Set([...Object.keys(before),...Object.keys(after)])]) {
        if(key.startsWith('_')) continue;
        if(key==='tripDocuments') {
            const left=Array.isArray(before[key])?before[key]:[],right=Array.isArray(after[key])?after[key]:[];
            for(let index=0;index<Math.max(left.length,right.length);index++) {
                const a=left[index],b=right[index],doc=b||a||{};
                const identifiers=[doc.salesOrderNumber?'SO '+doc.salesOrderNumber:'',doc.invoiceNumber?'Invoice '+doc.invoiceNumber:'',doc.deliveryNumber?'Delivery '+doc.deliveryNumber:'',doc.branch||''].filter(Boolean).join(' · ');
                const context='Document entry '+(index+1)+(identifiers?' · '+identifiers:'');
                if(!a || !b) rows.push({field:context+' — Document status',before:a?'Present':'—',after:b?'Present':'Removed'});
                walk(a,b,context,'tripDocuments');
            }
        } else {
            const label=/^(salesOrder|invoice|delivery)Amount$/.test(key)?'Trip total — '+auditFieldLabel(key):auditFieldLabel(key);
            walk(before[key],after[key],label,key);
        }
    }
    return rows;
}

function auditIcon(kind) {
    const paths=kind==='history'?'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/>':'<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/>';
    return '<svg class="audit-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+paths+'</svg>';
}
function auditDate(value) {
    const date=new Date(value);if(!value || !Number.isFinite(date.getTime()))return 'Unavailable';
    return date.toLocaleString('en-GB',{timeZone:'Asia/Muscat',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
}
function auditActorText(event) {
    const email=String(event.actor_email||event.actor_id||'Unavailable');
    const name=typeof event.actor_name==='string'?event.actor_name.trim():'';
    return name?name+' · '+email:email;
}
function auditDeviceText(event) {
    if(!event)return 'Unavailable — legacy record';
    const id=String(event.device_id||'');
    return id && id!=='not-supplied'?'Browser '+id.slice(0,8):'Not supplied';
}
const auditDialogFocus=new WeakMap();
function openAuditDialog(modal) {
    if(!modal.classList.contains('active'))auditDialogFocus.set(modal,document.activeElement);
    modal.classList.add('active');document.body.classList.add('modal-open');
    const record=document.getElementById('recordModal');if(record)record.inert=true;
    modal.onkeydown=event=>{
        if(event.key==='Escape'){event.preventDefault();modal.id==='fuelAuditModal'?closeAuditHistory():cancelAuditEdit();return;}
        if(event.key!=='Tab')return;
        const fields=Array.from(modal.querySelectorAll('button:not([disabled]),textarea,input,[tabindex="0"]')).filter(el=>!el.hidden && el.getClientRects().length);
        if(!fields.length)return;
        const first=fields[0],last=fields[fields.length-1];
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
    };
    modal.querySelector('button')?.focus();
}
function dismissAuditDialog(modal) {
    modal.classList.remove('active');modal.onkeydown=null;
    const record=document.getElementById('recordModal');if(record)record.inert=false;
    if(!record?.classList.contains('active'))document.body.classList.remove('modal-open');
    const previous=auditDialogFocus.get(modal);if(previous?.isConnected)previous.focus();auditDialogFocus.delete(modal);
}
function closeAuditHistory(){auditHistoryRequest++;dismissAuditDialog(document.getElementById('fuelAuditModal'));}
let auditHistoryRequest=0;
function auditHistoryTable(changes) {
    return '<div class="audit-table-wrap"><table class="audit-table"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>'+changes.map(row=>'<tr><td>'+escapeHtml(row.field)+'</td><td>'+escapeHtml(row.before)+'</td><td>'+escapeHtml(row.after)+'</td></tr>').join('')+'</tbody></table></div>';
}
function auditHistoryMarkup(response,offset=0) {
    const events=Array.isArray(response.events)?response.events:[];
    const creation=response.record_info || events.find(event=>event.operation==='create') || null;
    const unavailable=response.record_info_pending?'Not loaded — see older changes':'Unavailable — legacy record';
    const creator=creation?auditActorText(creation):unavailable;
    const info=[['Created by',creator],['Created',creation?auditDate(creation.confirmed_at):unavailable],['Browser ID',creation?auditDeviceText(creation):unavailable]];
    let result='<section class="audit-card"><div class="audit-card-heading">'+auditIcon('record')+'<span>1. RECORD INFORMATION</span></div><div class="audit-record-grid">'+info.map(([label,value])=>'<div><span class="audit-label">'+escapeHtml(label)+'</span><div class="audit-static-value" title="'+escapeHtml(value)+'">'+escapeHtml(value)+'</div></div>').join('')+'</div></section>';
    result+='<section class="audit-card"><div class="audit-card-heading">'+auditIcon('history')+'<span>2. CHANGE HISTORY</span></div>';
    if(!events.length)return result+'<p class="audit-empty">No confirmed history is available. Original creation details are unavailable for records created before audit tracking.</p></section>';
    result+='<div class="audit-timeline">'+events.map((event,index)=>{
        const action=event.operation==='create'?'Created':event.operation==='delete'?'Deleted':'Edited';
        const changes=event.operation==='create'?[]:auditChangeRows(event.before_data,event.after_data);
        const device=auditDeviceText(event),technical='Browser identification and local time are reported by the browser. Local time: '+(event.client_at||'Unavailable');
        return '<article class="audit-event audit-'+(event.operation==='create'?'create':event.operation==='delete'?'delete':'update')+(offset===0 && index===0?' audit-latest':'')+'"><div class="audit-event-top"><div><div class="audit-event-time">'+escapeHtml(auditDate(event.confirmed_at))+'</div>'+(offset===0 && index===0?'<span class="audit-latest-tag">Latest</span>':'')+'<div class="audit-event-by">'+action+' by '+escapeHtml(auditActorText(event))+'</div>'+(event.operation!=='create'?'<div class="audit-event-device" title="'+escapeHtml(technical)+'">'+escapeHtml(device)+'</div>':'')+'</div><div class="audit-reason-box"><span class="audit-label">Reason</span>'+escapeHtml(event.reason||'Not supplied')+'</div></div>'+(changes.length?auditHistoryTable(changes):'')+'</article>';
    }).join('')+'</div></section>';
    return result;
}
const auditCreationCache=new Map();
async function readAuditPageWithCreation(id,offset,isCurrent=()=>true) {
    const response=await window.readFuelAudit(id,offset);
    const cacheKey=String(localStorage.getItem('fuel_cloud_url')||'')+':'+id;
    if(response.record_info){auditCreationCache.set(cacheKey,response.record_info);return response;}
    const found=response.events.find(event=>event.operation==='create');
    if(found){auditCreationCache.set(cacheKey,found);return {...response,record_info:found};}
    if(auditCreationCache.has(cacheKey))return {...response,record_info:auditCreationCache.get(cacheKey)};
    let page=offset===0?response:await window.readFuelAudit(id,0),position=0;
    for(let attempt=0;attempt<20;attempt++) {
        const creation=page.events.find(event=>event.operation==='create');
        if(creation){auditCreationCache.set(cacheKey,creation);return {...response,record_info:creation};}
        if(page.events.length<50){auditCreationCache.set(cacheKey,null);return {...response,record_info:null};}
        if(!isCurrent())return response;
        position+=50;page=position===offset?response:await window.readFuelAudit(id,position);
    }
    return {...response,record_info_pending:true};
}
async function showRecordAudit(id,sn,offset=0) {
    const modal=document.getElementById('fuelAuditModal'),body=document.getElementById('fuelAuditBody'),state=document.getElementById('auditServerState');
    const request=++auditHistoryRequest;
    document.getElementById('fuelAuditTitle').textContent='Record Audit History';
    document.getElementById('fuelAuditRecordNumber').textContent=String(sn);
    body.innerHTML='<p class="audit-empty">Loading verified history…</p>';state.dataset.state='pending';state.querySelector('span:last-child').textContent='Loading history…';openAuditDialog(modal);
    try {
        const response=await readAuditPageWithCreation(id,offset,()=>request===auditHistoryRequest && modal.classList.contains('active'));
        if(request!==auditHistoryRequest || !modal.classList.contains('active'))return;
        body.innerHTML=auditHistoryMarkup(response,offset);
        const pending=auditJournal().filter(event=>event.record_id===id).length;
        state.dataset.state=pending?'pending':'confirmed';state.querySelector('span:last-child').textContent=pending?pending+' local change(s) pending • Muscat time':'Server confirmed • Muscat time';
        const nav=document.createElement('div');nav.className='audit-pagination';
        if(offset){const prev=document.createElement('button');prev.type='button';prev.className='audit-button';prev.textContent='Newer changes';prev.onclick=()=>showRecordAudit(id,sn,Math.max(0,offset-50));nav.append(prev);}
        if(response.events.length===50){const next=document.createElement('button');next.type='button';next.className='audit-button';next.textContent='Older changes';next.onclick=()=>showRecordAudit(id,sn,offset+50);nav.append(next);}body.append(nav);
    } catch(error){if(request!==auditHistoryRequest)return;body.textContent='History could not be loaded: '+error.message;state.dataset.state='error';state.querySelector('span:last-child').textContent='Unable to confirm history';}
}
let pendingAuditEdit=null;
function showAuditEditConfirmation(before,after,callback) {
    const changes=auditChangeRows(auditBusiness(before),auditBusiness(after));
    if(!changes.length){pendingAuditEdit=null;alert('No changes to save.');return;}
    const modal=document.getElementById('fuelAuditConfirmModal');
    document.getElementById('auditConfirmTitle').textContent='Confirm changes — Record #'+after.sn;
    document.getElementById('auditConfirmChanges').innerHTML=changes.length?changes.map(row=>'<div class="audit-preview-row"><div class="audit-static-value audit-field-cell"><span class="audit-label">Field</span>'+escapeHtml(row.field)+'</div><div class="audit-static-value"><span class="audit-label">Current value</span>'+escapeHtml(row.before)+'</div><div class="audit-preview-arrow" aria-hidden="true">→</div><div class="audit-static-value"><span class="audit-label">New value</span>'+escapeHtml(row.after)+'</div></div>').join(''):'<p class="audit-help">No visible field changes. A reason is still required to confirm this update.</p>';
    const reason=document.getElementById('auditEditReason');reason.value='';reason.required=true;
    document.getElementById('auditReasonGroup').hidden=false;document.getElementById('auditReasonError').hidden=true;updateAuditReasonCount();pendingAuditEdit=callback;openAuditDialog(modal);reason.focus();
}
function updateAuditReasonCount(){const value=document.getElementById('auditEditReason').value;document.getElementById('auditReasonCount').textContent=value.length+' / 500';if(value.trim() && value.length<=500)document.getElementById('auditReasonError').hidden=true;}
function cancelAuditEdit(){pendingAuditEdit=null;dismissAuditDialog(document.getElementById('fuelAuditConfirmModal'));document.getElementById('auditEditReason').value='';}
function confirmAuditEdit() {
    if(!pendingAuditEdit)return;
    const reason=document.getElementById('auditEditReason'),error=document.getElementById('auditReasonError');
    if(!reason.value.trim() || reason.value.length>500){error.textContent='Enter a reason for change (maximum 500 characters).';error.hidden=false;reason.focus();return;}
    const callback=pendingAuditEdit;pendingAuditEdit=null;dismissAuditDialog(document.getElementById('fuelAuditConfirmModal'));callback();
}
