export function validateEntity(kind,d,places=[]) {
 if(!d || typeof d!=='object' || Array.isArray(d))throw Error('Invalid delivery data.');
 const text=(key,required=false)=>{if(typeof d[key]!=='string'||d[key].length>1000||(required&&!d[key].trim()))throw Error('Invalid '+key);};
 for(const k of ['driverPhone','vehicleBrand','destinationAddress'])if(d[k]!==undefined)text(k);if(d.driverPhone&&!/^[+0-9 ()-]{7,22}$/.test(d.driverPhone))throw Error('Invalid driver phone.');
 const date=k=>{text(k);if(d[k]&&!/^\d{4}-\d{2}-\d{2}$/.test(d[k]))throw Error('Invalid '+k);};
 const money=x=>Number.isFinite(x)&&x>=0&&x<=10000000&&Math.abs(x*1000-Math.round(x*1000))<0.00001;
 if(kind==='trip'){for(const k of ['driver','vehicle','route'])text(k,true);date('date');if(!d.date)throw Error('Trip date required.');return;}
 if(kind!=='order')throw Error('Invalid entity type.');
 for(const k of ['salesOrder','customer','phone','destination'])text(k,true);
 for(const k of ['invoice','deliveryNote','driver','vehicle','fuelRecordId','recipient','proofPath','notes'])text(k);
 if(!Array.isArray(d.tripIds)||d.tripIds.length>100||d.tripIds.some(x=>typeof x!=='string'||!x))throw Error('Invalid linked trips.');
 if(places.length){const p=d.destinationPlace;const known=p&&places.find(x=>x.id===p.id);if(known){const expected=[known.name,known.wilayat,known.governorate].filter((v,i,a)=>v&&a.indexOf(v)===i).join(' · ');if(d.destination!==expected)throw Error('Select an approved destination.');d.destinationPlace={...known};}else if(p?.type==='Company location'){const parent=places.find(x=>x.type==='Wilayat'&&x.governorate===p.governorate&&x.wilayat===p.wilayat);if(!parent||typeof p.name!=='string'||p.name.length>120||p.name.length<2||!/[\p{L}]/u.test(p.name)||p.id!=='company:'+parent.id+':'+p.name.toLowerCase())throw Error('Invalid company location.');const expected=[p.name,p.wilayat,p.governorate].filter((v,i,a)=>v&&a.indexOf(v)===i).join(' · ');if(d.destination!==expected)throw Error('Invalid destination label.');d.destinationPlace={id:p.id,name:p.name,governorate:parent.governorate,wilayat:parent.wilayat,type:'Company location',source:'Company added'};}else if(!places.some(x=>x.name===d.destination))throw Error('Select an approved destination.');}
 date('date');date('deliveredDate');if(!d.date)throw Error('Delivery date required.');
 if(!['Pending','Scheduled','In Transit','Delivered','Delayed','Cancelled'].includes(d.status))throw Error('Invalid delivery status.');
 for(const k of ['goodsDue','feeDue'])if(!money(d[k]))throw Error('Amounts require nonnegative values with up to 3 decimals.');
 if(!Array.isArray(d.payments)||d.payments.length>100)throw Error('Invalid payments.');
 const sums={Goods:0,'Delivery fee':0};
 for(const p of d.payments){if(!Object.hasOwn(sums,p.category)||!money(p.amount)||p.amount<=0||typeof p.reference!=='string'||!p.reference.trim()||p.reference.length>200||!['Cash','Bank transfer','Card'].includes(p.method)||typeof p.settled!=='boolean'||!/^\d{4}-\d{2}-\d{2}$/.test(p.date))throw Error('Invalid payment details.');sums[p.category]+=Math.round(p.amount*1000);}
 if(sums.Goods>Math.round(d.goodsDue*1000)||sums['Delivery fee']>Math.round(d.feeDue*1000))throw Error('Payments exceed the amount due.');
 if(d.status==='Delivered'&&(!d.recipient.trim()||!d.deliveredDate))throw Error('Recipient and delivery date are required for Delivered status.');
}

