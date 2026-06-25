export type RuleType = "calculation" | "validation" | "aggregation" | "assignment" | "lookup";

 
/*
export interface Rule {
  id: string;
  type: RuleType;
  target: string;
  expression: string;
}
*/

 

export type CalcContext = Record<string, any>;

export type CalcEngineConfig = {
  
  /*
   round per row may lead to cumulative error

   'final-only' (🔥 RECOMMENDED)
// during rule execution
store raw values internally

// only when patching to form
finalValue = applyRounding(rawValue, decimals);

👉 Best for:

financial accuracy
totals consistency
avoiding drift

  */

  roundingMode?: 'none' | 'final-only' | 'per-step'
  rounding?: number; // global decimal places
  debug?: boolean;


}



// older??
export type CalcEngine = {



  /**
   * Evaluate a single expression against a context
   */
  evaluate: (expression: string, context: CalcContext) => any;

  /**
   * Compile expression once (optional optimisation)
   */
  compile?: (expression: string) => CompiledExpression;

  /**
   * Evaluate using precompiled expression
   */
  runCompiled?: (compiled: CompiledExpression, context: CalcContext) => any;

  update: (i: number, field: string, value: any) => any;

  state: { details: any; header: any; }

};

export type CompiledExpression = {
  original: string;
  fn: (ctx: CalcContext) => any;
  deps?: string[]; // optional: for dependency tracking later
};

export type Rule = {
  id: string; // unique

  type: RuleType;

  /**
   * Where the rule runs
   */
  scope: 'row' | 'header';

  /**
   * Field to write result into
   */
  target: string;

  /**
   * Expression to evaluate
   */
  expression: string;

  /**
   * Optional conditional execution
   */
  when?: string;

  /**
   * Optional execution priority
   */
  priority?: number;

  rounding?: number; // override per rule
  /*
How it should behave
Scenario	            Result
No rounding anywhere	raw JS result
Global rounding = 2	  everything rounded to 2dp
Rule rounding = 4	    overrides global
Value = 0/null	      no unnecessary rounding
  */

ignore?: boolean;

  description?: string;
  tag?: string;

  createdAt?: string;
 updatedAt?: string;
};