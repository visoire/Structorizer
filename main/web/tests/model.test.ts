import { describe, expect, it } from 'vitest';
import {
  cloneWithNewIds, countElements, createDiagram, createElement, findById, getSeq, insertAt,
  moveTo, newId, removeById, shiftElement, updateElement,
} from '../src/core/model';
import type { Diagram, Element, ElementKind } from '../src/core/model';

const KINDS: ElementKind[] = ['instruction', 'call', 'jump', 'alternative', 'case', 'for', 'while', 'repeat', 'forever', 'parallel', 'try'];

function sample(): { d: Diagram; loop: Element; inner: Element } {
  let d = createDiagram();
  const loop = createElement('while');
  const inner = createElement('instruction', ['x <- 1']);
  d = insertAt(d, { seq: { owner: 'root' }, index: 0 }, loop);
  d = insertAt(d, { seq: { owner: loop.id, slot: 'body' }, index: 0 }, inner);
  return { d, loop, inner };
}

describe('model', () => {
  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, newId));
    expect(ids.size).toBe(1000);
  });

  it('creates every kind', () => {
    for (const k of KINDS) expect(createElement(k).kind).toBe(k);
    const c = createElement('case');
    expect(c.kind === 'case' && c.branches.length).toBe(3);
    const p = createElement('parallel');
    expect(p.kind === 'parallel' && p.branches.length).toBe(2);
  });

  it('inserts, finds and removes immutably', () => {
    const { d, loop, inner } = sample();
    expect(countElements(d)).toBe(2);
    expect(findById(d, inner.id)?.parentSeq).toEqual({ owner: loop.id, slot: 'body' });
    expect(getSeq(d, { owner: loop.id, slot: 'body' }).length).toBe(1);
    const d2 = removeById(d, inner.id);
    expect(countElements(d2)).toBe(1);
    expect(countElements(d)).toBe(2);
  });

  it('refuses to move an element into its own subtree', () => {
    const { d, loop } = sample();
    expect(moveTo(d, loop.id, { seq: { owner: loop.id, slot: 'body' }, index: 0 })).toBe(d);
  });

  it('moves within and across sequences', () => {
    let { d, inner } = sample();
    d = moveTo(d, inner.id, { seq: { owner: 'root' }, index: 0 });
    expect(d.children[0].id).toBe(inner.id);
    const a = createElement('instruction', ['a']);
    d = insertAt(d, { seq: { owner: 'root' }, index: 2 }, a);
    d = moveTo(d, inner.id, { seq: { owner: 'root' }, index: 3 });
    expect(d.children.map((e) => e.id).at(-1)).toBe(inner.id);
    d = shiftElement(d, inner.id, -1);
    expect(d.children[1].id).toBe(inner.id);
  });

  it('keeps case and parallel branches in line with their text (D-05)', () => {
    let d = createDiagram();
    const c = createElement('case');
    const p = createElement('parallel');
    d = insertAt(d, { seq: { owner: 'root' }, index: 0 }, c, p);
    d = updateElement(d, c.id, { text: ['x', '1', '2', '3', '4', 'default'] });
    d = updateElement(d, p.id, { text: ['4'] });
    const c2 = findById(d, c.id)!.el;
    const p2 = findById(d, p.id)!.el;
    expect(c2.kind === 'case' && c2.branches.length).toBe(5);
    expect(p2.kind === 'parallel' && p2.branches.length).toBe(4);
    d = updateElement(d, c.id, { text: ['x'] });
    const c3 = findById(d, c.id)!.el;
    expect(c3.kind === 'case' && c3.branches.length).toBe(2);
  });

  it('clones with fresh ids', () => {
    const { d, loop } = sample();
    const copy = cloneWithNewIds(findById(d, loop.id)!.el);
    expect(copy.id).not.toBe(loop.id);
    expect(copy.kind === 'while' && copy.body[0].text).toEqual(['x <- 1']);
  });
});
