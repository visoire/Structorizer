// SPDX-License-Identifier: GPL-3.0-or-later
// Static diagram analyser (Phase 3): detects structural issues, uninitialized variables,
// modified FOR counters, constant reassignments, potential endless loops (#1081), and missing routines.
import type { Diagram, Element, For } from '../model/types';
import { slotsOf, walk } from '../model/tree';
import {
  calledRoutine, caseInfo, classifyLine, forInfo, parseSignature, resultVariable,
} from './analyze';
import { getElementAst, type Expr, type LValue } from './parser';
import { isTurtleRoutine } from '../exec/turtle';

export type FindingSeverity = 'error' | 'warning' | 'hint';

export interface AnalyserFinding {
  code: string;
  severity: FindingSeverity;
  elementId: string;
  message: string;
}

const BUILTIN_FUNCS = new Set([
  'abs', 'sgn', 'sqrt', 'sqr', 'pow', 'exp', 'log', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'toradians', 'todegrees', 'floor', 'ceil', 'round', 'min', 'max', 'random', 'randomize',
  'inc', 'dec', 'length', 'len', 'count', 'lowercase', 'tolower', 'uppercase', 'toupper', 'trim',
  'pos', 'copy', 'substring', 'ord', 'chr', 'strtoint', 'int', 'parseint', 'strtodouble',
  'strtofloat', 'float', 'parsedouble', 'strtobool', 'inttostr', 'doubletostr', 'str', 'tostring',
  'isarray', 'ischar', 'isbool', 'isnumber', 'isstring',
]);

function rootVarOfLValue(lv: LValue): string {
  if (lv.t === 'var') return lv.name;
  return rootVarOfLValue(lv.target);
}

function collectExprIds(expr: Expr | undefined, out: Set<string>): void {
  if (!expr) return;
  switch (expr.t) {
    case 'id':
      if (expr.name.toLowerCase() !== 'pi' && expr.name.toLowerCase() !== 'e') out.add(expr.name);
      break;
    case 'unary':
      collectExprIds(expr.arg, out);
      break;
    case 'binary':
      collectExprIds(expr.left, out);
      collectExprIds(expr.right, out);
      break;
    case 'call':
      expr.args.forEach((a) => collectExprIds(a, out));
      break;
    case 'index':
      collectExprIds(expr.target, out);
      collectExprIds(expr.index, out);
      break;
    case 'member':
      collectExprIds(expr.target, out);
      break;
    case 'array':
      expr.items.forEach((a) => collectExprIds(a, out));
      break;
    case 'record':
      expr.fields.forEach((f) => collectExprIds(f.value, out));
      break;
  }
}

function collectLValueIndexIds(lv: LValue, out: Set<string>): void {
  if (lv.t === 'index') {
    collectExprIds(lv.index, out);
    collectLValueIndexIds(lv.target, out);
  } else if (lv.t === 'member') {
    collectLValueIndexIds(lv.target, out);
  }
}

/** Variables modified anywhere inside a sequence of elements (for loop counter & endless-loop checks). */
function modifiedVarsInSeq(seq: Element[], k: Diagram['keywords']): Set<string> {
  const mods = new Set<string>();
  const visitSeq = (els: Element[]) => {
    for (const el of els) {
      if (el.disabled) continue;
      if (el.kind === 'for') {
        const fi = forInfo(el as For, k);
        if (fi.var) mods.add(fi.var);
      }
      if (el.kind === 'instruction' || el.kind === 'call') {
        const ast = getElementAst(el, k);
        for (const st of ast.stmts) {
          if (st.t === 'assign') mods.add(rootVarOfLValue(st.target));
          else if (st.t === 'input') st.targets.forEach((t) => mods.add(rootVarOfLValue(t)));
          else if (st.t === 'call') {
            const low = st.name.toLowerCase();
            if ((low === 'inc' || low === 'dec') && st.args[0]?.t === 'id') {
              mods.add(st.args[0].name);
            }
          }
        }
      }
      for (const slot of slotsOf(el)) visitSeq(slot.seq);
    }
  };
  visitSeq(seq);
  return mods;
}

function hasJumpOutInSeq(seq: Element[], k: Diagram['keywords']): boolean {
  let found = false;
  const visitSeq = (els: Element[]) => {
    for (const el of els) {
      if (el.disabled || found) continue;
      if (el.kind === 'jump') { found = true; return; }
      if (el.kind === 'instruction') {
        const ast = getElementAst(el, k);
        if (ast.stmts.some((s) => s.t === 'leave' || s.t === 'return' || s.t === 'exit' || s.t === 'throw')) {
          found = true;
          return;
        }
      }
      for (const slot of slotsOf(el)) visitSeq(slot.seq);
    }
  };
  visitSeq(seq);
  return found;
}

/**
 * Run static analysis on a diagram (and optional workspace pool) returning findings keyed by `elementId`.
 */
export function analyseDiagram(d: Diagram, pool: Diagram[] = []): AnalyserFinding[] {
  const findings: AnalyserFinding[] = [];
  const k = d.keywords;
  const sig = parseSignature(d);
  const eq = (a: string, b: string) => (k.ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b);

  // Track initialized variables and constants in pre-order flow
  const initialized = new Set<string>();
  const consts = new Set<string>();
  const typeNames = new Set<string>();

  if (d.diagramType === 'sub') {
    for (const p of sig.params) initialized.add(p.name);
  }

  // Include variables/constants/types from included diagrams in the pool
  for (const incName of d.includeList) {
    const inc = pool.find((p) => p.diagramType === 'includable' && eq(parseSignature(p).name, incName));
    if (!inc) {
      findings.push({
        code: 'A09',
        severity: 'warning',
        elementId: d.id,
        message: `Included diagram "${incName}" is not open in the Arranger pool.`,
      });
    } else if (inc) {
      walk(inc, (el) => {
        if (el.kind !== 'instruction') return;
        for (const st of getElementAst(el, inc.keywords).stmts) {
          if (st.t === 'assign') {
            const v = rootVarOfLValue(st.target);
            initialized.add(v);
            if (st.isConst) consts.add(v);
          } else if (st.t === 'decl') {
            st.names.forEach((n) => {
              initialized.add(n);
              if (st.isConst) consts.add(n);
            });
          } else if (st.t === 'typedef') {
            typeNames.add(st.name);
          }
        }
      });
    }
  }

  const checkReadVars = (expr: Expr | undefined, elId: string) => {
    const reads = new Set<string>();
    collectExprIds(expr, reads);
    for (const name of reads) {
      if (typeNames.has(name)) continue;
      const isInit = [...initialized].some((v) => eq(v, name));
      if (!isInit) {
        findings.push({
          code: 'A02',
          severity: 'warning',
          elementId: elId,
          message: `Variable "${name}" may be used before it is initialized.`,
        });
      }
    }
  };

  let hasReturnOrResult = false;
  const resVar = d.diagramType === 'sub' ? resultVariable(d, sig.name) : null;
  if (resVar) hasReturnOrResult = true;

  const visitElement = (el: Element, activeForCounters: string[]) => {
    if (el.disabled) return;
    const raw = el.text.join(' ').trim();

    if (
      (el.kind === 'instruction' || el.kind === 'call' || el.kind === 'alternative' || el.kind === 'while' || el.kind === 'repeat') &&
      raw === ''
    ) {
      findings.push({
        code: 'A01',
        severity: 'warning',
        elementId: el.id,
        message: `Empty ${el.kind} element text.`,
      });
    }

    switch (el.kind) {
      case 'instruction':
      case 'call':
      case 'jump': {
        const ast = getElementAst(el, k);
        for (const st of ast.stmts) {
          if (st.t === 'typedef') {
            typeNames.add(st.name);
          } else if (st.t === 'decl') {
            for (const name of st.names) {
              initialized.add(name);
              if (st.isConst) consts.add(name);
            }
          } else if (st.t === 'assign') {
            checkReadVars(st.expr, el.id);
            const idxReads = new Set<string>();
            collectLValueIndexIds(st.target, idxReads);
            for (const r of idxReads) {
              if (![...initialized].some((v) => eq(v, r))) {
                findings.push({
                  code: 'A02',
                  severity: 'warning',
                  elementId: el.id,
                  message: `Index variable "${r}" may be used before initialization.`,
                });
              }
            }
            const targetVar = rootVarOfLValue(st.target);
            if (!st.decl && !st.isConst && [...consts].some((c) => eq(c, targetVar))) {
              findings.push({
                code: 'A05',
                severity: 'error',
                elementId: el.id,
                message: `Constant "${targetVar}" cannot be reassigned.`,
              });
            }
            if (activeForCounters.some((c) => eq(c, targetVar))) {
              findings.push({
                code: 'A03',
                severity: 'warning',
                elementId: el.id,
                message: `Loop counter "${targetVar}" is modified inside the FOR loop body.`,
              });
            }
            initialized.add(targetVar);
            if (st.isConst) consts.add(targetVar);
          } else if (st.t === 'input') {
            for (const t of st.targets) {
              const targetVar = rootVarOfLValue(t);
              if (activeForCounters.some((c) => eq(c, targetVar))) {
                findings.push({
                  code: 'A03',
                  severity: 'warning',
                  elementId: el.id,
                  message: `Loop counter "${targetVar}" is overwritten by INPUT inside the FOR loop.`,
                });
              }
              initialized.add(targetVar);
            }
          } else if (st.t === 'output') {
            st.exprs.forEach((e) => checkReadVars(e, el.id));
          } else if (st.t === 'return') {
            if (st.expr) {
              checkReadVars(st.expr, el.id);
              hasReturnOrResult = true;
            }
          } else if (st.t === 'exit' || st.t === 'throw') {
            if (st.expr) checkReadVars(st.expr, el.id);
          } else if (st.t === 'call') {
            const low = st.name.toLowerCase();
            if ((low === 'inc' || low === 'dec') && st.args[0]?.t === 'id') {
              const vName = st.args[0].name;
              if (activeForCounters.some((c) => eq(c, vName))) {
                findings.push({
                  code: 'A03',
                  severity: 'warning',
                  elementId: el.id,
                  message: `Loop counter "${vName}" is modified inside the FOR loop body.`,
                });
              }
            }
            st.args.forEach((a) => checkReadVars(a, el.id));
          }
        }
        // Check subroutine resolution when a Call element invokes a routine
        if (el.kind === 'call' && pool.length > 1) {
          for (const line of el.text) {
            const c = calledRoutine(line, k);
            if (
              c &&
              !BUILTIN_FUNCS.has(c.name.toLowerCase()) &&
              !isTurtleRoutine(c.name) &&
              !pool.some((p) => p.diagramType === 'sub' && eq(parseSignature(p).name, c.name))
            ) {
              findings.push({
                code: 'A09',
                severity: 'hint',
                elementId: el.id,
                message: `Subroutine "${c.name}(${c.argc})" is not open in the Arranger pool.`,
              });
            }
          }
        }
        break;
      }
      case 'alternative': {
        const ast = getElementAst(el, k);
        checkReadVars(ast.condition, el.id);
        if (el.thenBranch.length === 0 && el.elseBranch.length === 0) {
          findings.push({
            code: 'A07',
            severity: 'warning',
            elementId: el.id,
            message: 'IF element has both empty THEN and ELSE branches.',
          });
        }
        el.thenBranch.forEach((c) => visitElement(c, activeForCounters));
        el.elseBranch.forEach((c) => visitElement(c, activeForCounters));
        break;
      }
      case 'case': {
        const ci = caseInfo(el.text, k);
        if (!ci.discriminator || ci.discriminator === 'true') {
          findings.push({
            code: 'A07',
            severity: 'warning',
            elementId: el.id,
            message: 'CASE element is missing a discriminator expression.',
          });
        }
        for (const b of el.branches) {
          b.forEach((c) => visitElement(c, activeForCounters));
        }
        break;
      }
      case 'for': {
        const fi = forInfo(el as For, k);
        if (fi.style === 'FREETEXT') {
          findings.push({
            code: 'A06',
            severity: 'warning',
            elementId: el.id,
            message: `FOR loop header "${fi.raw}" could not be parsed as COUNTER or TRAVERSAL.`,
          });
        }
        const ast = getElementAst(el, k);
        checkReadVars(ast.condition, el.id);
        if (fi.var) initialized.add(fi.var);
        if (el.body.length === 0) {
          findings.push({
            code: 'A07',
            severity: 'hint',
            elementId: el.id,
            message: 'FOR loop body is empty.',
          });
        }
        const nextCounters = fi.var && fi.style === 'COUNTER' ? [...activeForCounters, fi.var] : activeForCounters;
        el.body.forEach((c) => visitElement(c, nextCounters));
        break;
      }
      case 'while':
      case 'repeat': {
        const ast = getElementAst(el, k);
        if (el.kind === 'while') checkReadVars(ast.condition, el.id);
        const condVars = new Set<string>();
        collectExprIds(ast.condition, condVars);
        const bodyMods = modifiedVarsInSeq(el.body, k);
        if (
          condVars.size > 0 &&
          ![...condVars].some((cv) => [...bodyMods].some((mv) => eq(cv, mv))) &&
          !hasJumpOutInSeq(el.body, k)
        ) {
          findings.push({
            code: 'A04',
            severity: 'warning',
            elementId: el.id,
            message: `Potential endless ${el.kind.toUpperCase()} loop: condition variable (${[...condVars].join(', ')}) is not modified in the loop body.`,
          });
        }
        el.body.forEach((c) => visitElement(c, activeForCounters));
        if (el.kind === 'repeat') checkReadVars(ast.condition, el.id);
        break;
      }
      case 'forever': {
        if (!hasJumpOutInSeq(el.body, k)) {
          findings.push({
            code: 'A04',
            severity: 'warning',
            elementId: el.id,
            message: 'Endless loop has no leave, return, exit, or throw statement inside its body.',
          });
        }
        el.body.forEach((c) => visitElement(c, activeForCounters));
        break;
      }
      case 'parallel': {
        for (const b of el.branches) {
          b.forEach((c) => visitElement(c, activeForCounters));
        }
        break;
      }
      case 'try': {
        el.tryBody.forEach((c) => visitElement(c, activeForCounters));
        const catchVar = el.text[0]?.trim() || 'ex';
        initialized.add(catchVar);
        el.catchBody.forEach((c) => visitElement(c, activeForCounters));
        el.finallyBody.forEach((c) => visitElement(c, activeForCounters));
        break;
      }
    }

    if ( classifyLine(raw, k).t === 'assign' ) {
      // already handled
    }
  };

  for (const child of d.children) {
    visitElement(child, []);
  }

  if (d.diagramType === 'sub' && sig.result !== undefined && !hasReturnOrResult && d.children.length > 0) {
    findings.push({
      code: 'A08',
      severity: 'warning',
      elementId: d.id,
      message: `Function "${sig.name}" declares return type "${sig.result.base}" but never returns a value or assigns to "result".`,
    });
  }

  return findings;
}
