'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const script=html.match(/<script id="appearance-script">([\s\S]*?)<\/script>/)[1];
function harness(locked=false){
 let c;
 class Element{
  constructor(){this.children=[];this.attrs={};this.handlers={};this.style={};this.dataset={};this.parent=null;}
  setAttribute(k,v){this.attrs[k]=v}addEventListener(k,f){this.handlers[k]=f}
  appendChild(e){e.parent=this;this.children.push(e);return e}remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
  focus(){c.document.activeElement=this}getBoundingClientRect(){return {left:95,bottom:55,width:this.id==='appearance-menu'?220:38,height:150}}
  contains(e){return this===e||this.children.some(x=>x.contains(e))}
  querySelectorAll(sel){return this.children.filter(x=>sel==='button'?x.tag==='button':x.attrs['aria-checked']==='true')}
  querySelector(sel){return this.querySelectorAll(sel)[0]}
 }
 const logo=new Element(),login=new Element(),body=new Element(),gate=new Element(),root=new Element(),events={},storage=new Map([['fuel_system_records','original'],['fuel_cloud_url','original']]);
 root.dataset.appearance='dark';root.classList={contains:()=>locked};
 c={innerWidth:400,innerHeight:600,document:{documentElement:root,body,querySelector:sel=>sel==='.header-icon-box'?logo:sel.includes('.gate-logo')?login:null,getElementById:()=>gate,createElement:tag=>{const e=new Element();e.tag=tag;return e},addEventListener:(k,f)=>events[k]=f},window:{addEventListener:(k,f)=>events['window:'+k]=f},localStorage:{setItem:(k,v)=>storage.set(k,v)}};
 vm.runInNewContext(script,c);return {c,logo,login,body,gate,events,storage};
}
const altClick={altKey:true,button:0,preventDefault(){},stopPropagation(){}};
test('only Alt plus left click opens the menu, on both login and in-app icons',()=>{
 for(const locked of [false,true]){const h=harness(locked),anchor=locked?h.login:h.logo,parent=locked?h.gate:h.body;
 anchor.handlers.click({...altClick,altKey:false});assert.equal(parent.children.length,0);
 anchor.handlers.click({...altClick,button:2});assert.equal(parent.children.length,0);
 anchor.handlers.click(altClick);assert.equal(parent.children.length,1);assert.equal(parent.children[0].id,'appearance-menu');
 assert.equal(parent.children[0].querySelectorAll('button').length,2);assert(!anchor.handlers.contextmenu);
 }
});
test('LIGHT selection persists only appearance, closes menu and restores anchor focus',()=>{
 const h=harness(true);h.login.handlers.click(altClick);h.gate.children[0].querySelectorAll('button')[1].handlers.click();
 assert.equal(h.c.document.documentElement.dataset.appearance,'light');assert.equal(h.storage.get('najjar_appearance_v2'),'light');
 assert.equal(h.storage.get('fuel_system_records'),'original');assert.equal(h.storage.get('fuel_cloud_url'),'original');assert.equal(h.gate.children.length,0);assert.equal(h.c.document.activeElement,h.login);
});
test('arrow navigation and Escape work without touching the form or stored data',()=>{
 const h=harness();h.logo.handlers.click(altClick);const items=h.body.children[0].querySelectorAll('button');
 h.events.keydown({key:'ArrowDown',preventDefault(){}});assert.equal(h.c.document.activeElement,items[1]);
 h.events.keydown({key:'Escape',preventDefault(){}});assert.equal(h.body.children.length,0);assert.equal(h.storage.size,2);
});
test('appearance bootstrap tolerates unavailable storage and defaults to DARK',()=>{
 const src=html.match(/<script id="appearance-init">([\s\S]*?)<\/script>/)[1];
 const c={document:{documentElement:{dataset:{}}},localStorage:{getItem(){throw Error('blocked')}}};
 vm.runInNewContext(src,c);assert.equal(c.document.documentElement.dataset.appearance,'dark');
});
