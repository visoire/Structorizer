// SPDX-License-Identifier: GPL-3.0-or-later
// Immutable tree operations. Every function returns a new Diagram; unchanged
// sub-trees keep their identity (cheap for undo snapshots and memoised layout).
import { newId } from './ids';
import { findById, isInside, sameRef, slotsOf } from './tree';
import type { Case, Diagram, Element, Parallel, Position, SeqRef } from './types';

type SeqFn = (seq: Element[]) => Element[];

/** Replace the sequence identified by `slotRef` inside `el` (only own slots). */
function withSlot(el: Element, ref: SeqRef, seq: Element[]): Element {
  const slotRef = ref as { owner: string; slot?: string; index?: number };
  switch (slotRef.slot) {
    case undefined: return el;
    case 'then': return el.kind === 'alternative' ? { ...el, thenBranch: seq } : el;
    case 'else': return el.kind === 'alternative' ? { ...el, elseBranch: seq } : el;
    case 'body':
      return el.kind === 'for' || el.kind === 'while' || el.kind === 'repeat' || el.kind === 'forever'
        ? { ...el, body: seq } : el;
    case 'try': return el.kind === 'try' ? { ...el, tryBody: seq } : el;
    case 'catch': return el.kind === 'try' ? { ...el, catchBody: seq } : el;
    case 'finally': return el.kind === 'try' ? { ...el, finallyBody: seq } : el;
    case 'branch': {
      if (el.kind !== 'case' && el.kind !== 'parallel') return el;
      const branches = el.branches.slice();
      branches[slotRef.index ?? 0] = seq;
      return { ...el, branches } as Element;
    }
    default: return el;
  }
}

function mapSeqDeep(seq: Element[], ref: SeqRef, fn: SeqFn): Element[] {
  let changed = false;
  const out = seq.map((el) => {
    let next = el;
    for (const s of slotsOf(el)) {
      const newSeq = el.id === ref.owner && sameRef(s.ref, ref) ? fn(s.seq) : mapSeqDeep(s.seq, ref, fn);
      if (newSeq !== s.seq) next = withSlot(next, s.ref, newSeq);
    }
    if (next !== el) changed = true;
    return next;
  });
  return changed ? out : seq;
}

export function mapSeq(d: Diagram, ref: SeqRef, fn: SeqFn): Diagram {
  if (ref.owner === 'root') return { ...d, children: fn(d.children) };
  const children = mapSeqDeep(d.children, ref, fn);
  return children === d.children ? d : { ...d, children };
}

export function insertAt(d: Diagram, pos: Position, ...els: Element[]): Diagram {
  return mapSeq(d, pos.seq, (seq) => {
    const i = Math.max(0, Math.min(pos.index, seq.length));
    return [...seq.slice(0, i), ...els, ...seq.slice(i)];
  });
}

export function removeById(d: Diagram, id: string): Diagram {
  const found = findById(d, id);
  if (!found) return d;
  return mapSeq(d, found.parentSeq, (seq) => seq.filter((e) => e.id !== id));
}

/** Move element `id` so it is inserted before `pos.index` of `pos.seq`. Refuses moves into itself. */
export function moveTo(d: Diagram, id: string, pos: Position): Diagram {
  const found = findById(d, id);
  if (!found) return d;
  if (pos.seq.owner !== 'root' && isInside(d, id, pos.seq.owner)) return d;
  let index = pos.index;
  if (sameRef(found.parentSeq, pos.seq) && found.index < index) index -= 1;
  const without = removeById(d, id);
  return insertAt(without, { seq: pos.seq, index }, found.el);
}

/** Replace an element by the result of `fn`. */
export function replaceElement(d: Diagram, id: string, fn: (el: Element) => Element): Diagram {
  const found = findById(d, id);
  if (!found) return d;
  return mapSeq(d, found.parentSeq, (seq) => seq.map((e) => (e.id === id ? fn(e) : e)));
}

export type ElementPatch = Partial<Pick<Element, 'text' | 'comment' | 'color' | 'disabled' | 'collapsed'>>;

/** Apply a patch; keeps the structure rules of D-05 for case and parallel. */
export function updateElement(d: Diagram, id: string, patch: ElementPatch): Diagram {
  return replaceElement(d, id, (el) => {
    let next = { ...el, ...patch } as Element;
    if (patch.text) {
      if (next.kind === 'case') next = setCaseText(next, patch.text);
      else if (next.kind === 'parallel') next = setParallelCount(next, parseInt(patch.text[0] ?? '', 10));
      else if (next.kind === 'forever') next = { ...next, text: [] };
    }
    return next;
  });
}

/** Case text defines the branch count: branches = lines - 1, minimum 2 (D-05). */
export function setCaseText(el: Case, text: string[]): Case {
  const lines = text.slice();
  while (lines.length < 3) lines.push('?');
  if (lines[0].trim() === '') lines[0] = '???';
  const n = lines.length - 1;
  const branches = el.branches.slice(0, n);
  while (branches.length < n) branches.push([]);
  const colors = el.branchHeadColors?.slice(0, n);
  return { ...el, text: lines, branches, branchHeadColors: colors };
}

export function setParallelCount(el: Parallel, count: number): Parallel {
  const n = Number.isFinite(count) && count >= 1 ? Math.min(Math.floor(count), 20) : el.branches.length;
  const branches = el.branches.slice(0, n);
  while (branches.length < n) branches.push([]);
  return { ...el, text: [String(n)], branches };
}

/** Deep copy with fresh ids (copy/paste, duplicate). */
export function cloneWithNewIds(el: Element): Element {
  const copySeq = (seq: Element[]) => seq.map(cloneWithNewIds);
  const base = { ...el, id: newId(), text: el.text.slice(), comment: el.comment.slice() };
  switch (base.kind) {
    case 'alternative': return { ...base, thenBranch: copySeq(base.thenBranch), elseBranch: copySeq(base.elseBranch) };
    case 'case': case 'parallel': return { ...base, branches: base.branches.map(copySeq) } as Element;
    case 'for': case 'while': case 'repeat': case 'forever': return { ...base, body: copySeq(base.body) } as Element;
    case 'try': return { ...base, tryBody: copySeq(base.tryBody), catchBody: copySeq(base.catchBody), finallyBody: copySeq(base.finallyBody) };
    default: return base;
  }
}

/** Swap with previous (-1) or next (+1) sibling. */
export function shiftElement(d: Diagram, id: string, delta: -1 | 1): Diagram {
  const found = findById(d, id);
  if (!found) return d;
  return mapSeq(d, found.parentSeq, (seq) => {
    const j = found.index + delta;
    if (j < 0 || j >= seq.length) return seq;
    const out = seq.slice();
    [out[found.index], out[j]] = [out[j], out[found.index]];
    return out;
  });
}
