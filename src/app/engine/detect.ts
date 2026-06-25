/**
 * Automatically detects changes, routes them to the correct scope, 
 * executes rule evaluations, and patches the Angular Form.
 * 
 * 
* To automatically detect whether a changed field belongs to a row or the header, the system needs a 
* clear resolution strategy. Because fields like id, discount, or status can exist on both levels, 
* the auto-detector must prioritize the more granular level (the row) first, fallback to the header,
*  and accept an optional explicit override.Here is the complete auto-detection router function designed 
* to plug right into the Angular component or engine service layer. 
* Add this function to relevant application code. It accepts the modified field name, determines the target scope, 
* runs the existing evaluate method, and patches the results back into the Angular form safely.
 * 
 * 
 */

function handleFieldChange(form: any, engine: any, changedField: string, rowIndex?: number) {
  const headerSnapshot = form.value.header;
  const rowsSnapshot = form.value.details;

  // 1. DETERMINE SCOPE: Look for where the changed field lives
  let detectedScope: 'row' | 'header' = 'header';

  // If a row index is provided, or if the field uniquely exists in a row, check row first
  if (rowIndex !== undefined && rowIndex >= 0) {
    const targetRow = rowsSnapshot[rowIndex];
    if (targetRow && changedField in targetRow) {
      detectedScope = 'row';
    }
  } else if (rowsSnapshot.length > 0 && changedField in rowsSnapshot[0]) {
    // Fallback detection if no index was passed but the field belongs exclusively to rows
    detectedScope = 'row';
  }

  // 2. ROUTE AND EVALUATE
  if (detectedScope === 'row' && rowIndex !== undefined) {
    // Evaluate only the affected single row
    const updatedRow = engine.evaluate('row', {
      header: headerSnapshot,
      row: rowsSnapshot[rowIndex]
    });

    // Patch the single updated row back into the Angular Form array
    form.get('details').at(rowIndex).patchValue(updatedRow, { emitEvent: false });

    // CRITICAL CHAINING STEP: Because a row changed, the header's total/aggregates 
    // likely need to re-run based on the fresh row data.
    const freshRowsSnapshot = [...rowsSnapshot];
    freshRowsSnapshot[rowIndex] = updatedRow; // Insert our newly calculated row

    const updatedHeader = engine.evaluate('header', {
      header: headerSnapshot,
      rows: freshRowsSnapshot
    });

    form.get('header').patchValue(updatedHeader, { emitEvent: false });

  } else {
    // Evaluate header-scoped rules only
    const updatedHeader = engine.evaluate('header', {
      header: headerSnapshot,
      rows: rowsSnapshot
    });

    form.get('header').patchValue(updatedHeader, { emitEvent: false });
  }
}

/*
How to Hook This to UI / Forms

Invoke this handler seamlessly from the template binding layer or the Angular reactive form subscription channels.

Method A: 
From the HTML Component Template (Easiest )Directly attach it to the (ngModelChange) or (change) hooks inside the
 structural table grid loop for detail rows:

 <!-- INSIDE YOUR ROW FOR-LOOP -->
<div *ngFor="let row of form.get('details').controls; let i = index" [formGroup]="row">
  <input formControlName="discount" (change)="handleFieldChange(form, engine, 'discount', i)">
</div>

<!-- INSIDE YOUR HEADER VIEW -->
<input formControlName="taxRate" (change)="handleFieldChange(form, engine, 'taxRate')">

Method B: 
Reactive ValueChanges Subscription (Cleanest TypeScript)
If you prefer listening to mutations asynchronously via RxJS inside your component file:

// Listen for row table cell changes
this.form.get('details').valueChanges.subscribe((allRows) => {
  // Find which specific row index or key property was touched by comparing snapshots
  // and run: handleFieldChange(this.form, this.engine, changedFieldName, touchedIndex);
});

*/