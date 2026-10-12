'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function harness(){const c={window:{confirm:()=>true},document:{}};vm.runInNewContext(html.slice(html.indexOf('    function tripDocuments('),html.indexOf('    function requireFuelPermission')),c);return c}
test('legacy single-invoice record is read without changing its stored fields',()=>{
 const c=harness(),old={invoiceNumber:'OLD',invoiceAmount:300,branch:'TURAYF BRANCH',deliveryNumber:'D1'},before=JSON.stringify(old);
 assert.equal(c.tripDocuments(old).length,1);assert.equal(c.tripDocuments(old)[0].invoiceAmount,300);assert.equal(JSON.stringify(old),before);
});
test('each 300 invoice warns even though the trip total is 600, while 500 does not',()=>{
 const c=harness(),rows=c.normalizeTripDocuments([{invoiceNumber:'A',invoiceAmount:300},{invoiceNumber:'B',invoiceAmount:300}]);
 assert.equal(c.tripDocumentSummary(rows).invoiceAmount,600);assert.equal(rows.filter(c.lowTripInvoice).length,2);
 assert.equal(c.lowTripInvoice({invoiceNumber:'C',invoiceAmount:500}),false);
 assert.equal(c.lowTripInvoice({invoiceNumber:'ZERO',invoiceAmount:0}),true);
 assert.equal(c.lowTripInvoice({deliveryNumber:'Delivery only',invoiceAmount:0}),false);
});
test('low amounts can be accepted or cancelled before saving',()=>{
 const c=harness();let text;c.readTripDocuments=()=>[{invoiceNumber:'A',invoiceAmount:300},{invoiceNumber:'B',invoiceAmount:700}];
 c.window.confirm=m=>(text=m,false);assert.equal(c.confirmInvoiceAmountMinimum(),false);assert.match(text,/A: OMR 300.000/);assert.doesNotMatch(text,/B: OMR/);
 c.window.confirm=()=>true;assert.equal(c.confirmInvoiceAmountMinimum(),true);
});
test('summary retains invoice-delivery-branch association and Excel JSON round-trips',()=>{
 const c=harness(),rows=c.normalizeTripDocuments([{invoiceNumber:'A',invoiceAmount:501.125,branch:'TURAYF BRANCH',deliveryNumber:'D1'},{invoiceNumber:'B',invoiceAmount:299.875,branch:'BARKAH BRANCH',deliveryNumber:'D2'}]);
 const summary=c.tripDocumentSummary(rows);assert.equal(summary.invoiceAmount,801);assert.equal(summary.invoiceNumber,'A / B');
 assert.equal(JSON.stringify(c.normalizeTripDocuments(JSON.parse(JSON.stringify(rows)))),JSON.stringify(rows));
 assert.equal(summary.tripDocuments[1].deliveryNumber,'D2');
});
test('negative and malformed invoice amounts do not silently enter a document',()=>{
 const c=harness();for(const value of [-1,'invalid',Infinity])assert.throws(()=>c.normalizeTripDocuments([{invoiceAmount:value}]));
 assert.throws(()=>c.normalizeTripDocuments({}));
});
