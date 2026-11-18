// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNsd } from '../src/core/io';
import { altHeaderWidth, createLayoutEngine, displayLine, fakeMeasure, hitBranchHead, hitTest, LINE_H, nearestGap, P } from '../src/core/layout';
import { createDiagram, createElement, insertAt, setBranchHeadColor, walk } from '../src/core/model';

const fixture = (name: string) => readNsd(readFileSync(resolve(process.cwd(), 'tests/fixtures', name), 'utf8')).diagram;

describe('layout', () => {
  it('lays out every element of the fixture inside its parent', () => {
    const d = fixture('all-elements.nsd');
    const scene = createLayoutEngine(fakeMeasure).layout(d);
    const elHits = scene.hits.filter((h) => h.t === 'el');
    let n = 0;
    walk(d, () => { n += 1; });
    expect(elHits.length).toBe(n);
    for (const h of scene.hits) {
      expect(h.w).toBeGreaterThan(0);
      expect(h.h).toBeGreaterThan(0);
      expect(h.x + h.w).toBeLessThanOrEqual(scene.width);
      expect(h.y + h.h).toBeLessThanOrEqual(scene.height);
    }
  });

  it('measures an instruction like the desktop', () => {
    const eng = createLayoutEngine(fakeMeasure);
    const el = createElement('instruction', ['abcd', 'ab']);
    expect(eng.measureEl(el)).toEqual({ w: displayLine('abcd').length * 8 + P, h: 2 * LINE_H + P });
    const call = createElement('call', ['abcd']);
    expect(eng.measureEl(call).w).toBe(4 * 8 + 2 * P);
  });

  it('widens the IF header with longer conditions', () => {
    expect(altHeaderWidth([200], 40)).toBeGreaterThan(altHeaderWidth([50], 40));
    expect(altHeaderWidth([100, 100], 40)).toBeGreaterThan(0);
  });

  it('stretches children to the sequence width', () => {
    let d = createDiagram();
    d = insertAt(d, { seq: { owner: 'root' }, index: 0 },
      createElement('instruction', ['a']), createElement('instruction', ['a much longer line of text']));
    const scene = createLayoutEngine(fakeMeasure).layout(d);
    const [a, b] = scene.hits.filter((h) => h.t === 'el');
    expect(a.w).toBe(b.w);
  });

  it('hides the default branch of a CASE ending with %', () => {
    let d = createDiagram();
    const c = createElement('case', ['x', '1', '2', '%']);
    d = insertAt(d, { seq: { owner: 'root' }, index: 0 }, c);
    const scene = createLayoutEngine(fakeMeasure).layout(d);
    expect(scene.hits.filter((h) => h.t === 'seq').length).toBe(2);
  });

  it('finds the deepest element and insertion gaps', () => {
    const d = fixture('all-elements.nsd');
    const scene = createLayoutEngine(fakeMeasure).layout(d);
    const inner = scene.hits.filter((h) => h.t === 'el').at(-1)!;
    const hit = hitTest(scene, inner.x + 2, inner.y + 2);
    expect(hit && hit.t === 'el' && hit.id).toBe(inner.t === 'el' && inner.id);
    expect(nearestGap(scene, 30, scene.hits[1].y + 1)).not.toBeNull();
  });

  it('shows assignment arrows but keeps strings untouched', () => {
    expect(displayLine('x <- "a<-b" <= 3')).toBe('x ← "a<-b" ≤ 3');
  });

  it('emits branch head polygons and colours for IF and CASE (P1-29)', () => {
    let d = createDiagram();
    const alt = createElement('alternative', ['x > 0']);
    d = insertAt(d, { seq: { owner: 'root' }, index: 0 }, alt);
    d = setBranchHeadColor(d, alt.id, 0, '80ff80');
    const scene = createLayoutEngine(fakeMeasure).layout(d);
    const altHit = scene.hits.find((h) => h.t === 'el' && h.id === alt.id);
    if (!altHit || altHit.t !== 'el') throw new Error('missing hit');
    expect(altHit.branchHeads?.length).toBe(2);
    expect(hitBranchHead(altHit, altHit.x + 4, altHit.y + altHit.head.h - 4)).toBe(0);
    expect(scene.items.some((it) => it.t === 'poly' && it.fill === '#80ff80')).toBe(true);
  });
});
