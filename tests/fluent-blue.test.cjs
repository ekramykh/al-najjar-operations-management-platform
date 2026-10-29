'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
test('light theme text and selected states meet normal-text contrast',()=>{
 const lum=h=>{const c=h.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};
 for(const [fg,bg] of [['#ffffff','#076ed3'],['#172b4d','#ffffff'],['#526581','#f4f8fd'],['#315575','#e7eff9'],['#075bad','#dcecff'],['#60718a','#ffffff'],['#12633e','#e3f5ec'],['#8d4c08','#fff2d9'],['#b42318','#ffebe9']]){const a=[lum(fg),lum(bg)].sort((a,b)=>b-a);assert.ok((a[0]+.05)/(a[1]+.05)>=4.5,`${fg} / ${bg}`)}
});
test('chart theme leaves business data unchanged and preserves dark tooltip',()=>{
 const run=mode=>{let result;const c={document:{documentElement:{dataset:{appearance:mode}},getElementById:()=>({style:{},getContext:()=>({})})},myChart:null,fuelRecords:[],Chart:function(_,v){result=v},parseFlexibleDate:v=>new Date(v),formatDateDisplay:String,calculateVariantKm:(a,b)=>b-a,calculateAverageKmPerLiter:(a,b)=>a/b};vm.runInNewContext(html.slice(html.indexOf('    function renderFinancialLineChart'),html.indexOf('    // Old records are read')),c);c.renderFinancialLineChart([{sn:1,date:'2026-10-21',car:'Mercedes',lastKm:0,currentKm:300,fuel:100}]);return result};
 const dark=run('dark'),light=run('light');assert.equal(JSON.stringify(light.data),JSON.stringify(dark.data));assert.equal(dark.options.plugins.tooltip.backgroundColor,'#111827');assert.equal(light.options.plugins.tooltip.backgroundColor,'#fff');assert.equal(light.options.scales.y.grid.color,'#e1e8f1');assert.equal(dark.options.scales.y.grid.color,'rgba(55,65,81,0.4)');
});

test('light control boundaries remain distinct from their adjacent surfaces',()=>{
 const lum=h=>{const c=h.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};
 for(const bg of ['#ffffff','#f0f4fa','#f4f7fc'])assert.ok((lum(bg)+.05)/(lum('#7085a2')+.05)>=3);
});
