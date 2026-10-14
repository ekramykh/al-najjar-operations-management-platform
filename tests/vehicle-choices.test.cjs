'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('    function updateFormAndFilterDatalists()');
const end=html.indexOf('    function calculateVariantKm',start);
function render(records,selected=''){
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:''});return elements.get(id)};
 get('inputCar').value=selected;
 const defaults=[{car:'Mercedes - 8245 BA'},{car:'Volvo - 8797 AK'},{car:'Mercedes - 8245 BA'}];
 const before=JSON.stringify({records,defaults});
 const c={fuelRecords:records,defaultInitialRecords:defaults,formatTitleCase:x=>x,document:{getElementById:get}};
 vm.runInNewContext(html.slice(html.indexOf('    function escapeHtml(value)'),html.indexOf('    function renderDashboard(')),c);
 vm.runInNewContext(html.slice(start,end),c);c.updateFormAndFilterDatalists();
 assert.equal(JSON.stringify({records,defaults}),before,'lookup must not restore or change business records');
 return get;
}
test('empty cloud dataset still offers Mercedes and Volvo for the first record',()=>{
 const get=render([]);const options=get('inputCar').innerHTML;
 assert.ok(options.includes('Mercedes - 8245 BA'));assert.ok(options.includes('Volvo - 8797 AK'));
 assert.equal((options.match(/<option/g)||[]).length,3);
 assert.equal(get('filterCar').innerHTML,'<option value="">All Vehicles</option>');
});
test('new cloud vehicle is available and selected choice remains selected',()=>{
 const get=render([{car:'New vehicle',driver:'Driver',site:'Site'},{car:'Mercedes - 8245 BA'}],'New vehicle');
 assert.equal(get('inputCar').value,'New vehicle');assert.ok(get('inputCar').innerHTML.includes('New vehicle'));
 assert.equal((get('inputCar').innerHTML.match(/<option/g)||[]).length,4);
 assert.ok(get('filterCar').innerHTML.includes('New vehicle'));
});
test('deleting the final record does not remove known vehicle choices',()=>{
 const records=[{car:'Volvo - 8797 AK'}];render(records);records.splice(0);const get=render(records);
 assert.ok(get('inputCar').innerHTML.includes('Volvo - 8797 AK'));assert.equal(records.length,0);
});

test('cloud option names remain text even with quotes and HTML markup',()=>{
 const value='x" ><img src=x onerror=alert(1)>';const get=render([{car:value,driver:value,site:value}]);
 for(const id of ['inputCar','filterCar','filterDriver','filterSite']){assert.ok(!get(id).innerHTML.includes('<img'));assert.ok(get(id).innerHTML.includes('&lt;img'));}
});
