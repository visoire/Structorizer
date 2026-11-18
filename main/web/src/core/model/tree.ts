// SPDX-License-Identifier: GPL-3.0-or-later
import type { Diagram, Element, SeqRef } from './types';

export interface Slot { ref: SeqRef; seq: Element[] }

/** All child sequences of an element, in visual order. */
export function slotsOf(el: Element): Slot[] {
  const owner = el.id;
  switch (el.kind) {
    case 'alternative':
      return [
        { ref: { owner, slot: 'then' }, seq: el.thenBranch },
        { ref: { owner, slot: 'else' }, seq: el.elseBranch },
      ];
    case 'case':
    case 'parallel':
      return el.branches.map((seq, index) => ({ ref: { owner, slot: 'branch', index }, seq }));
    case 'for': case 'while': case 'repeat': case 'forever':
      return [{ ref: { owner, slot: 'body' }, seq: el.body }];
    case 'try':
      return [
        { ref: { owner, slot: 'try' }, seq: el.tryBody },
        { ref: { owner, slot: 'catch' }, seq: el.catchBody },
        { ref: { owner, slot: 'finally' }, seq: el.finallyBody },
      ];
    default:
      return [];
  }
}

/** Pre-order traversal over all elements (nested included). */
export function walk(d: Diagram | Element[], fn: (el: Element, depth: number) => void): void {
  const visit = (seq: Element[], depth: number) => {
    for (const el of seq) {
      fn(el, depth);
      for (const s of slotsOf(el)) visit(s.seq, depth + 1);
    }
  };
  visit(Array.isArray(d) ? d : d.children, 0);
}

export function countElements(d: Diagram | Element[]): number {
  let n = 0;
  walk(d, () => { n += 1; });
  return n;
}

export interface Found { el: Element; parentSeq: SeqRef; index: number }

export function findById(d: Diagram, id: string): Found | null {
  const search = (seq: Element[], ref: SeqRef): Found | null => {
    for (let i = 0; i < seq.length; i++) {
      const el = seq[i];
      if (el.id === id) return { el, parentSeq: ref, index: i };
      for (const s of slotsOf(el)) {
        const r = search(s.seq, s.ref);
        if (r) return r;
      }
    }
    return null;
  };
  return search(d.children, { owner: 'root' });
}

function findElement(d: Diagram, id: string): Element | null {
  return findById(d, id)?.el ?? null;
}

export function sameRef(a: SeqRef, b: SeqRef): boolean {
  if (a.owner !== b.owner) return false;
  if (a.owner === 'root') return true;
  const sa = (a as { slot: string; index?: number });
  const sb = (b as { slot: string; index?: number });
  return sa.slot === sb.slot && (sa.index ?? -1) === (sb.index ?? -1);
}

export function getSeq(d: Diagram, ref: SeqRef): Element[] {
  if (ref.owner === 'root') return d.children;
  const el = findElement(d, ref.owner);
  if (!el) throw new Error(`Unknown element ${ref.owner}`);
  const slot = slotsOf(el).find((s) => sameRef(s.ref, ref));
  if (!slot) throw new Error(`Element ${ref.owner} (${el.kind}) has no slot ${JSON.stringify(ref)}`);
  return slot.seq;
}

/** True if `id` is `ancestorId` or lies inside it. */
export function isInside(d: Diagram, ancestorId: string, id: string): boolean {
  const anc = findElement(d, ancestorId);
  if (!anc) return false;
  if (anc.id === id) return true;
  let hit = false;
  walk(slotsOf(anc).flatMap((s) => s.seq), (el) => { if (el.id === id) hit = true; });
  return hit;
}
