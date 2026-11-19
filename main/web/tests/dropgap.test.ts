// @vitest-environment jsdom
// Drag and drop target: the whole element is a drop zone, not only the thin gap lines.
import { describe, expect, it } from 'vitest';
import { createLayoutEngine, dropGap, fakeMeasure, type Hit } from '../src/core/layout';
import { createDiagram, createElement, insertAt, type While } from '../src/core/model';

function build() {
  let d = createDiagram();
  const a = createElement('instruction', ['a <- 1']);
  const loop = createElement('while', ['i < 10']) as While;
  const inner = createElement('instruction', ['i <- i + 1']);
  const b = createElement('instruction', ['b <- 2']);
  d = insertAt(d, { seq: { owner: 'root' }, index: 0 }, a, loop, b);
  d = insertAt(d, { seq: { owner: loop.id, slot: 'body' }, index: 0 }, inner);
  const scene = createLayoutEngine(fakeMeasure).layout(d);
  const hit = (id: string) => scene.hits.find((h): h is Extract<Hit, { t: 'el' }> => h.t === 'el' && h.id === id)!;
  return { scene, hit, a, loop, inner, b };
}

describe('dropGap', () => {
  it('upper half of an element inserts before, lower half after', () => {
    const { scene, hit, b } = build();
    const hb = hit(b.id);
    const cx = hb.x + hb.w / 2;
    expect(dropGap(scene, cx, hb.y + 2)).toMatchObject({ ref: { owner: 'root' }, index: 2 });
    expect(dropGap(scene, cx, hb.y + hb.h - 2)).toMatchObject({ ref: { owner: 'root' }, index: 3 });
  });

  it('records the sequence position on element hits', () => {
    const { hit, loop, inner } = build();
    expect(hit(loop.id)).toMatchObject({ seq: { owner: 'root' }, index: 1 });
    expect(hit(inner.id)).toMatchObject({ seq: { owner: loop.id, slot: 'body' }, index: 0 });
  });

  it('the loop header decides before/after, the body drops inside', () => {
    const { scene, hit, loop, inner } = build();
    const hl = hit(loop.id);
    const head = hl.head;
    expect(head.h).toBeLessThan(hl.h);
    expect(dropGap(scene, hl.x + hl.w / 2, head.y + 1)).toMatchObject({ ref: { owner: 'root' }, index: 1 });
    expect(dropGap(scene, hl.x + hl.w / 2, head.y + head.h - 1)).toMatchObject({ ref: { owner: 'root' }, index: 2 });
    const hi = hit(inner.id);
    expect(dropGap(scene, hi.x + hi.w / 2, hi.y + hi.h - 2)).toMatchObject({ ref: { owner: loop.id, slot: 'body' }, index: 1 });
  });

  it('below the diagram appends, the title inserts at the top', () => {
    const { scene } = build();
    expect(dropGap(scene, 10, scene.height + 40)).toMatchObject({ ref: { owner: 'root' }, index: 3 });
    expect(dropGap(scene, 10, 3)).toMatchObject({ ref: { owner: 'root' }, index: 0 });
  });
});
