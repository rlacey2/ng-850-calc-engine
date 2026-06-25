import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, FormsModule } from '@angular/forms';
import { CalcEngine } from './engine/calc-engine';
import { JsonPipe } from '@angular/common';
import { CalcEngineConfig, Rule } from './engine/types';
import { Subscription, tap } from 'rxjs';

import { ruleSet } from './engine/rules'

@Component({
  standalone: true,
  selector: 'app-root',
  imports: [ReactiveFormsModule, JsonPipe, FormsModule],
  templateUrl: './app.html',
})

export class AppComponent {

  protected readonly title = signal('calc-engine-angular22');

  fb: FormBuilder = new FormBuilder();

  form = this.fb.group({

    header: this.fb.group({

      //  Core totals
      subTotal: 0,
      vatTotal: 0,
      discountTotal: 0,
      discountTotalB: 0,
      commissionTotal: 0,
      grandTotal: 0,
      total: 0,

      // Optional metadata / rates (used in rules)
      vatRate: 0.2,
      discountRate: 0.09,
      commissionRate: 0.07
    }),

    details: this.fb.array([

      this.fb.group({
        qty: 2,
        price: 10.99,
        // row-level calculated fields
        subTotal: 0,
        discount: 0,
        vat: 0,
        total: 0,
        string1: 'alpha',
        string2: 'beta',
        result: ''
      }),

      this.fb.group({
        qty: 5,
        price: 6.88,
        // row-level calculated fields
        subTotal: 0,
        discount: 0,
        vat: 0,
        total: 0,
        string1: 'alpha',
        string2: 'alpha',
        result: ''
      })

    ])

  });


  // id: crypto.randomUUID()

  // applied to the relevant form data ALL fields are case sensitive

  // rules are applied to any header or row(s) as relevant based on the dependency graph that is built


  // lots of different test cases, different keys
  rules: any = ruleSet.sequentialSteps2;

  engineConfig: CalcEngineConfig = {
    rounding: 4,
    roundingMode: 'final-only',
    debug: true
  }

  // engine = createEngine(this.rules, this.engineConfig);

  engine = new CalcEngine(this.rules, this.engineConfig) // prepare the engine's internals

  xxx: any;

  resetState: any;

  options = { ruleSet: 'sequentialSteps1'  }


  cd = inject(ChangeDetectorRef)

  constructor() {
    this.resetState = this.form.getRawValue()
  }

  ngOnInit() {
    setTimeout(() => {
      this.setupChangeListeners()
    }, 200)

    this.xxx = { ...this.form.getRawValue() }
    let x = this.form.get('details')?.getRawValue() // to include disabled fields
    console.log(x);

    // this.engine.recalcAll(this.form);
    //  this.simulateDisabledField();
    // this.simulateCRUD()
    this.recalcAndTrace()
  }

  reset() {
    this.form.patchValue(this.resetState, { emitEvent: false })
    this.resetForm()
  }

  resetForm() {
    this.xxx = { ...this.form.getRawValue() }
    this.cd.detectChanges();
    console.log(this.xxx)
    console.log(this.engine.getTrace());
  }

  recalcAndTrace() {
    console.log('recalcAndTrace')
    this.engine.recalcAll(this.form)
    this.xxx = { ...this.form.getRawValue() }
    this.cd.detectChanges();

    console.log(this.engine.getTrace())
  }

onRulesChange( )
{
  console.log(this.options.ruleSet)

   this.rules =  ruleSet[this.options.ruleSet];
     this.engine =    new CalcEngine(this.rules, this.engineConfig) // prepare the engine's internals
   this.recalcAndTrace()
}
  
 
  simulateDisabledField() {

    // disable a field/control
    // @ts-ignore
    (this.form.get('details').controls[0] as FormGroup).get('qty').disable();

    this.engine.recalcAll(this.form);

    // console.log(this.engine.getTrace())

    // simulate and edit

  }

  qty33() {
    // @ts-ignore
    ((this.form.get('details').controls[0] as FormGroup).get('qty') as Control).setValue(33, { emitEvent: false })
    this.recalcAndTrace() 
  }

  qty55() {
    // @ts-ignore
    ((this.form.get('details').controls[0] as FormGroup).get('qty') as Control).setValue(55, { emitEvent: false })
    this.recalcAndTrace() 
  }

   qty77() {
    // @ts-ignore
    ((this.form.get('details').controls[1] as FormGroup).get('qty') as Control).setValue(77, { emitEvent: false })
    this.recalcAndTrace() 
  }


  

  private subscription = new Subscription();

  setupChangeListeners() {
    // 1. LISTEN TO ROWS ONLY
    // This fires ONLY when the user modifies a row cell.
    this.subscription.add(
      // @ts-ignore
      this.form.get('details').valueChanges.subscribe((rows) => {
        // Find what changed and call your class method.
        // Your class method runs row rules, patches the row ({emitEvent: false}),
        // runs header rules, and patches the header ({emitEvent: false}).
        // Result: Zero infinite loops because 'details' doesn't hear the header patch!
      })
    );

    // 2. LISTEN TO HEADER ONLY
    // This fires ONLY when the user manually modifies a standalone header field (like taxRate).
    this.subscription.add(
      // @ts-ignore
      this.form.get('header').valueChanges.subscribe((headerValue) => {
        // Check if the change came from a user interaction or the engine.
        // If your class engine method is active, ignore this event.
      })
    );
  }




  test2() {
    // Evaluating a single row:


    //this.handleFieldChange(this.form, 'row', 'qty',0)


  }



  /**
 * Automatically detects changes, routes them to the correct scope, 
 * executes rule evaluations, and patches the Angular Form.
 */
  zzzzhandleFieldChange(form: any, detectedScope: string, changedField: string, rowIndex?: number) {
    console.log('handleFieldChange')

    // Use getRawValue() so disabled/read-only controls are included
    const rawFormValues = form.getRawValue();

    const headerSnapshot = rawFormValues.header;
    const rowsSnapshot = rawFormValues.details;

    // 2. ROUTE AND EVALUATE
    if (detectedScope === 'row' && rowIndex !== undefined) {
      // Evaluate only the affected single row
      const updatedRow = this.engine.evaluate(this.form, 'row', 0, {
        header: headerSnapshot,
        row: rowsSnapshot[rowIndex]
      });



      // CRITICAL CHAINING STEP: Because a row changed, the header's total/aggregates 
      // likely need to re-run based on the fresh row data.
      const freshRowsSnapshot = [...rowsSnapshot];
      freshRowsSnapshot[rowIndex] = updatedRow; // Insert our newly calculated row

      const updatedHeader = this.engine.evaluate(this.form, 'header', -1, {
        header: headerSnapshot,
        rows: freshRowsSnapshot
      });

      //form.get('header').patchValue(updatedHeader, { emitEvent: false });

    } else {
      // Evaluate header-scoped rules only
      const updatedHeader = this.engine.evaluate(this.form, 'header', -1, {
        header: headerSnapshot,
        rows: rowsSnapshot
      });

      form.get('header').patchValue(updatedHeader, { emitEvent: false });
    }
  }


  zzhandleFieldChange(form: any, engine: any, changedField: string, rowIndex?: number) {
    console.log('handleFieldChange')



    // Use getRawValue() so disabled/read-only controls are included
    const rawFormValues = form.getRawValue();

    const headerSnapshot = rawFormValues.header;
    const rowsSnapshot = rawFormValues.details;

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
      const updatedRow = engine.evaluate(this.form, 'row', {
        header: headerSnapshot,
        row: rowsSnapshot[rowIndex]
      });

      // Patch the single updated row back into the Angular Form array
      form.get('details').at(rowIndex).patchValue(updatedRow, { emitEvent: false });

      // CRITICAL CHAINING STEP: Because a row changed, the header's total/aggregates 
      // likely need to re-run based on the fresh row data.
      const freshRowsSnapshot = [...rowsSnapshot];
      freshRowsSnapshot[rowIndex] = updatedRow; // Insert our newly calculated row

      const updatedHeader = engine.evaluate(this.form, 'header', {
        header: headerSnapshot,
        rows: freshRowsSnapshot
      });

      form.get('header').patchValue(updatedHeader, { emitEvent: false });

    } else {
      // Evaluate header-scoped rules only
      const updatedHeader = engine.evaluate(this.form, 'header', {
        header: headerSnapshot,
        rows: rowsSnapshot
      });

      form.get('header').patchValue(updatedHeader, { emitEvent: false });
    }
  }
}
