# Trip invoices and deliveries

Branch: feature-trip-invoices-2026-10-12, based on review-ui-permission-guards-2026-10-11 at fa8b033.

A trip remains one fuel record with an ordered tripDocuments array. Each document contains invoiceNumber, invoiceAmount (three decimal OMR), branch and deliveryNumber. Legacy records are read as a single document, without rewriting stored data on load. An empty editor stays valid for trips without invoices/deliveries. Negative amounts are rejected by the numeric form and document parser.

Each invoice below OMR 500 warns separately, including a named invoice at zero. Saving requires one confirmation listing the affected invoices. A delivery without an invoice or amount does not warn. Summed amounts never suppress individual warnings. The records table retains its columns: numbers and branches are joined and invoiceAmount displays the trip total. Dashboard warnings list individual invoices and navigate to the original trip.

Excel export includes TRIP DOCUMENTS JSON in addition to the existing summary columns. Import recognizes it, validates documents and reconstructs summaries. Old spreadsheets remain supported. Removing that JSON column from an export loses per-document associations on re-import; preserve it. JSON backups already retain all fields.

No production database writes, main changes, password changes or Pages source changes were made. Keep GitHub Pages on main. Download this branch locally and use Guest with staging project lfmuxtnurxaanixxflwc.

Validation: 54 Node tests pass, including legacy compatibility, per-invoice warning boundaries, confirmation acceptance/cancellation, JSON roundtrip, multi-document save/update/copy and mock server add/edit/read/delete and add-only rejection. Inline scripts parse; form hierarchy and unique base IDs checked. No browser UI or live two-device tests are claimed. Automated Chromium installation was unavailable.

Practical tests pending: add two documents (300 and 700), confirm only 300 warns, save and receive both on second device; reopen/edit second document; remove first and save; reopen legacy record; Save as New; Excel export/re-import in staging with admin authorization; delete test copy and confirm it stays deleted. Resume the pending long-session security test afterward. No merge to main is authorized.
