    function renderTripInvoiceTotal(record) {
        const documents=tripDocuments(record);
        const amount=Number(tripDocumentSummary(documents).invoiceAmount);
        const display=amount?amount.toFixed(3):'-';
        const low=documents.map((row,index)=>({row,index})).filter(({row})=>lowTripInvoice(row));
        const exceptions=documents.map((row,index)=>({row,index})).filter(({row})=>deliveryPaidException(row) && Number(row.salesOrderAmount)<500);
        const exceptionDetails=exceptions.map(({row,index})=>'Order No.: '+(row.salesOrderNumber || 'Document entry '+(index+1))+' | Delivery fee paid: OMR '+Number(row.deliveryFeePaid).toFixed(3)+' | Payment reference: '+row.deliveryPaymentReference).join('\n');
        const exempt=exceptions.length?'<span class="delivery-paid-badge" tabindex="0" title="'+escapeHtml(exceptionDetails)+'">✓ '+exceptions.length+' Delivery paid'+'</span>':'';
        if(!low.length)return exempt?'<span class="record-invoice-total">'+exempt+'<span>'+display+'</span></span>':display;
        const label=low.length+' S/O < OMR 500';
        const details='Sales Orders below OMR 500: '+low.length+'\n'+low.map(({row,index})=>'Order No.: '+(row.salesOrderNumber || 'Not recorded — document entry '+(index+1))+' | Amount: OMR '+Number(row.salesOrderAmount||0).toFixed(3)).join('\n')+'\nDisplayed total is the invoice total; the warning concerns individual Sales Orders.';
        const icon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 21h20L12 3zM12 9v5M12 17h.01"/></svg>';
        return '<span class="record-invoice-total">'+exempt+'<span class="sales-order-warning-badge" dir="ltr" role="img" tabindex="0" title="'+escapeHtml(details)+'" aria-label="'+escapeHtml(details)+'">'+icon+'<span>'+escapeHtml(label)+'</span></span><span>'+display+'</span></span>';
    }
