'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
test('record renderer escapes shared text and passes alert data through a callback',()=>{
 const rows=[],elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{childNodes:[{}],appendChild:r=>rows.push(r)});return elements.get(id)};
 const payload='<img src=x onerror="alert(1)">',driver="O'Neil \"Driver\"",r={sn:1,date:payload,car:payload,driver,driverPhone:payload,trip1:payload,trip2:payload,tnxAuth:payload,site:payload,fuel:100,lastKm:100,currentKm:200};let callback,passed;
 const c={fuelRecords:[r,{sn:2,fuel:10}],currentPage:1,pageSize:25,currentSelectedRange:'Max',driverPhonesMap:{},window:{},document:{getElementById:get,createElement:()=>({setAttribute(){},querySelector(){return this.innerHTML.includes('data-fuel-alert')?{addEventListener:(_type,fn)=>callback=fn}:null}})},updateInvoiceWarningDashboard(){},calculateVariantKm:(a,b)=>Number(b||0)-Number(a||0),calculateAverageKmPerLiter:(km,f)=>f?km/f:0,tripDocuments:()=>[],lowTripInvoice:()=>false,iconPencil:'',iconTrash:'',iconWhatsApp:'',filterRecordsByRange:x=>x,renderFinancialLineChart(){},updateFormAndFilterDatalists(){},syncActionsBarWidth(){},openWhatsAppDirect:(...args)=>passed=args};
 vm.runInNewContext(html.slice(html.indexOf('    function escapeHtml(value)'),html.indexOf('    function createChartExportImage()')),c);c.renderDashboard();
 assert.ok(!rows[0].innerHTML.includes('<img'));assert.ok(rows[0].innerHTML.includes('&lt;img'));assert.ok(!rows[0].innerHTML.includes('onclick="openWhatsAppDirect'));callback();assert.equal(passed[2],driver);assert.equal(passed[0],payload);
});
test('vehicle profile actions preserve names containing quotes',()=>{
 const car='Mercedes "A" & O\'Neil';let markup,selected={value:'',dispatchEvent(){}},deleted;
 const c={getProfiles:()=>({[car]:{}}),esc:v=>String(v??'').replace(/[&<>"]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x])),fmt:()=>0,document:{getElementById:id=>id==='fleetProfilesTable'?{set innerHTML(v){markup=v}}:selected},deleteVehicleProfile:x=>deleted=x,Event:class{}};
 const brandStart=html.indexOf('  const fleetBrand=');vm.runInNewContext(html.slice(brandStart,html.indexOf('\n',brandStart)),c);
 const start=html.indexOf('  function renderFleetProfilesTable()');vm.runInNewContext(html.slice(start,html.indexOf('\n',start)),c);c.renderFleetProfilesTable();
 const actions=[...markup.matchAll(/onclick="([^"]*)"/g)].map(x=>x[1].replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));assert.equal(actions.length,2);for(const action of actions)vm.runInNewContext(action,c);assert.equal(selected.value,car);assert.equal(deleted,car);
});
