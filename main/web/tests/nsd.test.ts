// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNsd, writeNsd } from '../src/core/io';
import { countElements, walk } from '../src/core/model';
import type { Diagram, Element } from '../src/core/model';

const fixture = (name: string) => readFileSync(resolve(process.cwd(), 'tests/fixtures', name), 'utf8');

/** Remove runtime ids so trees can be compared structurally. */
function strip(d: Diagram): unknown {
  return JSON.parse(JSON.stringify(d, (k, v) => (k === 'id' || k === 'fileVersion' ? undefined : v)));
}

describe('readNsd', () => {
  it('reads all element types', () => {
    const { diagram: d, warnings } = readNsd(fixture('all-elements.nsd'));
    expect(warnings).toEqual([]);
    expect(d.children.length).toBe(11);
    expect(countElements(d)).toBe(23);
    expect(d.diagramType).toBe('program');
    expect(d.text).toEqual(['AllElements']);
    expect(d.children[0].text).toEqual(['var n: int', 'n <- 3']);
    expect(d.children[1].color).toBe('ffff80');
    const kase = d.children[3] as Extract<Element, { kind: 'case' }>;
    expect(kase.kind).toBe('case');
    expect(kase.branches.length).toBe(3);
    expect(kase.text).toEqual(['x', '1', '2, 3', 'default']);
    const f = d.children[4] as Extract<Element, { kind: 'for' }>;
    expect(f.style).toBe('COUNTER');
    expect(f.counterVar).toBe('i');
    expect(d.children[8].kind).toBe('forever');
    expect(d.children[8].disabled).toBe(true);
    const tr = d.children[10] as Extract<Element, { kind: 'try' }>;
    expect(tr.text).toEqual(['ex']);
    expect(tr.tryBody[0].text).toEqual(['throw "oops"']);
    expect(tr.finallyBody).toEqual([]);
  });

  it('reads the desktop sample hilbert-3', () => {
    const { diagram: d } = readNsd(fixture('hilbert-3.nsd'));
    expect(d.diagramType).toBe('sub');
    expect(d.children.length).toBe(10);
    expect(d.keywords.stepFor).toBe('step');
    expect(d.keywords.preAlt).toBe('if');
    expect(d.keywords.ignoreCase).toBe(false);
    expect(d.comment.length).toBe(8);
    expect(d.meta.licenseName).toBe('GPLv3-link');
  });

  it('repairs inconsistent CASE elements', () => {
    const xml = `<?xml version="1.0"?><root text="&#34;x&#34;"><children>
      <case text="&#34;x&#34;,&#34;1&#34;,&#34;default&#34;"><qCase></qCase><qCase></qCase><qCase></qCase></case>
    </children></root>`;
    const { diagram, warnings } = readNsd(xml);
    const c = diagram.children[0] as Extract<Element, { kind: 'case' }>;
    expect(c.branches.length).toBe(3);
    expect(c.text.length).toBe(4);
    expect(warnings.length).toBe(1);
  });

  it('rejects non-diagram XML', () => {
    expect(() => readNsd('<html></html>')).toThrow();
    expect(() => readNsd('not xml')).toThrow();
  });
});

describe('writeNsd', () => {
  for (const name of ['all-elements.nsd', 'hilbert-3.nsd']) {
    it(`round-trips ${name}`, () => {
      const first = readNsd(fixture(name)).diagram;
      const xml = writeNsd(first, '0.1.0');
      const second = readNsd(xml).diagram;
      const a = strip(first) as Diagram;
      const b = strip(second) as Diagram;
      // origin is rewritten only for files without one; both fixtures carry an origin.
      expect(b).toEqual(a);
    });
  }

  it('escapes special characters', () => {
    const d = readNsd(fixture('all-elements.nsd')).diagram;
    walk(d, () => {});
    const xml = writeNsd({ ...d, comment: ['<tag> & "quote"', 'line 2'] });
    expect(readNsd(xml).diagram.comment).toEqual(['<tag> & "quote"', 'line 2']);
  });
});
