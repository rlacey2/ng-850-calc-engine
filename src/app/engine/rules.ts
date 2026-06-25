// id: crypto.randomUUID()

// applied to the relevant form data ALL fields are case sensitive

// rules are applied to any header or row(s) as relevant based on the dependency graph that is built

import { Rule } from './types';


// different test cases
 
export const  ruleSet: any =
{
  "sequentialSteps1": [
    // just to prove it's supported
    { "id": "d_1", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "qty * price", "priority": 1 },
    { "id": "d_2", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "subTotal * -1", "priority": 2, "when": "subTotal > 20" },
    { "id": "d_3", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "9.99", "priority": 3, "when": "subTotal < 0" },
    { "id": "d_4", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "subTotal / 3", "priority": 4 },
    { "id": "d_5", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "subTotal / 3", "priority": 5 },
    { "id": "h_total", "type": "aggregation", "scope": "header", "target": "total", "expression": "rows.reduce((s,r)=>s+r.subTotal,0)", "priority": 2 }
  ],
  "sequentialSteps2": [
    // sequential stored out of order to prove priority works as a sort value
    { "id": "d_1", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "qty * price", "priority": 1 },
    { "id": "d_2", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "subTotal * -1", "priority": 3, "when": "subTotal > 20" },
    { "id": "d_3", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "9.99", "priority": 2, "when": "subTotal < 0" },
    { "id": "d_4", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "subTotal / 3", "priority": 5 },
    { "id": "d_5", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "subTotal / 3", "priority": 4 },
    { "id": "h_total", "type": "aggregation", "scope": "header", "target": "total", "expression": "rows.reduce((s,r)=>s+r.subTotal,0)", "priority": 2 }
  ],
  "sequentialSteps3": [
    // just to prove it's supported no priority falls back to id order?
    { "id": "d_1", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "qty * price" },
    { "id": "d_2", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "subTotal * -1", "when": "subTotal > 20" },
    { "id": "d_3", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "9.99", "when": "subTotal < 0" },
    { "id": "d_4", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "subTotal / 3" },
    { "id": "d_5", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "subTotal / 3" },
    { "id": "h_total", "type": "aggregation", "scope": "header", "target": "total", "expression": "rows.reduce((s,r)=>s+r.subTotal,0)", "priority": 2 }
  ],
  "sequentialSteps4": [
    // just to prove it's supported no priority falls back to id order?
    { "id": "d_91", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "qty * price" },
    { "id": "d_55", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "subTotal / 3" },
    { "id": "d_82", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "subTotal * -1", "when": "subTotal > 20" },
    { "id": "d_73", "type": "calculation", "scope": "row", "target": "9.99", "expression": "subTotal < 0" },
    { "id": "d_64", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "subTotal / 3" },
    { "id": "d_55", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "subTotal / 3" },
    { "id": "h_total", "type": "aggregation", "scope": "header", "target": "total", "expression": "rows.reduce((s,r)=>s+r.subTotal,0)", "priority": 2 }
  ],
  "mad1": [
    { "id": "d_1", "type": "calculation", "scope": "row", "target": "subTotal", "expression": "qty * price", "priority": 1 },
    { "id": "d_2", "type": "calculation", "scope": "row", "target": "discount", "expression": "(qty * price) * discountRate", "priority": 2 },
    { "id": "d_3", "type": "calculation", "scope": "row", "target": "vat", "expression": "(qty * price) * vatRate", "priority": 2 },
    { "id": "h_total", "type": "aggregation", "scope": "header", "target": "total", "expression": "rows.reduce((s,r)=>s+r.subTotal,0)", "priority": 2 },
    { "id": "h_discount", "type": "aggregation", "scope": "header", "target": "discountTotal", "expression": "rows.reduce((s,r)=>s+r.discount,0)", "priority": 2 },
    { "id": "h_discount", "type": "calculation", "scope": "header", "target": "discountTotalB", "expression": "total * discountRate", "priority": 3 },
    { "id": "h_grandTotal", "type": "aggregation", "scope": "header", "target": "grandTotal", "expression": "rows.reduce((sum, r) => sum + r.subTotal, 0)" },
    { "id": "dad", "type": "calculation", "scope": "row", "target": "discount", "expression": "subTotal * discountRate * (-1)", "when": "subTotal > 20", "priority": 3 },
    { "id": "dfdr3", "type": "calculation", "scope": "row", "target": "vat", "expression": "vat * vat", "when": "subTotal > 20", "priority": 4 },
    { "id": "dfdr4", "type": "calculation", "scope": "row", "target": "result", "expression": "string1 < string2", "priority": 4 }
  ]
}


 

