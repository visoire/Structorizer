// SPDX-License-Identifier: GPL-3.0-or-later
// Diagram helpers for the MCP server: file access inside a root folder, element paths,
// outline text and JSON <-> model conversion. Uses the core of the web editor.
import { DOMParser as XmlDomParser } from '@xmldom/xmldom';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readNsd } from '../../web/src/core/io/readNsd';
import { writeNsd } from '../../web/src/core/io/writeNsd';
import {
  createDiagram, createElement, setCaseText, setParallelCount, slotsOf,
  type Diagram, type DiagramType, type Element, type ElementKind, type Position, type SeqRef,
} from '../../web/src/core/model';
import type { MeasureFn } from '../../web/src/core/layout';

export const VERSION = '3.32-35';

// ------------------------------------------------------------------ XML parser for Node

class StrictParser {
  parseFromString(xml: string, mime: string) {
    const errors: string[] = [];
    const p = new XmlDomParser({ onError: (level: string, msg: string) => { if (level !== 'warning') errors.push(msg); } });
    const doc = p.parseFromString(xml, mime as 'text/xml');
    if (errors.length) throw new Error('Not a valid XML file: ' + errors[0]);
    return doc;
  }
}
(globalThis as unknown as { DOMParser: unknown }).DOMParser = StrictParser;

// ------------------------------------------------------------------ files inside the root

export class Workspace {
  constructor(readonly root: string, readonly readOnly = false) {}

  resolve(p: string): string {
    const abs = path.resolve(this.root, p);
    const rel = path.relative(this.root, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Path outside the root folder: ${p}`);
    return abs;
  }

  async load(p: string): Promise<Diagram> {
    if (!p.toLowerCase().endsWith('.nsd')) throw new Error('Diagram files end with .nsd');
    const xml = await fs.readFile(this.resolve(p), 'utf8');
    return readNsd(xml).diagram;
  }

  async save(p: string, d: Diagram): Promise<void> {
    if (this.readOnly) throw new Error('The server runs read-only');
    if (!p.toLowerCase().endsWith('.nsd')) throw new Error('Diagram files end with .nsd');
    const abs = this.resolve(p);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, writeNsd(d, `${VERSION} MCP`), 'utf8');
  }

  async writeFile(p: string, data: string | Uint8Array): Promise<void> {
    if (this.readOnly) throw new Error('The server runs read-only');
    const abs = this.resolve(p);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
  }

  async list(dir = '.', depth = 4): Promise<string[]> {
    const out: string[] = [];
    const walkDir = async (abs: string, d: number) => {
      let entries: import('node:fs').Dirent[];
      try { entries = await fs.readdir(abs, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const full = path.join(abs, e.name);
        if (e.isDirectory() && d > 0) await walkDir(full, d - 1);
        else if (e.isFile() && e.name.toLowerCase().endsWith('.nsd')) out.push(path.relative(this.root, full).split(path.sep).join('/'));
      }
    };
    await walkDir(this.resolve(dir), depth);
    return out.sort();
  }
}

// ------------------------------------------------------------------ element paths

/** Path of every element: "2", "2/then/0", "3/branch/1/0", "4/body/2" ... */
export function pathMap(d: Diagram): Map<string, Element> {
  const map = new Map<string, Element>();
  const visit = (seq: Element[], prefix: string) => {
    seq.forEach((el, i) => {
      const p = prefix ? `${prefix}/${i}` : String(i);
      map.set(p, el);
      for (const s of slotsOf(el)) {
        const r = s.ref as { slot: string; index?: number };
        visit(s.seq, r.slot === 'branch' ? `${p}/branch/${r.index}` : `${p}/${r.slot}`);
      }
    });
  };
  visit(d.children, '');
  return map;
}

export function elementAt(d: Diagram, p: string): Element {
  const el = pathMap(d).get(p.trim().replace(/^\/+|\/+$/g, ''));
  if (!el) throw new Error(`No element at path "${p}". Use read-diagram to see the paths.`);
  return el;
}

export interface PositionInput { parent?: string; slot?: 'then' | 'else' | 'body' | 'try' | 'catch' | 'finally' | 'branch'; branch?: number; index?: number }

export function toPosition(d: Diagram, at: PositionInput | undefined): Position {
  if (!at || !at.parent) {
    const index = at?.index ?? d.children.length;
    return { seq: { owner: 'root' }, index };
  }
  const owner = elementAt(d, at.parent);
  const slots = slotsOf(owner);
  if (slots.length === 0) throw new Error(`Element ${at.parent} (${owner.kind}) has no branches`);
  const want = at.slot ?? (slots[0].ref as { slot: string }).slot;
  const slot = slots.find((s) => {
    const r = s.ref as { slot: string; index?: number };
    return r.slot === want && (want !== 'branch' || r.index === (at.branch ?? 0));
  });
  if (!slot) throw new Error(`Element ${at.parent} (${owner.kind}) has no slot "${want}${want === 'branch' ? ' ' + (at.branch ?? 0) : ''}"`);
  return { seq: slot.ref as SeqRef, index: at.index ?? slot.seq.length };
}

// ------------------------------------------------------------------ JSON input -> model

export interface ElementInput {
  kind: ElementKind;
  text?: string | string[];
  comment?: string | string[];
  color?: string;
  disabled?: boolean;
  then?: ElementInput[];
  else?: ElementInput[];
  body?: ElementInput[];
  branches?: ElementInput[][];
  try?: ElementInput[];
  catch?: ElementInput[];
  finally?: ElementInput[];
}

const KINDS: ElementKind[] = ['instruction', 'call', 'jump', 'alternative', 'case', 'for', 'while', 'repeat', 'forever', 'parallel', 'try'];
const lines = (v: string | string[] | undefined): string[] | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? v.map(String) : String(v).split(/\r?\n/);

export function buildElement(input: ElementInput, d: Diagram): Element {
  if (!input || !KINDS.includes(input.kind)) throw new Error(`Unknown element kind "${input?.kind}". Use one of: ${KINDS.join(', ')}`);
  const kids = (v: ElementInput[] | undefined) => (v ?? []).map((x) => buildElement(x, d));
  let el = createElement(input.kind, lines(input.text), d.keywords);
  el = {
    ...el,
    comment: lines(input.comment) ?? [],
    color: /^#?[0-9a-f]{6}$/i.test(input.color ?? '') ? input.color!.replace('#', '').toLowerCase() : 'ffffff',
    disabled: !!input.disabled,
  };
  switch (el.kind) {
    case 'alternative': return { ...el, thenBranch: kids(input.then), elseBranch: kids(input.else) };
    case 'for': case 'while': case 'repeat': case 'forever': return { ...el, body: kids(input.body) } as Element;
    case 'try': return { ...el, tryBody: kids(input.try), catchBody: kids(input.catch), finallyBody: kids(input.finally) };
    case 'case': {
      const c = setCaseText(el, el.text);
      const branches = c.branches.map((b, i) => (input.branches?.[i] ? kids(input.branches[i]) : b));
      return { ...c, branches };
    }
    case 'parallel': {
      const n = input.branches?.length ?? (parseInt(el.text[0] ?? '2', 10) || 2);
      const p = setParallelCount(el, n);
      return { ...p, branches: p.branches.map((b, i) => (input.branches?.[i] ? kids(input.branches[i]) : b)) };
    }
    default: return el;
  }
}

export function buildDiagram(type: DiagramType, name: string | string[], comment: string | string[] | undefined, elements: ElementInput[]): Diagram {
  const d0 = createDiagram(type);
  const d: Diagram = { ...d0, text: lines(name) ?? ['???'], comment: lines(comment) ?? [], meta: { ...d0.meta, origin: `Structorizer MCP ${VERSION}` } };
  return { ...d, children: elements.map((e) => buildElement(e, d)) };
}

// ------------------------------------------------------------------ model -> outline / JSON

const LABEL: Record<ElementKind, string> = {
  instruction: 'INSTRUCTION', call: 'CALL', jump: 'EXIT', alternative: 'IF', case: 'CASE', for: 'FOR',
  while: 'WHILE', repeat: 'REPEAT', forever: 'ENDLESS', parallel: 'PARALLEL', try: 'TRY',
};

export function outline(d: Diagram): string {
  const out: string[] = [`[${d.diagramType}] ${d.text.join(' | ')}`];
  if (d.comment.length) out.push(`  comment: ${d.comment.join(' | ')}`);
  if (d.includeList.length) out.push(`  includes: ${d.includeList.join(', ')}`);
  const visit = (seq: Element[], prefix: string, depth: number) => {
    if (seq.length === 0) { out.push(`${'  '.repeat(depth)}(empty)`); return; }
    seq.forEach((el, i) => {
      const p = prefix ? `${prefix}/${i}` : String(i);
      const flags = [el.disabled ? 'disabled' : '', el.color !== 'ffffff' ? `#${el.color}` : ''].filter(Boolean).join(' ');
      out.push(`${'  '.repeat(depth)}${p}  ${LABEL[el.kind]}  ${el.text.join(' | ')}${flags ? `  [${flags}]` : ''}${el.comment.length ? `  // ${el.comment.join(' ')}` : ''}`);
      for (const s of slotsOf(el)) {
        const r = s.ref as { slot: string; index?: number };
        const sp = r.slot === 'branch' ? `${p}/branch/${r.index}` : `${p}/${r.slot}`;
        const label = el.kind === 'case' && r.slot === 'branch' ? `case ${el.text[(r.index ?? 0) + 1] ?? ''}` : r.slot === 'branch' ? `thread ${(r.index ?? 0) + 1}` : r.slot;
        if (slotsOf(el).length > 1 || r.slot !== 'body') out.push(`${'  '.repeat(depth + 1)}${sp}: ${label}`);
        visit(s.seq, sp, depth + 2);
      }
    });
  };
  visit(d.children, '', 1);
  return out.join('\n');
}

export function toJson(d: Diagram): unknown {
  const conv = (seq: Element[], prefix: string): unknown[] => seq.map((el, i) => {
    const p = prefix ? `${prefix}/${i}` : String(i);
    const o: Record<string, unknown> = { path: p, kind: el.kind, text: el.text };
    if (el.comment.length) o.comment = el.comment;
    if (el.color !== 'ffffff') o.color = el.color;
    if (el.disabled) o.disabled = true;
    switch (el.kind) {
      case 'alternative': o.then = conv(el.thenBranch, `${p}/then`); o.else = conv(el.elseBranch, `${p}/else`); break;
      case 'for': case 'while': case 'repeat': case 'forever': o.body = conv(el.body, `${p}/body`); break;
      case 'case': case 'parallel': o.branches = el.branches.map((b, k) => conv(b, `${p}/branch/${k}`)); break;
      case 'try': o.try = conv(el.tryBody, `${p}/try`); o.catch = conv(el.catchBody, `${p}/catch`); o.finally = conv(el.finallyBody, `${p}/finally`); break;
    }
    return o;
  });
  return { type: d.diagramType, name: d.text, comment: d.comment, framed: d.boxed, includes: d.includeList, keywords: d.keywords, elements: conv(d.children, '') };
}

// ------------------------------------------------------------------ text width without a browser

/** Approximate widths of a 14 px sans-serif font (good enough for SVG/EMF export). */
export const approxMeasure: MeasureFn = (s, bold) => {
  let w = 0;
  for (const ch of s) {
    if (/[iljI.,;:'|!]/.test(ch)) w += 3.9;
    else if (ch === ' ') w += 3.9;
    else if (/[mwMW]/.test(ch)) w += 11.7;
    else if (/[A-Z]/.test(ch)) w += 9.4;
    else if (/[0-9]/.test(ch)) w += 7.8;
    else if (/[frt]/.test(ch)) w += 4.9;
    else w += 7.6;
  }
  return Math.ceil(w * (bold ? 1.07 : 1));
};
