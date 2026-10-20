'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function harness(){
 const canvas={style:{},getContext:()=>({})};
 const c={myChart:null,fuelRecords:[],document:{getElementById:()=>canvas},
 parseFlexibleDate:v=>v?new Date(v):null,formatDateDisplay:d=>d.toISOString().slice(0,10),
 calculateVariantKm:(a,b)=>b-a,calculateAverageKmPerLiter:(km,fuel)=>fuel>0?km/fuel:0,
 goToInvoiceWarningRecord:index=>c.selected=index};
 c.Chart=function(_ctx,config){this.data=config.data;this.options=config.options;this.isDatasetVisible=i=>!this.data.datasets[i].hidden;this.destroy=()=>{};this.getElementsAtEventForMode=()=>c.hit||[];};
 vm.runInNewContext(html.slice(html.indexOf('    function renderFinancialLineChart'),html.indexOf('    // Old records are read')),c);return {c,canvas};
}
const rows=[{sn:1,date:'2026-10-01',car:'Mercedes - 8245 BA',lastKm:0,currentKm:300,fuel:100},
 {sn:2,date:'2026-10-02',car:'Volvo - 8797 AK',lastKm:0,currentKm:400,fuel:100},
 {sn:3,date:'2026-10-03',car:'Mercedes - 8245 BA',lastKm:0,currentKm:350,fuel:100}];
test('each vehicle has its own chronological line and distinct stable visual encoding',()=>{
 const {c}=harness();const before=JSON.stringify(rows);c.renderFinancialLineChart(rows);
 const [m,v]=c.myChart.data.datasets;assert.equal(m.data.length,2);assert.equal(v.data.length,1);
 assert.equal(m.data[0].y,3);assert.equal(m.data[1].y,3.5);assert.ok(m.data[1].x>m.data[0].x);
 assert.notEqual(m.borderColor,v.borderColor);assert.equal(m.pointStyle,'circle');assert.equal(v.pointStyle,'rect');assert.equal(v.borderDash.length,2);
 assert.equal(c.myChart.options.legend,undefined);assert.equal(c.myChart.options.plugins.legend.display,true);
 assert.equal(c.myChart.options.scales.x.type,'linear');assert.equal(JSON.stringify(rows),before);
 c.renderFinancialLineChart([rows[1]]);assert.equal(c.myChart.data.datasets[0].borderColor,v.borderColor);
});
test('double click navigates to exact record in selected vehicle dataset',()=>{
 const {c,canvas}=harness();c.fuelRecords=[rows[2],rows[0],rows[1]];c.renderFinancialLineChart(rows);
 c.hit=[{datasetIndex:1,index:0}];canvas.ondblclick({});assert.equal(c.selected,2);
 c.hit=[{datasetIndex:0,index:1}];canvas.ondblclick({});assert.equal(c.selected,0);
});
test('legend visibility survives data refresh and invalid points do not plot',()=>{
 const {c}=harness();c.renderFinancialLineChart(rows);c.myChart.data.datasets[1].hidden=true;c.renderFinancialLineChart(rows);
 assert.equal(c.myChart.data.datasets[1].hidden,true);
 c.renderFinancialLineChart([{...rows[0],date:'invalid'},{...rows[1],fuel:0}]);assert.equal(c.myChart.data.datasets.length,0);assert.equal(c.myChart.options.plugins.title.display,true);
});
test('PDF/PNG export uses dark readable text on white and preserves screen chart and hidden vehicles',()=>{
 let exported,destroyed=false,removed=false;
 const options={scales:{x:{ticks:{color:'#9ca3af',callback:x=>x},title:{text:'Date'}},y:{ticks:{color:'#9ca3af'}}},plugins:{legend:{labels:{color:'#e2e8f0',usePointStyle:true}},title:{display:false}}};
 const source={config:{options},data:{datasets:[{label:'Mercedes - 8245 BA',borderColor:'#3b82f6',data:[{x:1,y:3}]},{label:'Volvo - 8797 AK',borderColor:'#f59e0b',data:[]}]},isDatasetVisible:i=>i===0};
 const before=JSON.stringify(source),canvas={style:{},getContext:()=>({}),toDataURL:()=> 'data:image/png;test',remove:()=>removed=true};
 const c={myChart:source,document:{getElementById:()=>({}),createElement:()=>canvas,body:{appendChild(){}}},Chart:function(_ctx,config){exported=config;this.update=()=>{};this.destroy=()=>destroyed=true;}};
 vm.runInNewContext(html.slice(html.indexOf('    function createChartExportImage()'),html.indexOf('    function executeChartAction()')),c);
 assert.equal(c.createChartExportImage(),'data:image/png;test');assert.equal(exported.options.plugins.legend.labels.color,'#1e293b');
 assert.equal(exported.options.scales.x.ticks.color,'#475569');assert.equal(exported.options.devicePixelRatio,2);
 assert.equal(exported.data.datasets[1].hidden,true);assert.equal(JSON.stringify(source),before);assert.ok(destroyed&&removed);
 let fill;const ctx={save(){},restore(){},fillRect(){fill=this.fillStyle}};exported.plugins[0].beforeDraw({ctx,width:2000,height:850});assert.equal(fill,'#ffffff');
});
