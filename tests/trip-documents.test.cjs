'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function harness(){const c={window:{confirm:()=>true},document:{}};vm.runInNewContext(html.slice(html.indexOf('    function escapeHtml('),html.indexOf('    function renderDashboard(')),c);vm.runInNewContext(html.slice(html.indexOf('    function tripDocuments('),html.indexOf('    function requireFuelPermission')),c);return c}
test('legacy single-invoice record is read without changing its stored fields',()=>{
 const c=harness(),old={invoiceNumber:'OLD',invoiceAmount:300,branch:'TURAYF BRANCH',deliveryNumber:'D1'},before=JSON.stringify(old);
 assert.equal(c.tripDocuments(old).length,1);assert.equal(c.tripDocuments(old)[0].salesOrderAmount,300);assert.equal(c.tripDocuments(old)[0].invoiceAmount,0);assert.equal(JSON.stringify(old),before);
});
test('only Sales Orders below 500 warn; invoice amounts do not',()=>{
 const c=harness(),rows=c.normalizeTripDocuments([{salesOrderNumber:'A',salesOrderAmount:300,invoiceAmount:300},{salesOrderNumber:'B',salesOrderAmount:300,invoiceAmount:300}]);
 assert.equal(c.tripDocumentSummary(rows).invoiceAmount,600);assert.equal(rows.filter(c.lowTripInvoice).length,2);
 assert.equal(c.lowTripInvoice({salesOrderNumber:'C',salesOrderAmount:500}),false);
 assert.equal(c.lowTripInvoice({salesOrderNumber:'ZERO',salesOrderAmount:0}),true);
 assert.equal(c.lowTripInvoice({deliveryNumber:'Delivery only',invoiceAmount:0}),false);
});
test('low amounts can be accepted or cancelled before saving',()=>{
 const c=harness();let text;c.readTripDocuments=()=>[{salesOrderNumber:'A',salesOrderAmount:300},{salesOrderNumber:'B',salesOrderAmount:700}];
 c.window.confirm=m=>(text=m,false);assert.equal(c.confirmInvoiceAmountMinimum(),false);assert.match(text,/A: OMR 300.000/);assert.doesNotMatch(text,/B: OMR/);
 c.window.confirm=()=>true;assert.equal(c.confirmInvoiceAmountMinimum(),true);
});
test('summary retains invoice-delivery-branch association and Excel JSON round-trips',()=>{
 const c=harness(),rows=c.normalizeTripDocuments([{invoiceNumber:'A',invoiceAmount:501.125,branch:'TURAYF BRANCH',deliveryNumber:'D1'},{invoiceNumber:'B',invoiceAmount:299.875,branch:'BARKAH BRANCH',deliveryNumber:'D2'}]);
 const summary=c.tripDocumentSummary(rows);assert.equal(summary.salesOrderAmount,801);assert.equal(summary.invoiceAmount,0);assert.equal(summary.invoiceNumber,'A / B');
 assert.equal(JSON.stringify(c.normalizeTripDocuments(JSON.parse(JSON.stringify(rows)))),JSON.stringify(rows));
 assert.equal(summary.tripDocuments[1].deliveryNumber,'D2');
});
test('negative and malformed invoice amounts do not silently enter a document',()=>{
 const c=harness();for(const value of [-1,'invalid',Infinity])assert.throws(()=>c.normalizeTripDocuments([{invoiceAmount:value}]));
 assert.throws(()=>c.normalizeTripDocuments({}));
});

test('all descriptions and independent totals round-trip without reclassifying legacy invoices',()=>{const c=harness();const rows=c.normalizeTripDocuments([{salesOrderNumber:'SO1',salesOrderAmount:450,salesOrderDescription:'order',invoiceNumber:'INV1',invoiceAmount:600,invoiceDescription:'invoice',deliveryNumber:'DN1',deliveryAmount:200,deliveryDescription:'delivery'}]);const r=c.tripDocumentSummary(rows);assert.equal(r.salesOrderAmount,450);assert.equal(r.invoiceAmount,600);assert.equal(r.deliveryAmount,200);assert.equal(r.tripDocuments[0].deliveryDescription,'delivery');assert.equal(c.lowTripInvoice({invoiceNumber:'OLD',invoiceAmount:100}),false);});

test('legacy document amounts map once to Sales Orders; explicit new invoice values stay separate',()=>{const c=harness();const old={tripDocuments:[{invoiceNumber:'OLD',invoiceAmount:300,deliveryNumber:'D1'}]},before=JSON.stringify(old);const mapped=c.tripDocuments(old);assert.equal(mapped[0].salesOrderAmount,300);assert.equal(mapped[0].invoiceAmount,0);assert.equal(c.lowTripInvoice(mapped[0]),true);assert.equal(JSON.stringify(old),before);assert.equal(c.normalizeTripDocuments(mapped)[0].salesOrderAmount,300);const modern={tripDocuments:[{salesOrderAmount:0,invoiceAmount:450}]};assert.equal(c.tripDocuments(modern)[0].invoiceAmount,450);assert.equal(c.tripDocuments(modern)[0].salesOrderAmount,0);});

test('table warning counts individual low Sales Orders even with a high invoice total',()=>{const c=harness();const record={tripDocuments:[{salesOrderNumber:'SO-A',salesOrderAmount:300,invoiceAmount:700},{salesOrderNumber:'SO-B',salesOrderAmount:450,invoiceAmount:800}]},before=JSON.stringify(record),markup=c.renderTripInvoiceTotal(record);assert.match(markup,/2 S\/O &lt; OMR 500/);assert.match(markup,/1500\.000/);assert.match(markup,/Order No\.: SO-A \| Amount: OMR 300\.000/);assert.match(markup,/Order No\.: SO-B \| Amount: OMR 450\.000/);assert.equal(JSON.stringify(record),before);});
test('compliant Sales Orders and invoice-only records retain their plain original totals',()=>{const c=harness();assert.equal(c.renderTripInvoiceTotal({tripDocuments:[{salesOrderNumber:'OK',salesOrderAmount:500,invoiceAmount:150}]}),'150.000');assert.equal(c.renderTripInvoiceTotal({tripDocuments:[{salesOrderAmount:0,invoiceAmount:200,deliveryAmount:300}]}),'200.000');assert.equal(c.renderTripInvoiceTotal({tripDocuments:[]}),'-');});
test('legacy low amounts still warn without converting the old amount into the new invoice total',()=>{const c=harness(),r={invoiceNumber:'OLD',invoiceAmount:300},before=JSON.stringify(r),markup=c.renderTripInvoiceTotal(r);assert.match(markup,/1 S\/O &lt; OMR 500/);assert.match(markup,/Not recorded — document entry 1 \| Amount: OMR 300\.000/);assert.match(markup,/<span>-<\/span>/);assert.equal(JSON.stringify(r),before);});
test('zero-value numbered orders warn and unsafe order numbers remain escaped in tooltip attributes',()=>{const c=harness(),markup=c.renderTripInvoiceTotal({tripDocuments:[{salesOrderNumber:'SO-"<bad>',salesOrderAmount:0,invoiceAmount:10}]});assert.match(markup,/1 S\/O &lt; OMR 500/);assert.match(markup,/SO-&quot;&lt;bad&gt; \| Amount: OMR 0\.000/);assert.doesNotMatch(markup,/<bad>/);});
