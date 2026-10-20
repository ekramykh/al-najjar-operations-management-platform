'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const script=html.match(/<script id="fuel-theme-script">([\s\S]*?)<\/script>/)[1];
function harness(saved,blocked=false){
 const storage=new Map([['fuel_system_records','UNCHANGED'],['fuel_cloud_url','UNCHANGED']]);if(saved)storage.set('fuel_display_theme',saved);
 const events={},controls=Array.from({length:2},()=>['dark','light'].map(theme=>({dataset:{fuelThemeChoice:theme},attrs:{},handlers:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){this.handlers[k]=fn}}))).flat();
 const c={document:{documentElement:{dataset:{}},querySelectorAll:()=>controls,addEventListener:(name,fn)=>events[name]=fn},window:{addEventListener:(name,fn)=>events[name]=fn},localStorage:{getItem:k=>{if(blocked)throw Error('blocked');return storage.get(k)},setItem:(k,v)=>{if(blocked)throw Error('blocked');storage.set(k,v)}}};
 vm.runInNewContext(script,c);events.DOMContentLoaded();return {c,controls,storage,events};
}
test('DARK is the default and both controls reflect stored LIGHT on startup',()=>{
 assert.equal(harness().c.document.documentElement.dataset.fuelTheme,'dark');
 const h=harness('light');assert.equal(h.c.document.documentElement.dataset.fuelTheme,'light');
 for(const b of h.controls)assert.equal(b.attrs['aria-pressed'],String(b.dataset.fuelThemeChoice==='light'));
});
test('theme switch persists only the display preference and never changes business or connection data',()=>{
 const h=harness();h.controls[1].handlers.click();assert.equal(h.storage.get('fuel_display_theme'),'light');
 assert.equal(h.storage.get('fuel_system_records'),'UNCHANGED');assert.equal(h.storage.get('fuel_cloud_url'),'UNCHANGED');
 h.controls[0].handlers.click();assert.equal(h.storage.get('fuel_display_theme'),'dark');
 for(const b of h.controls)assert.equal(b.attrs['aria-pressed'],String(b.dataset.fuelThemeChoice==='dark'));
});
test('blocked storage and invalid preferences still permit switching without breaking the app',()=>{
 const h=harness('unexpected',true);assert.equal(h.c.document.documentElement.dataset.fuelTheme,'dark');
 assert.doesNotThrow(()=>h.controls[1].handlers.click());assert.equal(h.c.document.documentElement.dataset.fuelTheme,'light');
});
test('cross-tab theme changes affect display only and are not written back',()=>{
 const h=harness();h.events.storage({key:'fuel_cloud_url',newValue:'light'});assert.equal(h.c.document.documentElement.dataset.fuelTheme,'dark');
 h.events.storage({key:'fuel_display_theme',newValue:'light'});assert.equal(h.c.document.documentElement.dataset.fuelTheme,'light');assert(!h.storage.has('fuel_display_theme'));
});
test('theme redraw retains the same chart records rather than loading or saving data',()=>{
 const h=harness();const row={sn:1};h.c.myChart={data:{datasets:[{data:[{record:row},{record:row}]}]}};
 h.c.renderFinancialLineChart=rows=>h.c.drawn=rows;h.controls[1].handlers.click();assert.equal(h.c.drawn.length,1);assert.equal(h.c.drawn[0],row);
});
test('light colors are screen-scoped, controls are hidden when printing, and scripts parse',()=>{
 assert(html.includes('@media print{.fuel-theme-control{display:none!important}}'));
 assert(html.includes('@media screen{\nhtml[data-fuel-theme="light"]'));
 assert.equal((html.match(/aria-label="Color theme"/g)||[]).length,2);
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
});
