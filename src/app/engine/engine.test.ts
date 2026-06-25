// engine.test.js
import { CalcEngine } from './calc-engine'; // assuming your engine file location
import { Rule } from './types';

describe('Calculation Engine - Scope Context Validation', () => {
  let engine :any;

  // 1. Setup rule configurations mimicking your structure
  const rules: Rule[] = [
    {
      id: 'R1',
      type: "calculation",
      scope: 'row',
      target: 'discount',
      expression: 'ctx.baseDiscount + 5', // Simple calculation
      priority: 1
    },
    {
      id: 'R2',
        type: "calculation",
      scope: 'row',
      target: 'itemTotal',
      expression: '(ctx.price * ctx.quantity) - ctx.discount', // Uses row discount
      priority: 2
    },
    {
      id: 'H1',
      scope: 'header',
        type: "calculation",
      target: 'discount', // SHADOWED ATTRIBUTE: Named identical to row property
      expression: 'ctx.headerBaseDiscount + 20',
      priority: 1
    },
    {
      id: 'H2',
      scope: 'header',
        type: "aggregation",
      target: 'invoiceTotal',
      // Aggregates rows while ignoring the parent header discount attribute name collision
      expression: 'ctx.rows.reduce((sum, r) => sum + r.itemTotal, 0) - ctx.discount', 
      priority: 2
    }
  ];

  beforeEach(() => {
    // Basic compiler stub mimicking your setup (prepending ctx.)
    // Replace this with your actual engineConfig / compileDsl hook
    const mockCompileDsl = (expr:any) => {
      return new Function('ctx', `return ${expr};`);
    };

    engine = new CalcEngine(rules, { 
      roundingMode: 'none' 
    });
    
    // Injecting string compiler shim matching your logic
    engine.compileDsl = mockCompileDsl; 
  });

  // =========================================================================
  // TEST 1: Proxy Context Isolation (Anti-Shadowing Verification)
  // =========================================================================
  test('should prioritize row property over header property of the same name without overwriting', () => {
    const mockForm = {
      value: {
        header: { discount: 50, headerBaseDiscount: 10, invoiceTotal:0 }, // Header discount starts at 50
        details: [
          { price: 100, quantity: 2, baseDiscount: 5, discount: 0, itemTotal: 0 } // Row discount starts at 0
        ]
      },

      get(path: any) {
        return {
          at: () => ({ patchValue: (v:any) => Object.assign(mockForm.value.details[0], v) }),
          patchValue: (v:AnalyserNode) => Object.assign(mockForm.value.header, v)
        };
      }
    };

    engine.recalcAll(mockForm);

    // Row evaluation verification:
    // Row discount should resolve to (baseDiscount + 5) = 10.
    // It must NOT be overwritten or corrupted by the header's initial '50' discount.
    expect(mockForm.value.details[0].discount).toBe(10);
    
    // Row item total should resolve to (100 * 2) - 10 = 190.
    expect(mockForm.value.details[0].itemTotal).toBe(190);

    // Header evaluation verification:
    // Header rule H1 updates header discount to (headerBaseDiscount + 20) = 30.
    expect(mockForm.value.header.discount).toBe(30);

    // H2 updates invoiceTotal to (row total sum) - (header discount) = 160.
    expect(mockForm.value.header.invoiceTotal).toBe(160);
  });

  // =========================================================================
  // TEST 2: Single Target Evaluation Verification
  // =========================================================================
  test('evaluate() should correctly calculate and isolate dynamic standalone evaluations', () => {
    const headerData = { discount: 100, headerBaseDiscount: 5 };
    const rowData = { price: 50, quantity: 2, baseDiscount: 5, discount: 0, itemTotal: 0 };

    // Run row evaluation isolation
    const evaluatedRow = engine.evaluate('row', { header: headerData, row: rowData });
    expect(evaluatedRow.discount).toBe(10);
    expect(evaluatedRow.itemTotal).toBe(90);

    // Confirm that the initial input object parameters remained immutable outside the engine scope
    expect(rowData.itemTotal).toBe(0); 

    // Run header evaluation isolation using calculated payload
    const evaluatedHeader = engine.evaluate('header', { header: headerData, rows: [evaluatedRow] });
    expect(evaluatedHeader.discount).toBe(25);
    expect(evaluatedHeader.invoiceTotal).toBe(65); // 90 (row total) - 25 (header discount)
  });

  // =========================================================================
  // TEST 3: Auto-Detection Form Router Chain
  // =========================================================================
  test('handleFieldChange() should properly detect a row modification and update form fields sequentially', () => {
    // Mocking an Angular Form structure setup
    const formGroupMock = {
      value: {
        header: { discount: 0, headerBaseDiscount: 10, invoiceTotal: 0 },
        details: [
          { price: 100, quantity: 1, baseDiscount: 5, discount: 0, itemTotal: 0 }
        ]
      },
      // Mimics form.get('path') chain logic
      get(path:any) {
        if (path === 'header') {
          return { patchValue: (val:any) => { Object.assign(formGroupMock.value.header, val); } };
        }
        if (path === 'details') {
          return {
            at: (idx:any) => ({
              patchValue: (val:any) => { Object.assign(formGroupMock.value.details[idx], val); }
            })
          };
        }
        return 
      }
    };

    // Use our previously defined router implementation hook
    // Simulate user editing 'quantity' column directly on row index 0
    handleFieldChange(formGroupMock, engine, 'quantity', 0);

    // Sequential Verification:
    // 1. Router must detect that 'quantity' lives inside the row mapping scheme.
    // 2. Row rules must execute: row discount = 10, row itemTotal = (100 * 1) - 10 = 90.
    expect(formGroupMock.value.details[0].itemTotal).toBe(90);

    // 3. Router must automatically chain row outputs straight into header aggregations.
    // Header discount = 30, invoiceTotal = 90 - 30 = 60.
    expect(formGroupMock.value.header.invoiceTotal).toBe(60);
  });
});
