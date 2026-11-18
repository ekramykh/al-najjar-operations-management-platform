'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.match(/<script id="delivery-management-script">([\s\S]*?)<\/script>/)[1];
function harness(canAdd,canEdit){
 const nodes={deliveryNewOrder:{},deliveryNewTrip:{},deliveryTabs:{},deliveryContent:{}};
 const c={canAdd,canEdit,canWrite:canAdd||canEdit,nodes,$:id=>nodes[id],tabs:[],tab:'Overview',busy:false,deliveryConfirmOpen:false,viewMode:false,selected:{revision:0},messages:[],message:m=>c.messages.push(m),esc:x=>x,editActor:'user',window:{fuelHeaderAccount:{id:'user'}},collect:()=>{c.collected=true;throw Error('guard passed')},total:()=>0};
 vm.createContext(c);
 // Execute the actual entry guards; stop before constructing the editor DOM.
 const edit=source.slice(source.indexOf('function edit('),source.indexOf('// Desktop uses'));
 vm.runInContext(edit.slice(0,edit.indexOf('selected=id?'))+'return true;}',c);
 const save=source.slice(source.indexOf('async function save('),source.indexOf('function filtered('));
 vm.runInContext(save.slice(0,save.indexOf('collect();'))+'collect();}',c);
 const render=source.slice(source.indexOf('function render(){'),source.indexOf("if(tab==='Overview')"));
 vm.runInContext(render.slice(0,render.indexOf('for(const [id,key]'))+'}',c);
 const buttons=source.slice(source.indexOf('function buttons('),source.indexOf('function render(){'));
 vm.runInContext(buttons,c);
 return c;
}
for(const [name,add,edit] of [['reader',false,false],['add-only',true,false],['editor',false,true],['administrator',true,true]]){
 test('delivery UI enforces separate create/edit permission for '+name,async()=>{
  const c=harness(add,edit);c.render();assert.equal(c.nodes.deliveryNewOrder.disabled,!add);assert.equal(c.nodes.deliveryNewTrip.disabled,!add);
  assert.equal(c.edit(null)===true,add);assert.equal(c.edit('existing')===true,edit);assert.equal(c.edit('existing','order',true),true);
  assert.equal(c.buttons({id:'existing',kind:'trip',data:{}}).includes('data-edit='),edit);
  for(const revision of [0,1]){c.selected={revision};c.collected=false;try{await c.save()}catch(e){assert.equal(e.message,'guard passed')}assert.equal(c.collected,revision?edit:add);}
 });
}
test('all inline scripts retain valid JavaScript syntax',()=>{
 for(const [,attrs,code] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g))if(!/type=["'](?:application\/ld\+json|application\/json)["']/.test(attrs))new vm.Script(code);
});
