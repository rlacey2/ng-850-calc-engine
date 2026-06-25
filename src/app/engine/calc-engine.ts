// Rule Engine DSL (Domain-Specific Language) for header and detail calculations

import jsep from 'jsep';
import arrow from '@jsep-plugin/arrow';
import { CalcEngineConfig, Rule } from './types';

/*

Rules are passed in, i.e. created elsewhere into the correct syntax.

The engine takes, global header rules (headers/footers) and detail row rules.

Detail row rules are applied to each row. Details rows may access global and vice versa.

Features:
========
dependency graph
circular detection
execution ordering
debug tracing hook

Tracing:
=======

a trace system that captures:

what rule ran
whether it was skipped (WHEN)
inputs used
output produced
dependencies
execution order

execution order must be:

1. Dependency order (MUST come first)
2. Then priority (tie-breaker)
3. Then stable fallback (id)

*/

// 1. Explicitly register the arrow function plugin with the parser
jsep.plugins.register(arrow);  // needed by the DSL builder

// Whitelist of allowed core functions to prevent sandbox escape
// 1. Unified configuration containing custom logic definitions
export const SAFE_FUNCTIONS: { [key: string]: Function } = {
  round: (x: number, p = 2) => Number(Number(x).toFixed(p)),
  min: Math.min,
  max: Math.max,
  sum: (arr: number[]) => Array.isArray(arr) ? arr.reduce((a, b) => a + Number(b || 0), 0) : 0,

  // String / Strict Equality Comparisons
  eq: (a: any, b: any) => String(a) === String(b),
  neq: (a: any, b: any) => String(a) !== String(b),

  // Case-Insensitive Options (highly useful for user-inputted strings)
  eqIE: (a: any, b: any) => String(a).toLowerCase() === String(b).toLowerCase(),
};

// 2. Explicit whitelist for native JavaScript chainable array prototype methods
const ALLOWED_ARRAY_METHODS = new Set(['reduce', 'map', 'filter', 'find', 'count']);

function compileDSL(exprString: string) {  // Domain Specific Language i.e. a grammer syntax that is safe

  // build a DSL tree to allow for an expression so for safe evaluation of runtime calculations/business logic

  const ast = jsep(exprString);

  const dependencies = new Set<string>(); // NEW: track dependencies

  // called recurively
  function walk(node: any, localVars: Set<string> = new Set()): string {
    if (!node) return '';

    if (node.property?.name === 'constructor' || node.property?.name === '__proto__') {
      throw new Error(`Security Exception: Blocked malicious access to '${node.property.name}'`);
    }

    switch (node.type) {
      case 'Literal':
        return typeof node.value === 'string' ? `'${node.value}'` : String(node.value);

      case 'Identifier':
        if (localVars.has(node.name)) return node.name;

        if (SAFE_FUNCTIONS[node.name]) return `fn.${node.name}`;

        dependencies.add(node.name); // track field usage
        return `ctx.${node.name}`;

      case 'MemberExpression': {
        const objectStr = walk(node.object, localVars);
        const propertyStr = node.computed ? walk(node.property, localVars) : node.property.name;
        return node.computed ? `${objectStr}[${propertyStr}]` : `${objectStr}.${propertyStr}`;
      }

      case 'CallExpression': {
        if (node.callee.type === 'MemberExpression') {
          const methodName = node.callee.property.name;

          if (!ALLOWED_ARRAY_METHODS.has(methodName) && !SAFE_FUNCTIONS[methodName]) {
            throw new Error(`Security Exception: Execution of method '${methodName}' is restricted.`);
          }

          const objectStr = walk(node.callee.object, localVars);
          const args = node.arguments.map((arg: any) => walk(arg, localVars)).join(', ');
          return `${objectStr}.${methodName}(${args})`;
        }

        const callee = walk(node.callee, localVars);
        const args = node.arguments.map((arg: any) => walk(arg, localVars)).join(', ');
        return `${callee}(${args})`;
      }

      case 'ArrowFunctionExpression': {
        const currentLocals = new Set(localVars);

        const params = node.params.map((p: any) => {
          currentLocals.add(p.name);
          return p.name;
        });

        const body = walk(node.body, currentLocals);
        return `(${params.join(', ')}) => ${body}`;
      }

      case 'BinaryExpression':
        return `${walk(node.left, localVars)} ${node.operator} ${walk(node.right, localVars)}`;

      case 'UnaryExpression':
        return `(${node.operator}${walk(node.argument, localVars)})`;

      default:
        throw new Error(`Unsupported DSL compilation structure: ${node.type}`);
    }
  }

  const cleanCode = walk(ast);  // build the clean code

  return {
    fn: new Function("ctx", "fn", `return ${cleanCode};`),
    dependsOn: Array.from(dependencies)
  };
}

// =========================================================================
// 🚀 CLASS ENGINE
// =========================================================================
export class CalcEngine {
  // an engine should be associated with a form.
  // coded currently that the engine key functions are passed the form, so one engine is reusable
  private rulesByScope: { row: any[]; header: any[] };
  private config: CalcEngineConfig;
  private roundingMode: string;
  private debug: boolean;
  private traceLog: any[] = [];

  constructor(rules: Rule[], engineConfig: CalcEngineConfig = {}) {

    console.log("ensure disabled/hidden fields are available to the logic")

    this.config = engineConfig ?? {};
    this.roundingMode = this.config.roundingMode ?? 'none';
    this.debug = !!this.config.debug;

    const compiled = rules
      .filter(r => !r.ignore)
      .map(rule => {
        const compiledExpr = compileDSL(rule.expression);
        const compiledWhen = rule.when ? compileDSL(rule.when) : null;

        console.log(rule.expression)
        console.log(compiledExpr)

        return {
          ...rule,
          fn: compiledExpr.fn,
          whenFn: compiledWhen?.fn,
          dependsOn: compiledExpr.dependsOn
        };
      });

    this.rulesByScope = { // dependency graph
      row: this.buildExecutionOrder(compiled.filter(r => r.scope === 'row')),
      header: this.buildExecutionOrder(compiled.filter(r => r.scope === 'header'))
    };
  }

  // =========================================================================
  // Dependency Graph + Circular Detection
  // =========================================================================

private buildExecutionOrder(rules: any[]) {

  console.log('buildExecutionOrder');

  /*

  called twice:
    row
    header

 two guard rails:
 Filter out self-references: A rule must never look outside itself for its own target name.
 Target only the final pipeline step: External rules depending on subTotal should only link to the very last
  (highest priority) rule of that target sequence. That final rule will then safely pull the rest of its 
  chain backward via the internal priority links.

  */

  const result: any[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const getKey = (r: any) => `${r.scope}:${r.target}:${r.id}`;

  const rowTargetMap = new Map<string, any[]>();
  const headerTargetMap = new Map<string, any[]>();

  for (const r of rules) {
    const map = r.scope === 'row' ? rowTargetMap : headerTargetMap;
    if (!map.has(r.target)) {
      map.set(r.target, []);
    }
    map.get(r.target)!.push(r);
  }

  // ⛓️ Link sequential rules by priority order
  const sortAndLinkByPriority = (rulesGroup: any[]) => {
    rulesGroup.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
    for (let i = 1; i < rulesGroup.length; i++) {
      const current = rulesGroup[i];
      const previous = rulesGroup[i - 1];
      
      if (!current._internalDeps) current._internalDeps = [];
      current._internalDeps.push(previous);
    }
  };

  rowTargetMap.forEach(sortAndLinkByPriority);
  headerTargetMap.forEach(sortAndLinkByPriority);

  // 🔍 Fixed Resolver: Only returns the LAST rule in the priority sequence
  const resolveExternalDependency = (rule: any, dep: string): any | null => {
    // 🛑 Rule 1: A rule cannot look externally for its own target sequence
    if (rule.target === dep) {
      return null; 
    }

    let matchingRules: any[] = [];
    if (rule.scope === 'row') {
      matchingRules = [...(rowTargetMap.get(dep) ?? []), ...(headerTargetMap.get(dep) ?? [])];
    } else if (rule.scope === 'header') {
      matchingRules = headerTargetMap.get(dep) ?? [];
    }

    if (matchingRules.length === 0) return null;

    // 🛑 Rule 2: Only depend on the LATEST rule in the chain.
    // The internal chain (_internalDeps) will naturally pull the earlier rules down in order.
    return matchingRules.reduce((max, r) => ((r.priority ?? 999) > (max.priority ?? 999) ? r : max), matchingRules[0]);
  };

  // 🔄 DFS (topological sort)
  const visit = (rule: any) => {
    const key = getKey(rule);

    if (visited.has(key)) return;

    if (visiting.has(key)) {
      throw new Error(`❌ Circular dependency detected at ${key}`);
    }

    visiting.add(key);

    // 1. Process previous priority steps first (e.g., d_1 -> d_2 -> d_3)
    for (const intDep of rule._internalDeps ?? []) {
      visit(intDep);
    }

    // 2. Process external dependencies safely
    for (const dep of rule.dependsOn ?? []) {
      const depRule = resolveExternalDependency(rule, dep);
      if (depRule) {
        visit(depRule);
      }
    }

    visiting.delete(key);
    visited.add(key);

    result.push(rule);
  };

  // Seed DFS
  const sortedInput = [...rules].sort((a, b) => {
    const pA = a.priority ?? 999;
    const pB = b.priority ?? 999;
    if (pA !== pB) return pA - pB;

    const kA = `${a.scope}:${a.target}:${a.id}`;
    const kB = `${b.scope}:${b.target}:${b.id}`;
    return kA.localeCompare(kB);
  });

  for (const rule of sortedInput) {
    visit(rule);
  }

  return result.map(({ _internalDeps, ...cleanRule }) => cleanRule);
}


private ZZbuildExecutionOrder(rules: any[]) {
  console.log('buildExecutionOrder');

  const result: any[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  // 🔑 Unique composite key helper for full tracking
  const getKey = (r: any) => `${r.scope}:${r.target}:${r.id}`;

  // 🗺️ Build scope-aware maps mapping to ARRAYS of rules
  const rowTargetMap = new Map<string, any[]>();
  const headerTargetMap = new Map<string, any[]>();

  for (const r of rules) {
    const map = r.scope === 'row' ? rowTargetMap : headerTargetMap;
    if (!map.has(r.target)) {
      map.set(r.target, []);
    }
    map.get(r.target)!.push(r);
  }

  // 🔍 Dependency resolver (returns all matching rules)
  const resolveDependencies = (rule: any, dep: string): any[] => {
    if (rule.scope === 'row') {
      // row can depend on row OR header
      return [...(rowTargetMap.get(dep) ?? []), ...(headerTargetMap.get(dep) ?? [])];
    }

    if (rule.scope === 'header') {
      // header should only depend on header
      return headerTargetMap.get(dep) ?? [];
    }

    return [];
  };

  // 🔄 DFS (topological sort)
  const visit = (rule: any) => {
    const key = getKey(rule);

    if (visited.has(key)) return;

    if (visiting.has(key)) {
      throw new Error(`❌ Circular dependency detected at ${key}`);
    }

    visiting.add(key);

    // visit all matching dependency rules first
    for (const dep of rule.dependsOn ?? []) {
      const depRules = resolveDependencies(rule, dep);
      for (const depRule of depRules) {
        visit(depRule);
      }
    }

    visiting.delete(key);
    visited.add(key);

    result.push(rule);
  };

  // 🔥 PRIORITY-AWARE ENTRY ORDER
  const sortedInput = [...rules].sort((a, b) => {
    const pA = a.priority ?? 999;
    const pB = b.priority ?? 999;

    if (pA !== pB) return pA - pB;

    const kA = `${a.scope}:${a.target}:${a.id}`;
    const kB = `${b.scope}:${b.target}:${b.id}`;

    return kA.localeCompare(kB);
  });

  // 🚀 Execute ordering
  for (const rule of sortedInput) {
    visit(rule);
  }

  return result;
}


  
  private  zzzbuildExecutionOrder(rules: any[]) {

    console.log('buildExecutionOrder')

    const result: any[] = [];

    const visited = new Set<string>();
    const visiting = new Set<string>();

    // ---------------------------------------
    // 🔑 Composite key helper (scope + target)
    // ---------------------------------------
    const getKey = (r: any) => `${r.scope}:${r.target}`;

    // ---------------------------------------
    // 🗺️ Build scope-aware maps
    // ---------------------------------------
    const rowTargetMap = new Map<string, any>();
    const headerTargetMap = new Map<string, any>();

    for (const r of rules) {
      if (r.scope === 'row') {
        rowTargetMap.set(r.target, r);
      } else if (r.scope === 'header') {
        headerTargetMap.set(r.target, r);
      }
    }

    // ---------------------------------------
    // 🔍 Dependency resolver (scope-aware)
    // ---------------------------------------
    const resolveDependency = (rule: any, dep: string) => {

      if (rule.scope === 'row') {
        // row can depend on row OR header
        return rowTargetMap.get(dep) || headerTargetMap.get(dep);
      }

      if (rule.scope === 'header') {
        // header should only depend on header
        return headerTargetMap.get(dep);
      }

      return null;
    };

    // ---------------------------------------
    // 🔄 DFS (topological sort)
    // ---------------------------------------
    const visit = (rule: any) => {

      const key = getKey(rule);

      if (visited.has(key)) return;

      if (visiting.has(key)) {
        throw new Error(`❌ Circular dependency detected at ${key}`);
      }

      visiting.add(key);

      // visit dependencies first
      for (const dep of rule.dependsOn ?? []) {

        const depRule = resolveDependency(rule, dep);

        if (depRule) {
          visit(depRule);
        }
      }

      visiting.delete(key);
      visited.add(key);

      result.push(rule);
    };

    // ---------------------------------------
    // 🔥 PRIORITY-AWARE ENTRY ORDER
    // ---------------------------------------
    const sortedInput = [...rules].sort((a, b) => {

      const pA = a.priority ?? 999;
      const pB = b.priority ?? 999;

      if (pA !== pB) return pA - pB;

      // stable fallback
      const kA = `${a.scope}:${a.target}:${a.id}`;
      const kB = `${b.scope}:${b.target}:${b.id}`;

      return kA.localeCompare(kB);
    });

    // ---------------------------------------
    // 🚀 Execute ordering
    // ---------------------------------------
    for (const rule of sortedInput) {
      visit(rule);
    }

    return result;
  }



  private zzzzbuildExecutionOrder(rules: any[]) {

     console.log('buildExecutionOrder')
    const map = new Map<string, any>();
    rules.forEach(r => map.set(r.target, r));

    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: any[] = [];

    const visit = (rule: any) => {
      if (visited.has(rule.target)) return;

      if (visiting.has(rule.target)) {
        throw new Error(`Circular dependency detected at '${rule.target}'`);
      }

      visiting.add(rule.target);

      for (const dep of rule.dependsOn) {
        if (map.has(dep)) {
          visit(map.get(dep));
        }
      }

      visiting.delete(rule.target);
      visited.add(rule.target);
      result.push(rule);
    };

    rules.forEach(visit);

    return result;
  }

  // =========================================================================
  // 🔧 Helpers
  // =========================================================================

  private createProxyContext(primary: any, secondary?: any, extra?: any) {
    return new Proxy({}, {
      get: (_, prop: string) => {
        if (extra && prop in extra) return extra[prop];
        if (primary && prop in primary) return primary[prop];
        if (secondary && prop in secondary) return secondary[prop];
        return undefined;
      }
    });
  }

  private shouldRunRule(rule: any, ctx: any): boolean {
    // console.log('shouldRunRule')
    if (!rule.whenFn) return true;
    try {
      return !!rule.whenFn(ctx);
    } catch (e) {
      console.warn('WHEN condition failed:', rule.id, e);
      return false;
    }
  }

  private applyRounding(value: any, decimals?: number) {
    if (decimals == null) return value;
    const num = Number(value);
    if (isNaN(num)) return value;
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
  }

  private getFinalValue(rule: any, rawValue: any) {
    const decimals = rule.rounding ?? this.config.rounding;

    if (this.roundingMode === 'none' || this.roundingMode === 'final-only') return rawValue;
    if (this.roundingMode === 'per-step') return this.applyRounding(rawValue, decimals);

    return rawValue;
  }

  private sortRules(rules: any[]) {

    return rules.sort((a, b) => {

      // 1. Dependency depth (if you have it)
      const depthA = a.depth ?? 0;
      const depthB = b.depth ?? 0;

      if (depthA !== depthB) {
        return depthA - depthB;
      }

      // 2. Priority (LOW number runs first)
      const priorityA = a.priority ?? 999;
      const priorityB = b.priority ?? 999;

      return priorityA - priorityB;
    });
  }

  private extractDeps(expression: string): string[] {
  if (!expression) return [];

  const tokens = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];

  const reserved = new Set([
    'Math', 'sum', 'min', 'max', 'if', 'else', 'return', 'true', 'false'
  ]);

  return [...new Set(tokens.filter(t => !reserved.has(t)))];
}



  calcHeaders(header: any, rows: any) {
    // multiple callers
    // Execute all header-scoped rules sequentially against the header dataset
    for (const rule of this.rulesByScope.header) {

      const ctx: any = this.createProxyContext(header, null, { rows }); // must stay inside loop, to get mutated context

      const inputSnapshot: any = {};
      rule.dependsOn.forEach((d: string) => inputSnapshot[d] = ctx[d]);

      let skipped = false;
      let output;

      if (!this.shouldRunRule(rule, ctx)) {
        skipped = true;
      } else {
        output = rule.fn(ctx);
        header[rule.target] = this.getFinalValue(rule, output);
      }

      this.traceLog.push({
        scope: 'header',
        ruleId: rule.id,
        target: rule.target,
        deps: rule.dependsOn,
        input: inputSnapshot,
        output,
        skipped
      });
    }
  }


  // =========================================================================
  // 🔹 Calculation Trace
  // =========================================================================

  public getTrace() {
    console.log('getTrace()')
    return this.traceLog;
  }

  public getTraceGrouped() {
    return this.traceLog.reduce((acc, t) => {

      const key = t.scope === 'row'
        ? `row-${t.input?.id ?? 'unknown'}`
        : 'header';

      if (!acc[key]) acc[key] = [];
      acc[key].push(t);

      return acc;

    }, {});
  }

  // =========================================================================
  // 🔹 RECALC ALL
  // =========================================================================
  public recalcAll(form: any) {

    // passing in form rather than storing, means the same rules engine could be reused on 
    // more that 1 form, it rather that create an engine per form.

    console.log('recalcAll')

    this.traceLog = [];

    // Use getRawValue() so disabled/read-only controls are included
    const rawFormValues = form.getRawValue();
    const header = { ...rawFormValues.header };
    const rows = rawFormValues.details.map((row: any) => ({ ...row }));

    for (const row of rows) {
      for (const rule of this.rulesByScope.row) {

        const ctx: any = this.createProxyContext(row, header); // must stay inside loop, to get mutated context

        const inputSnapshot: any = {};
        rule.dependsOn.forEach((d: string) => inputSnapshot[d] = ctx[d]);

        let skipped = false;
        let output;

        if (!this.shouldRunRule(rule, ctx)) {
          skipped = true;
        } else {
          output = rule.fn(ctx);
          row[rule.target] = this.getFinalValue(rule, output);
        }

        this.traceLog.push({
          scope: 'row',
          ruleId: rule.id,
          target: rule.target,
          deps: rule.dependsOn,
          input: inputSnapshot,
          output,
          skipped
        });
      }
    }

    this.calcHeaders(header, rows)

    // Final-only rounding
    if (this.roundingMode === 'final-only') {
      for (const row of rows) {
        for (const rule of this.rulesByScope.row) {
          row[rule.target] = this.applyRounding(row[rule.target], rule.rounding ?? this.config.rounding);
        }
      }
      for (const rule of this.rulesByScope.header) {
        header[rule.target] = this.applyRounding(header[rule.target], rule.rounding ?? this.config.rounding);
      }
    }

    // patch results
    // each row/detail
    rows.forEach((detail: any, i: number) => {
      form.get('details').at(i).patchValue(detail, { emitEvent: false });
    });

    // the header
    form.get('header').patchValue(header, { emitEvent: false });
  }



  // =========================================================================
  // 🔹 SINGLE ROW / HEADER EVALUATE
  // =========================================================================
  public evaluate(form: any, targetScope: 'row' | 'header', rowIndex: number, data: { header: any, row?: any, rows?: any[] }) {
    console.log('evaluate')

 console.log('not sure this is working for single row and then back to header that needs all rows')

    // Create local shallow copies to prevent unmanaged side-effects
    this.traceLog = [];

    // Use getRawValue() so disabled/read-only controls are included
    const rawFormValues = form.getRawValue();
    const header = { ...rawFormValues.header };
    const rows = rawFormValues.details.map((row: any) => ({ ...row }));

    const row = (rows && rowIndex > -1) ? { ...rows[rowIndex] } : null;


    if (targetScope === 'row') {
      if (!row) throw new Error("A 'row' data object must be provided for row-scoped evaluation.");

      // Execute all row-scoped rules sequentially for this single row item
      for (const rule of this.rulesByScope.row) {

        const ctx: any = this.createProxyContext(row, header);  // must stay inside loop, to get mutated context

        const inputSnapshot: any = {};
        rule.dependsOn.forEach((d: string) => inputSnapshot[d] = ctx[d]);

        let skipped = false;
        let output;

        if (!this.shouldRunRule(rule, ctx)) {
          skipped = true;
        } else {
          output = rule.fn(ctx);
          row[rule.target] = this.getFinalValue(rule, output);
        }

        this.traceLog.push({
          scope: 'row',
          ruleId: rule.id,
          target: rule.target,
          deps: rule.dependsOn,
          input: inputSnapshot,
          output,
          skipped
        });
      }

      // Apply fallback rounding configuration if per-step isn't already taking care of it
      if (this.roundingMode === 'final-only') {
        for (const rule of this.rulesByScope.row) {
          row[rule.target] = this.applyRounding(row[rule.target], rule.rounding ?? this.config.rounding);
        }
      }

      form.get('details').at(rowIndex).patchValue(row, { emitEvent: false });
      //   return row; // Returns the completely updated single row snapshot

      // CRITICAL CHAINING STEP: Because a row changed, the header's total/aggregates 
      // likely need to re-run based on the fresh row data.

      this.calcHeaders(header, rows)

      form.get('header').patchValue(header, { emitEvent: false });

    }

    if (targetScope === 'header') {
      // Execute all header-scoped rules sequentially against the header dataset
      this.calcHeaders(header, rows)

      if (this.roundingMode === 'final-only') {
        for (const rule of this.rulesByScope.header) {
          header[rule.target] = this.applyRounding(header[rule.target], rule.rounding ?? this.config.rounding);
        }
      }

      form.get('header').patchValue(header, { emitEvent: false });

      //   return header; // Returns the completely updated header snapshot
    }

    throw new Error(`Invalid target evaluation scope: ${targetScope}`);
  }


  /**
   * Evaluates the calculations sequentially based on a dynamic field change.
   * Handles disabled controls safely and chains row mutations into the header.
   * 
   * @param form The source angular form 
   * @param changedField The property string name that was modified.
   * @param rowIndex Optional index number if the modification happened inside a row array cell.
   */
  public handleFieldChange(form: any, detectedScope: string, changedField: string, rowIndex?: number): void {
    console.log('handleFieldChange', { changedField, rowIndex });

    // 1. Capture absolute state snapshots including all disabled control constants
    const rawFormValues = form.getRawValue();
    const headerSnapshot = rawFormValues.header;
    const rowsSnapshot = rawFormValues.details ?? [];
    /*
        // 2. Determine target scope mapping
        let detectedScope: 'row' | 'header' = 'header';
    
        if (rowIndex !== undefined && rowIndex >= 0) {
          const targetRow = rowsSnapshot[rowIndex];
          if (targetRow && changedField in targetRow) {
            detectedScope = 'row';
          }
        } else if (rowsSnapshot.length > 0 && changedField in rowsSnapshot[0]) {
          detectedScope = 'row';
        }
    */
    // 3. Route calculations and selectively patch modifications
    if (detectedScope === 'row' && rowIndex !== undefined) {
      // Evaluate rules explicitly for the targeted single row modification
      this.evaluate(form, 'row', rowIndex, {
        header: headerSnapshot,
        row: rowsSnapshot[rowIndex]
      });

      /* done in evaluate
      // Update the modified row cell inside the Angular form array snapshot
      form.get('details').at(rowIndex).patchValue(updatedRow, { emitEvent: false });

      // Generate a clean collection array view reflecting the freshly updated row contents
      const freshRowsSnapshot = [...rowsSnapshot];
      freshRowsSnapshot[rowIndex] = updatedRow;

      // Re-run header evaluations to instantly update downstream aggregates (e.g., Grand Totals)
      const updatedHeader = this.evaluate(form, 'header', -1, {
        header: headerSnapshot,
        rows: freshRowsSnapshot
      });

      form.get('header').patchValue(updatedHeader, { emitEvent: false });
      */

    } else {
      // Execute header evaluations directly for root/document level edits
      this.evaluate(form, 'header', -1, {
        header: headerSnapshot,
        rows: rowsSnapshot
      });
      /*
            form.get('header').patchValue(updatedHeader, { emitEvent: false });
            */
    }
  }

}