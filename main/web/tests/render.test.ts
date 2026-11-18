// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNsd } from '../src/core/io';
import { createLayoutEngine, fakeMeasure } from '../src/core/layout';
import { sceneToEmf } from '../src/core/render/emf';
import { buildPdf } from '../src/core/render/pdf';
import { sceneToSvg, themedFill } from '../src/core/render/svg';

const d = readNsd(readFileSync(resolve(process.cwd(), 'tests/fixtures/all-elements.nsd'), 'utf8')).diagram;
const scene = createLayoutEngine(fakeMeasure, { highlight: true }).layout(d);

const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

describe('renderers', () => {
  it('writes a structurally valid EMF', () => {
    const emf = sceneToEmf(scene, fakeMeasure);
    expect(u32(emf, 0)).toBe(1); // EMR_HEADER
    expect(u32(emf, 4)).toBe(88);
    expect(u32(emf, 40)).toBe(0x464d4520);
    expect(u32(emf, 48)).toBe(emf.length); // total bytes
    // walk all records: sizes are multiples of 4 and the last one is EMR_EOF
    let o = 0;
    let count = 0;
    let last = 0;
    while (o < emf.length) {
      const size = u32(emf, o + 4);
      expect(size % 4).toBe(0);
      expect(size).toBeGreaterThanOrEqual(8);
      last = u32(emf, o);
      o += size;
      count++;
    }
    expect(o).toBe(emf.length);
    expect(last).toBe(14);
    expect(u32(emf, 52)).toBe(count); // record count
  });

  it('writes a PDF with a correct xref table', () => {
    const pdf = buildPdf({ width: 2, height: 1, pageWidth: 10, pageHeight: 5, data: new Uint8Array([1, 2, 3, 4, 5, 6]), filter: 'FlateDecode' }, 'Täst');
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref = parseInt(/startxref\n(\d+)/.exec(text)![1], 10);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...text.matchAll(/(\d{10}) 00000 n/g)].map((m) => parseInt(m[1], 10));
    offsets.forEach((off, i) => expect(text.slice(off, off + 7)).toBe(`${i + 1} 0 obj`));
  });

  it('renders highlighting and a dark variant', () => {
    const light = sceneToSvg(scene);
    expect(light).toContain('<tspan fill="#000099">');
    const dark = sceneToSvg(scene, { theme: 'dark' });
    expect(dark).toContain('#1d2023');
    expect(themedFill('#ffffff', 'dark')).toBe('#1d2023');
    expect(themedFill('#ffff80', 'light')).toBe('#ffff80');
  });
});
