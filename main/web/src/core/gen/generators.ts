// SPDX-License-Identifier: GPL-3.0-or-later
// Code export (decision D-15: fresh generators, not a port of the Java ones).
// Every output line remembers which elements produced it, so the Code preview can
// highlight the code of the selected element (like the desktop).
import type { Case, Diagram, Element, Keywords } from '../model/types';
import { walk } from '../model/tree';
import {
  caseInfo, calledRoutine, classifyJump, classifyLine, conditionOf, forInfo, parseSignature, parseType,
  resultVariable, type BaseType, type CaseInfo, type ForInfo, type Signature, type Stmt, type TypeInfo,
} from '../lang/analyze';
import { literalType, translateExpr, type ExprCtx, type LangId } from './expr';

export type { LangId } from './expr';

export interface LangInfo { id: LangId; name: string; ext: string }
export const LANGUAGES: LangInfo[] = [
  { id: 'python', name: 'Python', ext: 'py' },
  { id: 'java', name: 'Java', ext: 'java' },
  { id: 'javascript', name: 'JavaScript', ext: 'js' },
  { id: 'cpp', name: 'C++', ext: 'cpp' },
  { id: 'php', name: 'PHP', ext: 'php' },
  { id: 'bash', name: 'Bash', ext: 'sh' },
];

export interface CodeLine { s: string; ids: string[] }
export interface GenResult { code: string; lines: CodeLine[]; fileName: string; lang: LangInfo }
export interface GenOptions {
  /** Other open diagrams: called subroutines and includables are taken from here. */
  pool?: Diagram[];
  involveSubroutines?: boolean;
  version?: string;
}

const VERSION = '3.32-35';

// ------------------------------------------------------------------ helpers

type VarType = { base: BaseType; array: boolean };

function plainIdent(s: string): string | null {
  const t = s.trim();
  return /^[\p{L}_][\p{L}\p{N}_]*$/u.test(t) ? t : null;
}

function joinLines(text: string[]): string[] {
  // honour line continuation (trailing backslash)
  const out: string[] = [];
  let buf = '';
  for (const l of text) {
    if (l.trimEnd().endsWith('\\')) buf += l.trimEnd().slice(0, -1) + ' ';
    else { out.push(buf + l); buf = ''; }
  }
  if (buf) out.push(buf);
  return out;
}

function litToType(l: ReturnType<typeof literalType>): VarType | null {
  if (!l) return null;
  if (l === 'array') return { base: 'unknown', array: true };
  return { base: l === 'bool' ? 'bool' : l, array: false };
}

/** Variables assigned in a diagram, with their best-known type (for typed languages). */
export function collectVariables(d: Diagram, exclude: Set<string>): Map<string, VarType> {
  const vars = new Map<string, VarType>();
  const note = (name: string | null, t: VarType | null, strong = false) => {
    if (!name || exclude.has(name)) return;
    const cur = vars.get(name);
    if (!cur || strong || (cur.base === 'unknown' && t && t.base !== 'unknown')) vars.set(name, t ?? cur ?? { base: 'unknown', array: false });
  };
  const counters = new Set<string>();
  const intHints = new Set<string>();
  walk(d, (el) => {
    if (el.kind === 'for') {
      const fi = forInfo(el, d.keywords);
      if (fi.var) counters.add(fi.var);
      // bounds of a counting loop are integers
      if (fi.style === 'COUNTER') for (const b of [fi.start, fi.end]) { const id = plainIdent(b); if (id) intHints.add(id); }
    }
    if (el.kind !== 'instruction' && el.kind !== 'call') return;
    for (const line of joinLines(el.text)) {
      const s = classifyLine(line, d.keywords);
      if (s.t === 'assign') {
        const name = plainIdent(s.target);
        if (s.decl) note(name, s.decl.base === 'unknown' && !s.decl.array ? litToType(literalType(s.expr)) : s.decl, true);
        else note(name, litToType(literalType(s.expr)));
      } else if (s.t === 'decl') for (const n of s.names) note(plainIdent(n), s.type, true);
      else if (s.t === 'input') for (const t of s.targets) note(plainIdent(t), null);
    }
  });
  for (const c of counters) if (!vars.has(c)) exclude.add(c);
  for (const h of intHints) {
    const v = vars.get(h);
    if (v && v.base === 'unknown' && !v.array) vars.set(h, { base: 'int', array: false });
  }
  // variables copied from int variables (tmp <- start) are ints as well
  walk(d, (el) => {
    if (el.kind !== 'instruction') return;
    for (const line of el.text) {
      const s = classifyLine(line, d.keywords);
      if (s.t !== 'assign' || s.decl) continue;
      const src = plainIdent(s.expr);
      const dst = plainIdent(s.target);
      const vt = dst ? vars.get(dst) : undefined;
      if (src && vt && vt.base === 'unknown' && vars.get(src)?.base === 'int') vars.set(dst!, { base: 'int', array: false });
    }
  });
  return vars;
}

// ------------------------------------------------------------------ base generator

abstract class Gen {
  readonly lines: CodeLine[] = [];
  protected level = 0;
  protected ids: string[] = [];
  protected ctx: ExprCtx;
  protected k!: Keywords;
  protected d!: Diagram;
  protected sig!: Signature;
  protected resultVar: string | null = null;
  protected vars = new Map<string, VarType>();
  protected indentUnit = '    ';
  abstract readonly cmt: string;

  constructor(readonly lang: LangInfo, protected opts: GenOptions) {
    this.ctx = { lang: lang.id, imports: new Set() };
  }

  protected line(s = ''): void {
    this.lines.push({ s: s === '' ? '' : this.indentUnit.repeat(this.level) + s, ids: [...this.ids] });
  }
  protected comment(s: string): void { this.line(s.trim() === '' ? this.cmt.trimEnd() : `${this.cmt}${s}`); }
  protected ex(e: string): string { return translateExpr(e, this.ctx); }
  protected cond(lines: string[], pre: string, post: string): string { return this.ex(conditionOf(lines, pre, post, this.k)); }

  protected block(seq: Element[]): void {
    this.level++;
    if (seq.length === 0) this.emptyBlock();
    else for (const el of seq) this.element(el);
    this.level--;
  }
  protected emptyBlock(): void { /* C-like languages need nothing */ }

  protected element(el: Element): void {
    this.ids.push(el.id);
    for (const c of el.comment) if (c.trim()) this.comment(c);
    const start = this.lines.length;
    switch (el.kind) {
      case 'instruction':
      case 'call':
        for (const l of joinLines(el.text)) this.stmt(classifyLine(l, this.k));
        break;
      case 'jump': this.stmt(classifyJump(el, this.k)); break;
      case 'alternative': this.genIf(this.cond(el.text, this.k.preAlt, this.k.postAlt), el.thenBranch, el.elseBranch); break;
      case 'case': this.genCase(caseInfo(el.text, this.k), el); break;
      case 'for': this.genFor(forInfo(el, this.k), el.body); break;
      case 'while': this.genWhile(this.cond(el.text, this.k.preWhile, this.k.postWhile), el.body); break;
      case 'repeat': this.genRepeat(this.cond(el.text, this.k.preRepeat, this.k.postRepeat), el.body); break;
      case 'forever': this.genForever(el.body); break;
      case 'parallel': this.genParallel(el.branches); break;
      case 'try': this.genTry(el.text[0]?.trim() || 'ex', el.tryBody, el.catchBody, el.finallyBody); break;
    }
    if (el.disabled) {
      for (let i = start; i < this.lines.length; i++) {
        const l = this.lines[i];
        const m = /^(\s*)(.*)$/.exec(l.s)!;
        l.s = `${m[1]}${this.cmt}${m[2]}`;
      }
    }
    this.ids.pop();
  }

  protected abstract stmt(s: Stmt): void;
  protected abstract genIf(c: string, t: Element[], e: Element[]): void;
  protected abstract genCase(info: CaseInfo, el: Case): void;
  protected abstract genFor(fi: ForInfo, body: Element[]): void;
  protected abstract genWhile(c: string, body: Element[]): void;
  protected abstract genRepeat(c: string, body: Element[]): void;
  protected abstract genForever(body: Element[]): void;
  protected abstract genParallel(branches: Element[][]): void;
  protected abstract genTry(v: string, t: Element[], c: Element[], f: Element[]): void;
  /** Emit a whole routine (main program or subroutine). */
  protected abstract routine(d: Diagram, isMain: boolean): void;
  protected abstract fileHeader(main: Diagram): void;
  protected fileFooter(_main: Diagram): void { /* optional */ }

  protected setDiagram(d: Diagram): void {
    this.d = d;
    this.k = d.keywords;
    this.sig = parseSignature(d);
    this.resultVar = d.diagramType === 'sub' ? resultVariable(d, this.sig.name) : null;
    const exclude = new Set(this.sig.params.map((p) => p.name));
    this.vars = collectVariables(d, exclude);
  }

  protected headerComments(main: Diagram): void {
    const sig = parseSignature(main);
    this.comment(sig.name);
    for (const c of main.comment) this.comment(c);
    this.comment(`Generated by Structorizer ${this.opts.version ?? VERSION} (Web)`);
    if (main.meta.author) this.comment(`Author: ${main.meta.author}`);
    if (main.meta.licenseName) this.comment(`License: ${main.meta.licenseName}`);
  }

  protected includedDiagrams(d: Diagram): Diagram[] {
    const pool = this.opts.pool ?? [];
    return d.includeList.map((n) => pool.find((p) => p.diagramType === 'includable' && parseSignature(p).name === n)).filter((x): x is Diagram => !!x);
  }

  /** Subroutines called (directly or indirectly) from `main` that exist in the pool. */
  protected calledSubs(main: Diagram): Diagram[] {
    if (this.opts.involveSubroutines === false) return [];
    const pool = (this.opts.pool ?? []).filter((p) => p !== main && p.diagramType === 'sub');
    const found: Diagram[] = [];
    const visit = (d: Diagram) => {
      walk(d, (el) => {
        if (el.kind !== 'call' && el.kind !== 'instruction') return;
        for (const l of joinLines(el.text)) {
          const c = calledRoutine(l, d.keywords);
          if (!c) continue;
          const sub = pool.find((p) => {
            const s = parseSignature(p);
            const min = s.params.filter((x) => x.def === undefined).length;
            return s.name === c.name && c.argc >= min && c.argc <= s.params.length;
          });
          if (sub && !found.includes(sub)) { found.push(sub); visit(sub); }
        }
      });
    };
    visit(main);
    return found;
  }

  generate(main: Diagram): GenResult {
    const subs = main.diagramType === 'sub' ? [] : this.calledSubs(main).reverse();
    // the body first (imports are only known afterwards), then assemble
    const bodyGen = this.fork();
    for (const s of subs) bodyGen.routine(s, false);
    bodyGen.routine(main, main.diagramType !== 'sub');
    bodyGen.ctx.imports.forEach((i) => this.ctx.imports.add(i));
    this.fileHeader(main);
    this.lines.push(...bodyGen.lines);
    this.fileFooter(main);
    const name = parseSignature(main).name;
    return {
      code: this.lines.map((l) => l.s).join('\n') + '\n',
      lines: this.lines,
      fileName: `${name}.${this.lang.ext}`,
      lang: this.lang,
    };
  }

  protected abstract fork(): Gen;

  /** INPUT/OUTPUT helpers. */
  protected typeOf(name: string): VarType {
    return this.vars.get(name) ?? { base: 'unknown', array: false };
  }

  /** inc(x) / dec(x, n) as statement */
  protected incDec(expr: string): { target: string; delta: string } | null {
    const m = /^\s*(inc|dec)\s*\(\s*([^,()]+?)\s*(?:,\s*(.+?))?\s*\)\s*$/i.exec(expr);
    if (!m) return null;
    const delta = m[3] ? this.ex(m[3]) : '1';
    return { target: m[2], delta: m[1].toLowerCase() === 'inc' ? delta : `-(${delta})` };
  }
}

// ------------------------------------------------------------------ Python

class PythonGen extends Gen {
  readonly cmt = '# ';
  protected fork() { return new PythonGen(this.lang, this.opts); }
  protected emptyBlock() { this.line('pass'); }

  protected fileHeader(main: Diagram) {
    this.line('#!/usr/bin/env python3');
    this.line('# -*- coding: utf-8 -*-');
    this.headerComments(main);
    this.line();
    for (const i of [...this.ctx.imports].sort()) this.line(`import ${i}`);
    if (this.ctx.imports.size) this.line();
  }

  protected routine(d: Diagram, isMain: boolean) {
    this.setDiagram(d);
    const body = d.children;
    for (const inc of this.includedDiagrams(d)) {
      this.comment(`=== included from ${parseSignature(inc).name} ===`);
      for (const el of inc.children) this.element(el);
    }
    if (isMain || d.diagramType !== 'sub') {
      if (d.diagramType !== 'program') this.comment(`${d.diagramType} diagram ${this.sig.name}`);
      for (const el of body) this.element(el);
      return;
    }
    const params = this.sig.params.map((p) => (p.def !== undefined ? `${p.name}=${this.ex(p.def)}` : p.name)).join(', ');
    this.line(`def ${this.sig.name}(${params}):`);
    this.level++;
    if (body.length === 0) this.line('pass');
    for (const el of body) this.element(el);
    if (this.resultVar) this.line(`return ${this.resultVar}`);
    this.level--;
    this.line();
    this.line();
  }

  protected stmt(s: Stmt) {
    switch (s.t) {
      case 'empty': return;
      case 'input':
        if (s.targets.length === 0) { this.line(`input(${s.prompt ?? ''})`); return; }
        s.targets.forEach((t, i) => {
          const prompt = i === 0 && s.prompt ? s.prompt : JSON.stringify(t);
          const ty = this.typeOf(t).base;
          const call = `input(${prompt})`;
          this.line(`${this.ex(t)} = ${ty === 'int' ? `int(${call})` : ty === 'double' ? `float(${call})` : call}`);
        });
        return;
      case 'output': this.line(`print(${s.exprs.map((e) => this.ex(e)).join(', ')}${s.exprs.length > 1 ? ", sep=''" : ''})`); return;
      case 'assign': this.line(`${this.ex(s.target)} = ${this.ex(s.expr)}`); return;
      case 'decl': {
        const def = (t: TypeInfo) => (t.array ? '[]' : ({ int: '0', double: '0.0', string: '""', char: '""', bool: 'False', unknown: 'None' } as const)[t.base]);
        for (const n of s.names) this.line(`${n} = ${def(s.type)}`);
        return;
      }
      case 'typedef': this.comment(s.raw); return;
      case 'return': this.line(s.expr ? `return ${this.ex(s.expr)}` : 'return'); return;
      case 'leave':
        if (s.levels > 1) this.comment(`leave ${s.levels} loop levels (not directly supported)`);
        this.line('break');
        return;
      case 'exit': this.ctx.imports.add('sys'); this.line(`sys.exit(${s.expr ? this.ex(s.expr) : '0'})`); return;
      case 'throw': this.line(`raise Exception(${s.expr ? this.ex(s.expr) : ''})`); return;
      case 'call': {
        const id = this.incDec(s.expr);
        if (id) this.line(`${this.ex(id.target)} += ${id.delta}`);
        else this.line(this.ex(s.expr));
      }
    }
  }

  protected genIf(c: string, t: Element[], e: Element[], kw = 'if') {
    this.line(`${kw} ${c}:`);
    this.block(t);
    if (e.length === 1 && e[0].kind === 'alternative' && !e[0].disabled && e[0].comment.length === 0) {
      const inner = e[0];
      this.ids.push(inner.id);
      this.genIf(this.cond(inner.text, this.k.preAlt, this.k.postAlt), inner.thenBranch, inner.elseBranch, 'elif');
      this.ids.pop();
    } else if (e.length > 0) {
      this.line('else:');
      this.block(e);
    }
  }

  protected genCase(info: CaseInfo, el: Case) {
    const d = this.ex(info.discriminator);
    info.branches.forEach((b, i) => {
      if (b.values === null) this.line('else:');
      else {
        const vals = b.values.map((v) => this.ex(v));
        const test = vals.length === 1 ? `${d} == ${vals[0]}` : `${d} in (${vals.join(', ')})`;
        this.line(`${i === 0 ? 'if' : 'elif'} ${test}:`);
      }
      this.block(el.branches[b.index]);
    });
  }

  protected genFor(fi: ForInfo, body: Element[]) {
    if (fi.style === 'COUNTER') {
      const s = this.ex(fi.start || '0');
      const e = this.ex(fi.end);
      const range = fi.step === 1 ? `range(${s}, ${e} + 1)` : fi.step > 0 ? `range(${s}, ${e} + 1, ${fi.step})` : `range(${s}, ${e} - 1, ${fi.step})`;
      this.line(`for ${fi.var} in ${range}:`);
    } else if (fi.style === 'TRAVERSAL') this.line(`for ${fi.var} in ${this.ex(fi.list)}:`);
    else { this.comment(`TODO: ${fi.raw}`); this.line('while True:'); }
    this.block(body);
  }

  protected genWhile(c: string, body: Element[]) { this.line(`while ${c}:`); this.block(body); }
  protected genRepeat(c: string, body: Element[]) {
    this.line('while True:');
    this.level++;
    for (const el of body) this.element(el);
    this.line(`if ${c}:`);
    this.level++; this.line('break'); this.level -= 2;
  }
  protected genForever(body: Element[]) { this.line('while True:'); this.block(body); }
  protected genParallel(branches: Element[][]) {
    this.comment('==== parallel section (executed one after another here) ====');
    branches.forEach((b, i) => { this.comment(`---- thread ${i + 1} ----`); for (const el of b) this.element(el); });
    this.comment('==== end of parallel section ====');
  }
  protected genTry(v: string, t: Element[], c: Element[], f: Element[]) {
    this.line('try:'); this.block(t);
    this.line(`except Exception as ${v}:`); this.block(c);
    if (f.length) { this.line('finally:'); this.block(f); }
  }
}

// ------------------------------------------------------------------ C-like base (Java, JavaScript, C++, PHP)

abstract class CLikeGen extends Gen {
  readonly cmt = '// ';
  protected open(head: string) { this.line(`${head} {`); this.level++; }
  protected close(tail = '}') { this.level--; this.line(tail); }
  protected body(seq: Element[]) { for (const el of seq) this.element(el); }
  protected v(name: string): string { return name; }

  protected genIf(c: string, t: Element[], e: Element[], kw = 'if') {
    this.open(`${kw} (${c})`);
    this.body(t);
    if (e.length === 1 && e[0].kind === 'alternative' && !e[0].disabled && e[0].comment.length === 0) {
      const inner = e[0];
      this.level--;
      this.ids.push(inner.id);
      this.line(`} else if (${this.cond(inner.text, this.k.preAlt, this.k.postAlt)}) {`);
      this.level++;
      this.body(inner.thenBranch);
      if (inner.elseBranch.length) {
        this.level--; this.line('} else {'); this.level++;
        this.body(inner.elseBranch);
      }
      this.ids.pop();
    } else if (e.length > 0) {
      this.level--; this.line('} else {'); this.level++;
      this.body(e);
    }
    this.close();
  }

  protected genCase(info: CaseInfo, el: Case) {
    this.open(`switch (${this.ex(info.discriminator)})`);
    for (const b of info.branches) {
      if (b.values === null) this.line('default:');
      else for (const v of b.values) this.line(`case ${this.ex(v)}:`);
      this.level++;
      this.body(el.branches[b.index]);
      this.line('break;');
      this.level--;
    }
    this.close();
  }

  protected counterLoop(fi: ForInfo, decl: string) {
    const i = this.v(fi.var);
    const s = this.ex(fi.start || '0');
    const e = this.ex(fi.end);
    const inc = fi.step === 1 ? `${i}++` : fi.step === -1 ? `${i}--` : fi.step > 0 ? `${i} += ${fi.step}` : `${i} -= ${-fi.step}`;
    this.open(`for (${decl}${i} = ${s}; ${i} ${fi.step >= 0 ? '<=' : '>='} ${e}; ${inc})`);
  }

  protected genWhile(c: string, body: Element[]) { this.open(`while (${c})`); this.body(body); this.close(); }
  protected genRepeat(c: string, body: Element[]) { this.open('do'); this.body(body); this.close(`} while (!(${c}));`); }
  protected genForever(body: Element[]) { this.open('while (true)'); this.body(body); this.close(); }
  protected genParallel(branches: Element[][]) {
    this.comment('==== parallel section (executed one after another here) ====');
    branches.forEach((b, i) => { this.comment(`---- thread ${i + 1} ----`); this.open(''); this.body(b); this.close(); });
    this.comment('==== end of parallel section ====');
  }

  protected outputJoin(exprs: string[], sep: string): string {
    const parts = exprs.map((e) => this.ex(e));
    if (parts.length > 1 && !parts[0].startsWith('"') && !parts[0].startsWith("'")) parts.unshift('""');
    return parts.join(sep);
  }

  protected commonStmt(s: Stmt, end = ';'): boolean {
    switch (s.t) {
      case 'empty': return true;
      case 'typedef': this.comment(s.raw); return true;
      case 'return': this.line(s.expr ? `return ${this.ex(s.expr)}${end}` : `return${end}`); return true;
      case 'leave':
        if (s.levels > 1) this.comment(`leave ${s.levels} loop levels (not directly supported)`);
        this.line(`break${end}`);
        return true;
      case 'call': {
        const id = this.incDec(s.expr);
        if (id) this.line(`${this.ex(id.target)} += ${id.delta}${end}`);
        else this.line(`${this.ex(s.expr)}${end}`);
        return true;
      }
      default: return false;
    }
  }
}

// ------------------------------------------------------------------ Java

const JAVA_TYPES: Record<BaseType, string> = { int: 'int', double: 'double', string: 'String', char: 'char', bool: 'boolean', unknown: 'double' };
const JAVA_INIT: Record<BaseType, string> = { int: '0', double: '0.0', string: '""', char: "' '", bool: 'false', unknown: '0' };

class JavaGen extends CLikeGen {
  private usesScanner = false;
  protected fork() { return new JavaGen(this.lang, this.opts); }
  private jt(t: VarType): string { return JAVA_TYPES[t.base] + (t.array ? '[]' : ''); }

  protected fileHeader(main: Diagram) {
    this.headerComments(main);
    this.line();
  }

  /** Java needs a class frame around all routines and a Scanner field if INPUT is used. */
  generate(main: Diagram): GenResult {
    const className = parseSignature(main).name.replace(/^\w/, (c) => c.toUpperCase());
    const subs = main.diagramType === 'sub' ? [] : this.calledSubs(main).reverse();
    const body = this.fork() as JavaGen;
    body.level = 1;
    for (const s of subs) body.routine(s, false);
    body.routine(main, main.diagramType !== 'sub');
    this.fileHeader(main);
    this.line(`public class ${className} {`);
    if (body.usesScanner) {
      this.level = 1;
      this.line('private static final java.util.Scanner scanner = new java.util.Scanner(System.in);');
      this.line();
      this.level = 0;
    }
    this.lines.push(...body.lines);
    this.line('}');
    return { code: this.lines.map((l) => l.s).join('\n') + '\n', lines: this.lines, fileName: `${className}.java`, lang: this.lang };
  }

  protected routine(d: Diagram, isMain: boolean) {
    this.setDiagram(d);
    const sig = this.sig;
    if (isMain) this.open('public static void main(String[] args)');
    else {
      const ret = sig.isFunction ? this.jt(sig.result ?? this.vars.get(this.resultVar ?? '') ?? { base: 'unknown', array: false }) : 'void';
      const params = sig.params.map((p) => `${this.jt(p.type)} ${p.name}`).join(', ');
      this.open(`public static ${ret} ${sig.name}(${params})`);
    }
    this.declareVars();
    for (const inc of this.includedDiagrams(d)) {
      this.comment(`=== included from ${parseSignature(inc).name} ===`);
      this.body(inc.children);
    }
    this.body(d.children);
    if (!isMain && this.resultVar) this.line(`return ${this.resultVar};`);
    this.close();
    this.line();
  }

  private declareVars() {
    let guessed = false;
    for (const [name, t] of this.vars) {
      if (t.base === 'unknown' && !t.array) guessed = true;
      this.line(`${this.jt(t)} ${name}${t.array ? ' = null' : ` = ${JAVA_INIT[t.base]}`};`);
    }
    if (guessed) this.comment('TODO: check the types of variables without declaration (guessed as double)');
  }

  protected stmt(s: Stmt) {
    if (this.commonStmt(s)) return;
    switch (s.t) {
      case 'input':
        this.usesScanner = true;
        if (s.prompt) this.line(`System.out.print(${this.ex(s.prompt)});`);
        for (const t of s.targets) {
          const ty = this.typeOf(t).base;
          const read = ty === 'int' ? 'Integer.parseInt(scanner.nextLine().trim())'
            : ty === 'double' || ty === 'unknown' ? 'Double.parseDouble(scanner.nextLine().trim())'
              : ty === 'bool' ? 'Boolean.parseBoolean(scanner.nextLine().trim())'
                : ty === 'char' ? 'scanner.nextLine().charAt(0)' : 'scanner.nextLine()';
          this.line(`${this.ex(t)} = ${read};`);
        }
        return;
      case 'output': this.line(`System.out.println(${this.outputJoin(s.exprs, ' + ')});`); return;
      case 'assign': {
        const t = plainIdent(s.target) ? this.vars.get(s.target.trim()) : undefined;
        const prev = this.ctx.arrayType;
        if (t?.array && t.base !== 'unknown') this.ctx.arrayType = JAVA_TYPES[t.base];
        this.line(`${this.ex(s.target)} = ${this.ex(s.expr)};`);
        this.ctx.arrayType = prev;
        return;
      }
      case 'decl': return; // declared at the top of the method
      case 'exit': this.line(`System.exit(${s.expr ? this.ex(s.expr) : '0'});`); return;
      case 'throw': this.line(`throw new RuntimeException(String.valueOf(${s.expr ? this.ex(s.expr) : '""'}));`); return;
    }
  }

  protected genFor(fi: ForInfo, body: Element[]) {
    if (fi.style === 'COUNTER') this.counterLoop(fi, this.vars.has(fi.var) ? '' : 'int ');
    else if (fi.style === 'TRAVERSAL') this.open(`for (var ${fi.var} : ${this.ex(fi.list)})`);
    else { this.comment(`TODO: ${fi.raw}`); this.open('while (true)'); }
    this.body(body);
    this.close();
  }

  protected genTry(v: string, t: Element[], c: Element[], f: Element[]) {
    this.open('try'); this.body(t);
    this.level--; this.line(`} catch (Exception ${v}) {`); this.level++;
    this.body(c);
    if (f.length) { this.level--; this.line('} finally {'); this.level++; this.body(f); }
    this.close();
  }
}

// ------------------------------------------------------------------ JavaScript

class JsGen extends CLikeGen {
  protected fork() { return new JsGen(this.lang, this.opts); }
  protected fileHeader(main: Diagram) { this.headerComments(main); this.line(); }

  protected routine(d: Diagram, isMain: boolean) {
    this.setDiagram(d);
    if (!isMain) {
      const params = this.sig.params.map((p) => (p.def !== undefined ? `${p.name} = ${this.ex(p.def)}` : p.name)).join(', ');
      this.open(`function ${this.sig.name}(${params})`);
    }
    if (this.vars.size) this.line(`let ${[...this.vars.keys()].join(', ')};`);
    for (const inc of this.includedDiagrams(d)) {
      this.comment(`=== included from ${parseSignature(inc).name} ===`);
      this.body(inc.children);
    }
    this.body(d.children);
    if (!isMain) {
      if (this.resultVar) this.line(`return ${this.resultVar};`);
      this.close();
      this.line();
    }
  }

  protected stmt(s: Stmt) {
    if (this.commonStmt(s)) return;
    switch (s.t) {
      case 'input':
        for (const [i, t] of s.targets.entries()) {
          const p = i === 0 && s.prompt ? this.ex(s.prompt) : JSON.stringify(t);
          const ty = this.typeOf(t).base;
          const call = `prompt(${p})`;
          this.line(`${this.ex(t)} = ${ty === 'int' || ty === 'double' ? `Number(${call})` : call};`);
        }
        return;
      case 'output': this.line(`console.log(${this.outputJoin(s.exprs, ' + ')});`); return;
      case 'assign': this.line(`${this.ex(s.target)} = ${this.ex(s.expr)};`); return;
      case 'decl': return;
      case 'exit': this.line(`process.exit(${s.expr ? this.ex(s.expr) : '0'});`); return;
      case 'throw': this.line(`throw new Error(${s.expr ? this.ex(s.expr) : ''});`); return;
    }
  }

  protected genFor(fi: ForInfo, body: Element[]) {
    if (fi.style === 'COUNTER') this.counterLoop(fi, this.vars.has(fi.var) ? '' : 'let ');
    else if (fi.style === 'TRAVERSAL') this.open(`for (const ${fi.var} of ${this.ex(fi.list)})`);
    else { this.comment(`TODO: ${fi.raw}`); this.open('while (true)'); }
    this.body(body);
    this.close();
  }

  protected genTry(v: string, t: Element[], c: Element[], f: Element[]) {
    this.open('try'); this.body(t);
    this.level--; this.line(`} catch (${v}) {`); this.level++;
    this.body(c);
    if (f.length) { this.level--; this.line('} finally {'); this.level++; this.body(f); }
    this.close();
  }
}

// ------------------------------------------------------------------ C++

const CPP_TYPES: Record<BaseType, string> = { int: 'int', double: 'double', string: 'std::string', char: 'char', bool: 'bool', unknown: 'double' };
const CPP_INIT: Record<BaseType, string> = { int: ' = 0', double: ' = 0.0', string: '', char: " = ' '", bool: ' = false', unknown: ' = 0' };

class CppGen extends CLikeGen {
  protected fork() { return new CppGen(this.lang, this.opts); }
  private ct(t: VarType) { return t.array ? `std::vector<${CPP_TYPES[t.base]}>` : CPP_TYPES[t.base]; }

  protected fileHeader(main: Diagram) {
    this.headerComments(main);
    this.line();
    const inc = new Set(['iostream', 'string', ...this.ctx.imports]);
    for (const i of [...inc].sort()) this.line(`#include <${i}>`);
    this.line();
  }

  protected routine(d: Diagram, isMain: boolean) {
    this.setDiagram(d);
    if (this.vars.size && [...this.vars.values()].some((v) => v.array)) this.ctx.imports.add('vector');
    if (isMain) this.open('int main()');
    else {
      const ret = this.sig.isFunction ? this.ct(this.sig.result ?? this.vars.get(this.resultVar ?? '') ?? { base: 'unknown', array: false }) : 'void';
      const params = this.sig.params.map((p) => `${this.ct(p.type)} ${p.name}`).join(', ');
      this.open(`${ret} ${this.sig.name}(${params})`);
    }
    for (const [name, t] of this.vars) this.line(`${this.ct(t)} ${name}${t.array ? '' : CPP_INIT[t.base]};`);
    for (const inc of this.includedDiagrams(d)) {
      this.comment(`=== included from ${parseSignature(inc).name} ===`);
      this.body(inc.children);
    }
    this.body(d.children);
    if (!isMain && this.resultVar) this.line(`return ${this.resultVar};`);
    if (isMain) this.line('return 0;');
    this.close();
    this.line();
  }

  protected stmt(s: Stmt) {
    if (this.commonStmt(s)) return;
    switch (s.t) {
      case 'input':
        if (s.prompt) this.line(`std::cout << ${this.ex(s.prompt)};`);
        for (const t of s.targets) {
          if (this.typeOf(t).base === 'string') this.line(`std::getline(std::cin, ${this.ex(t)});`);
          else this.line(`std::cin >> ${this.ex(t)};`);
        }
        return;
      case 'output': this.line(`std::cout${s.exprs.map((e) => ` << ${this.ex(e)}`).join('')} << std::endl;`); return;
      case 'assign': this.line(`${this.ex(s.target)} = ${this.ex(s.expr)};`); return;
      case 'decl': return;
      case 'exit': this.ctx.imports.add('cstdlib'); this.line(`exit(${s.expr ? this.ex(s.expr) : '0'});`); return;
      case 'throw': this.ctx.imports.add('stdexcept'); this.line(`throw std::runtime_error(${s.expr ? this.ex(s.expr) : '""'});`); return;
    }
  }

  protected genFor(fi: ForInfo, body: Element[]) {
    if (fi.style === 'COUNTER') this.counterLoop(fi, this.vars.has(fi.var) ? '' : 'int ');
    else if (fi.style === 'TRAVERSAL') this.open(`for (auto ${fi.var} : ${this.ex(fi.list)})`);
    else { this.comment(`TODO: ${fi.raw}`); this.open('while (true)'); }
    this.body(body);
    this.close();
  }

  protected genTry(v: string, t: Element[], c: Element[], f: Element[]) {
    this.ctx.imports.add('stdexcept');
    this.open('try'); this.body(t);
    this.level--; this.line(`} catch (const std::exception& ${v}) {`); this.level++;
    this.body(c);
    this.close();
    if (f.length) { this.comment('finally (C++ has no finally block):'); this.body(f); }
  }

}

// ------------------------------------------------------------------ PHP

class PhpGen extends CLikeGen {
  protected fork() { return new PhpGen(this.lang, this.opts); }
  protected v(name: string) { return '$' + name; }
  protected fileHeader(main: Diagram) { this.line('<?php'); this.headerComments(main); this.line(); }

  protected routine(d: Diagram, isMain: boolean) {
    this.setDiagram(d);
    if (!isMain) {
      const params = this.sig.params.map((p) => `$${p.name}${p.def !== undefined ? ` = ${this.ex(p.def)}` : ''}`).join(', ');
      this.open(`function ${this.sig.name}(${params})`);
    }
    for (const inc of this.includedDiagrams(d)) {
      this.comment(`=== included from ${parseSignature(inc).name} ===`);
      this.body(inc.children);
    }
    this.body(d.children);
    if (!isMain) {
      if (this.resultVar) this.line(`return $${this.resultVar};`);
      this.close();
      this.line();
    }
  }

  protected stmt(s: Stmt) {
    if (this.commonStmt(s)) return;
    switch (s.t) {
      case 'input':
        for (const [i, t] of s.targets.entries()) {
          const p = i === 0 && s.prompt ? this.ex(s.prompt) : JSON.stringify(t);
          const ty = this.typeOf(t).base;
          const call = `readline(${p})`;
          this.line(`${this.ex(t)} = ${ty === 'int' ? `intval(${call})` : ty === 'double' ? `floatval(${call})` : call};`);
        }
        return;
      case 'output': this.line(`echo ${s.exprs.length ? s.exprs.map((e) => this.ex(e)).join(' . ') + ' . ' : ''}PHP_EOL;`); return;
      case 'assign': this.line(`${this.ex(s.target)} = ${this.ex(s.expr)};`); return;
      case 'decl': return;
      case 'exit': this.line(`exit(${s.expr ? this.ex(s.expr) : '0'});`); return;
      case 'throw': this.line(`throw new Exception(${s.expr ? this.ex(s.expr) : '""'});`); return;
    }
  }

  protected genFor(fi: ForInfo, body: Element[]) {
    if (fi.style === 'COUNTER') this.counterLoop(fi, '');
    else if (fi.style === 'TRAVERSAL') this.open(`foreach (${this.ex(fi.list)} as $${fi.var})`);
    else { this.comment(`TODO: ${fi.raw}`); this.open('while (true)'); }
    this.body(body);
    this.close();
  }

  protected genTry(v: string, t: Element[], c: Element[], f: Element[]) {
    this.open('try'); this.body(t);
    this.level--; this.line(`} catch (Exception $${v}) {`); this.level++;
    this.body(c);
    if (f.length) { this.level--; this.line('} finally {'); this.level++; this.body(f); }
    this.close();
  }
}

// ------------------------------------------------------------------ Bash

class BashGen extends Gen {
  readonly cmt = '# ';
  protected indentUnit = '  ';
  protected fork() { return new BashGen(this.lang, this.opts); }
  protected emptyBlock() { this.line(':'); }

  protected fileHeader(main: Diagram) {
    this.line('#!/usr/bin/env bash');
    this.headerComments(main);
    this.line();
  }

  /** Expression in a string context (echo, assignment of strings). */
  private word(e: string): string {
    const t = e.trim();
    if (/^"(?:[^"\\]|\\.)*"$/.test(t) || /^'[^']*'$/.test(t)) return t.slice(1, -1).replace(/(["`$])/g, '\\$1');
    const id = plainIdent(t);
    if (id) return `\${${id}}`;
    if (/^[+-]?\d+(\.\d+)?$/.test(t)) return t;
    return `$((${this.ex(t)}))`;
  }

  private test(c: string): string {
    // string comparisons need [[ ]], arithmetic uses (( ))
    if (/["']/.test(c)) {
      const s = c.replace(/\b([\p{L}_][\p{L}\p{N}_]*)\b(?![("'])/gu, (m) => (/^(and|or|not)$/i.test(m) ? m : `"$${m}"`))
        .replace(/\band\b/gi, '&&').replace(/\bor\b/gi, '||').replace(/\bnot\b/gi, '!').replace(/<>/g, '!=').replace(/(^|[^<>!=])=([^=])/g, '$1==$2');
      return `[[ ${s} ]]`;
    }
    return `(( ${this.ex(c)} ))`;
  }

  protected routine(d: Diagram, isMain: boolean) {
    this.setDiagram(d);
    if (!isMain) {
      this.line(`${this.sig.name}() {`);
      this.level++;
      this.sig.params.forEach((p, i) => this.line(`local ${p.name}="\${${i + 1}${p.def !== undefined ? `:-${p.def.replace(/^"|"$/g, '')}` : ''}}"`));
    }
    for (const inc of this.includedDiagrams(d)) {
      this.comment(`=== included from ${parseSignature(inc).name} ===`);
      for (const el of inc.children) this.element(el);
    }
    for (const el of d.children) this.element(el);
    if (!isMain) {
      if (this.resultVar) this.line(`echo "\${${this.resultVar}}"`);
      if (d.children.length === 0) this.line(':');
      this.level--;
      this.line('}');
      this.line();
    }
  }

  protected stmt(s: Stmt) {
    switch (s.t) {
      case 'empty': return;
      case 'input': {
        const p = s.prompt ? ` -p "${this.word(s.prompt)}"` : '';
        this.line(`read${p} ${s.targets.join(' ')}`.trimEnd());
        return;
      }
      case 'output': this.line(`echo "${s.exprs.map((e) => this.word(e)).join('')}"`); return;
      case 'assign': {
        const target = s.target.trim();
        const e = s.expr.trim();
        if (/^\{.*\}$/.test(e)) { this.line(`${target}=${this.ex(e)}`); return; }
        const call = /^([\p{L}_][\p{L}\p{N}_]*)\s*\((.*)\)$/u.exec(e);
        if (call && !/^(abs|sqrt|min|max|random|length|round)$/i.test(call[1])) {
          const args = call[2].trim() ? call[2].split(',').map((a) => `"${this.word(a)}"`).join(' ') : '';
          this.line(`${target}=$(${call[1]}${args ? ' ' + args : ''})`);
          return;
        }
        if (/["']/.test(e) || plainIdent(e)) { this.line(`${target}="${this.word(e)}"`); return; }
        if (/\d\.\d/.test(e)) {
          // bash arithmetic is integer only: use bc for decimals
          const bc = this.ex(e).replace(/\b([\p{L}_][\p{L}\p{N}_]*)\b/gu, '$${$1}');
          this.line(`${target}=$(echo "scale=6; ${bc}" | bc -l)`);
          return;
        }
        this.line(`${target}=$((${this.ex(e)}))`);
        return;
      }
      case 'decl': for (const n of s.names) this.line(`${n}=`); return;
      case 'typedef': this.comment(s.raw); return;
      case 'return':
        if (s.expr) this.line(`echo "${this.word(s.expr)}"`);
        this.line('return 0');
        return;
      case 'leave': this.line(s.levels > 1 ? `break ${s.levels}` : 'break'); return;
      case 'exit': this.line(`exit ${s.expr ? this.word(s.expr) : '0'}`); return;
      case 'throw': this.line(`echo "${s.expr ? this.word(s.expr) : 'error'}" >&2`); this.line('exit 1'); return;
      case 'call': {
        const id = this.incDec(s.expr);
        if (id) { this.line(`(( ${id.target.trim()} += ${id.delta} ))`); return; }
        const call = /^([\p{L}_][\p{L}\p{N}_]*)\s*\((.*)\)$/u.exec(s.expr.trim());
        if (call) {
          const args = call[2].trim() ? call[2].split(',').map((a) => `"${this.word(a)}"`).join(' ') : '';
          this.line(`${call[1]}${args ? ' ' + args : ''}`);
        } else this.line(s.expr);
      }
    }
  }

  protected genIf(c: string, t: Element[], e: Element[]) {
    this.line(`if ${this.test(c)}; then`);
    this.block(t);
    if (e.length) { this.line('else'); this.block(e); }
    this.line('fi');
  }
  protected cond(lines: string[], pre: string, post: string) { return conditionOf(lines, pre, post, this.k); }

  protected genCase(info: CaseInfo, el: Case) {
    this.line(`case "${this.word(info.discriminator)}" in`);
    this.level++;
    for (const b of info.branches) {
      this.line(`${b.values === null ? '*' : b.values.map((v) => v.replace(/^"|"$/g, '')).join('|')})`);
      this.block(el.branches[b.index]);
      this.level++; this.line(';;'); this.level--;
    }
    this.level--;
    this.line('esac');
  }

  protected genFor(fi: ForInfo, body: Element[]) {
    if (fi.style === 'COUNTER') {
      const inc = fi.step === 1 ? `${fi.var}++` : fi.step > 0 ? `${fi.var} += ${fi.step}` : `${fi.var} -= ${-fi.step}`;
      this.line(`for (( ${fi.var} = ${this.ex(fi.start || '0')}; ${fi.var} ${fi.step >= 0 ? '<=' : '>='} ${this.ex(fi.end)}; ${inc} )); do`);
    } else if (fi.style === 'TRAVERSAL') {
      const list = fi.list.trim();
      const items = /^\{(.*)\}$/.exec(list);
      this.line(`for ${fi.var} in ${items ? items[1].split(',').map((x) => x.trim()).join(' ') : `"\${${list}[@]}"`}; do`);
    } else { this.comment(`TODO: ${fi.raw}`); this.line('while true; do'); }
    this.block(body);
    this.line('done');
  }

  protected genWhile(c: string, body: Element[]) { this.line(`while ${this.test(c)}; do`); this.block(body); this.line('done'); }
  protected genRepeat(c: string, body: Element[]) {
    this.line('while true; do');
    this.level++;
    for (const el of body) this.element(el);
    this.line(`if ${this.test(c)}; then break; fi`);
    this.level--;
    this.line('done');
  }
  protected genForever(body: Element[]) { this.line('while true; do'); this.block(body); this.line('done'); }
  protected genParallel(branches: Element[][]) {
    this.comment('==== parallel section ====');
    for (const b of branches) { this.line('{'); this.block(b); this.line('} &'); }
    this.line('wait');
  }
  protected genTry(v: string, t: Element[], c: Element[], f: Element[]) {
    this.comment('try (bash has no exceptions: the try block runs, the catch block is kept as comment)');
    for (const el of t) this.element(el);
    const start = this.lines.length;
    this.comment(`catch ${v}:`);
    for (const el of c) this.element(el);
    for (let i = start + 1; i < this.lines.length; i++) {
      const m = /^(\s*)(.*)$/.exec(this.lines[i].s)!;
      if (!m[2].startsWith('#')) this.lines[i].s = `${m[1]}# ${m[2]}`;
    }
    if (f.length) { this.comment('finally:'); for (const el of f) this.element(el); }
  }
}

// ------------------------------------------------------------------ entry point

export function generateCode(d: Diagram, lang: LangId, opts: GenOptions = {}): GenResult {
  const info = LANGUAGES.find((l) => l.id === lang) ?? LANGUAGES[0];
  switch (info.id) {
    case 'python': return new PythonGen(info, opts).generate(d);
    case 'java': return new JavaGen(info, opts).generate(d);
    case 'javascript': return new JsGen(info, opts).generate(d);
    case 'cpp': return new CppGen(info, opts).generate(d);
    case 'php': return new PhpGen(info, opts).generate(d);
    case 'bash': return new BashGen(info, opts).generate(d);
  }
}

export { parseType };
