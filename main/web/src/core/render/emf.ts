// SPDX-License-Identifier: GPL-3.0-or-later
// Scene -> Enhanced Metafile (EMF, [MS-EMF]) with vector shapes and Unicode text.
// Desktop: File > Export > Picture > EMF. Opens in Word, PowerPoint, LibreOffice, Inkscape.
import type { Scene } from '../layout/layout';
import { FONT_SIZE, type MeasureFn } from '../layout/measure';
import { PALETTES } from './svg';

class Buf {
  private bytes: number[] = [];
  get length() { return this.bytes.length; }
  u32(v: number) { const x = v >>> 0; this.bytes.push(x & 255, (x >>> 8) & 255, (x >>> 16) & 255, (x >>> 24) & 255); }
  i32(v: number) { this.u32(Math.round(v) | 0); }
  i16(v: number) { const x = Math.max(-32768, Math.min(32767, Math.round(v))) & 0xffff; this.bytes.push(x & 255, x >>> 8); }
  u8(v: number) { this.bytes.push(v & 255); }
  f32(v: number) { const b = new Uint8Array(new Float32Array([v]).buffer); this.bytes.push(...b); }
  utf16(s: string) { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); this.bytes.push(c & 255, c >>> 8); } }
  pad4() { while (this.bytes.length % 4) this.bytes.push(0); }
  append(b: Buf) { this.bytes.push(...b.bytes); }
  patchU32(at: number, v: number) { const x = v >>> 0; this.bytes[at] = x & 255; this.bytes[at + 1] = (x >>> 8) & 255; this.bytes[at + 2] = (x >>> 16) & 255; this.bytes[at + 3] = (x >>> 24) & 255; }
  toUint8() { return new Uint8Array(this.bytes); }
}

const EMR = { HEADER: 1, POLYGON16: 86, POLYLINE16: 87, EOF: 14, SETMAPMODE: 17, SETBKMODE: 18, SETTEXTALIGN: 22, SETTEXTCOLOR: 24,
  SELECTOBJECT: 37, CREATEPEN: 38, CREATEBRUSHINDIRECT: 39, DELETEOBJECT: 40, RECTANGLE: 43, ROUNDRECT: 44,
  EXTCREATEFONTINDIRECTW: 82, EXTTEXTOUTW: 84 } as const;
const NULL_BRUSH = 0x80000005;
const NULL_PEN = 0x80000008;

const colorref = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex) ?? ['', '000000'];
  const v = m[1];
  return parseInt(v.slice(0, 2), 16) | (parseInt(v.slice(2, 4), 16) << 8) | (parseInt(v.slice(4, 6), 16) << 16);
};

export function sceneToEmf(scene: Scene, measure: MeasureFn, fontFace = 'Arial'): Uint8Array {
  const pal = PALETTES.light;
  const body = new Buf();
  let records = 0;
  let handles = 1;
  const rec = (type: number, write: (b: Buf) => void) => {
    const b = new Buf();
    write(b);
    b.pad4();
    body.u32(type);
    body.u32(b.length + 8);
    body.append(b);
    records++;
  };
  const W = Math.ceil(scene.width);
  const H = Math.ceil(scene.height);

  rec(EMR.SETMAPMODE, (b) => b.u32(1)); // MM_TEXT
  rec(EMR.SETBKMODE, (b) => b.u32(1)); // TRANSPARENT

  // one black pen for all strokes
  const pen = handles++;
  rec(EMR.CREATEPEN, (b) => { b.u32(pen); b.u32(0); b.i32(1); b.i32(0); b.u32(colorref(pal.stroke)); });
  rec(EMR.SELECTOBJECT, (b) => b.u32(pen));

  const brushes = new Map<string, number>();
  const brush = (fill: string) => {
    let h = brushes.get(fill);
    if (h === undefined) {
      h = handles++;
      const hh = h;
      rec(EMR.CREATEBRUSHINDIRECT, (b) => { b.u32(hh); b.u32(0); b.u32(colorref(fill)); b.u32(0); });
      brushes.set(fill, h);
    }
    rec(EMR.SELECTOBJECT, (b) => b.u32(h!));
  };
  const hatch = handles++;
  rec(EMR.CREATEBRUSHINDIRECT, (b) => { b.u32(hatch); b.u32(2); b.u32(colorref(pal.hatch)); b.u32(3); }); // BS_HATCHED, HS_BDIAGONAL

  const fonts: Record<'n' | 'b', number> = { n: 0, b: 0 };
  for (const kind of ['n', 'b'] as const) {
    const h = handles++;
    fonts[kind] = h;
    rec(EMR.EXTCREATEFONTINDIRECTW, (b) => {
      b.u32(h);
      b.i32(-FONT_SIZE); b.i32(0); b.i32(0); b.i32(0); b.i32(kind === 'b' ? 700 : 400);
      b.u8(0); b.u8(0); b.u8(0); b.u8(1); b.u8(0); b.u8(0); b.u8(5); b.u8(0); // charset DEFAULT, quality CLEARTYPE
      const face = fontFace.slice(0, 31);
      b.utf16(face);
      for (let i = face.length; i < 32; i++) { b.u8(0); b.u8(0); }
    });
  }

  const bounds = (b: Buf, xs: number[], ys: number[]) => {
    b.i32(Math.floor(Math.min(...xs))); b.i32(Math.floor(Math.min(...ys))); b.i32(Math.ceil(Math.max(...xs))); b.i32(Math.ceil(Math.max(...ys)));
  };
  const poly = (type: number, pts: [number, number][]) => rec(type, (b) => {
    bounds(b, pts.map((p) => p[0]), pts.map((p) => p[1]));
    b.u32(pts.length);
    for (const [x, y] of pts) { b.i16(x); b.i16(y); }
  });

  let curFont: 'n' | 'b' | null = null;
  let curColor = '';
  let curAlign = -1;
  const textOut = (x: number, y: number, s: string, color: string, align: number) => {
    if (curColor !== color) { rec(EMR.SETTEXTCOLOR, (b) => b.u32(colorref(color))); curColor = color; }
    if (curAlign !== align) { rec(EMR.SETTEXTALIGN, (b) => b.u32(align)); curAlign = align; }
    const chars = [...s];
    const str = chars.join('');
    rec(EMR.EXTTEXTOUTW, (b) => {
      const w = measure(str);
      bounds(b, [x - w, x + w], [y - FONT_SIZE, y + 4]);
      b.u32(1); b.f32(0); b.f32(0); // GM_COMPATIBLE, scales
      b.i32(x); b.i32(y);
      b.u32(str.length);
      const offString = 76;
      const strBytes = str.length * 2;
      const padded = strBytes + ((4 - (strBytes % 4)) % 4);
      b.u32(offString);
      b.u32(0); // options
      b.i32(0); b.i32(0); b.i32(-1); b.i32(-1); // no clipping rectangle
      b.u32(offString + padded); // offDx
      b.utf16(str);
      b.pad4();
      // advance widths per UTF-16 code unit
      for (let i = 0; i < str.length; i++) b.u32(Math.max(1, Math.round(measure(str[i]))));
    });
  };

  for (const it of scene.items) {
    switch (it.t) {
      case 'rect':
        if (it.fill && it.fill !== 'none') brush(it.fill); else rec(EMR.SELECTOBJECT, (b) => b.u32(NULL_BRUSH));
        rec(EMR.SELECTOBJECT, (b) => b.u32(it.stroke === false ? NULL_PEN : pen));
        if (it.rx) rec(EMR.ROUNDRECT, (b) => { b.i32(it.x); b.i32(it.y); b.i32(it.x + it.w + 1); b.i32(it.y + it.h + 1); b.i32(it.rx! * 2); b.i32(it.rx! * 2); });
        else rec(EMR.RECTANGLE, (b) => { b.i32(it.x); b.i32(it.y); b.i32(it.x + it.w + 1); b.i32(it.y + it.h + 1); });
        if (it.stroke === false) rec(EMR.SELECTOBJECT, (b) => b.u32(pen));
        break;
      case 'line':
        poly(EMR.POLYLINE16, [[it.x1, it.y1], [it.x2, it.y2]]);
        break;
      case 'poly':
        if (it.closed) {
          if (it.fill && it.fill !== 'none') brush(it.fill); else rec(EMR.SELECTOBJECT, (b) => b.u32(NULL_BRUSH));
          poly(EMR.POLYGON16, it.points);
        } else poly(EMR.POLYLINE16, it.points);
        break;
      case 'hatch':
        rec(EMR.SELECTOBJECT, (b) => b.u32(hatch));
        rec(EMR.SELECTOBJECT, (b) => b.u32(NULL_PEN));
        rec(EMR.RECTANGLE, (b) => { b.i32(it.x); b.i32(it.y); b.i32(it.x + it.w + 1); b.i32(it.y + it.h + 1); });
        rec(EMR.SELECTOBJECT, (b) => b.u32(pen));
        break;
      case 'text': {
        const f = it.bold ? 'b' : 'n';
        if (curFont !== f) { rec(EMR.SELECTOBJECT, (b) => b.u32(fonts[f])); curFont = f; }
        const color = it.muted ? pal.muted : pal.text;
        const TA_BASELINE = 24;
        if (it.spans && it.spans.some((s) => s.c) && (!it.anchor || it.anchor === 'start')) {
          let x = it.x;
          for (const sp of it.spans) {
            textOut(x, it.y, sp.s, sp.c ? pal.span[sp.c] : color, TA_BASELINE);
            x += measure(sp.s, it.bold);
          }
        } else {
          const align = TA_BASELINE | (it.anchor === 'middle' ? 6 : it.anchor === 'end' ? 2 : 0);
          textOut(it.x, it.y, it.s, color, align);
        }
        break;
      }
    }
  }
  for (const h of [pen, hatch, ...brushes.values(), fonts.n, fonts.b]) rec(EMR.DELETEOBJECT, (b) => b.u32(h));
  rec(EMR.EOF, (b) => { b.u32(0); b.u32(16); b.u32(20); });

  // header (written last because it needs the totals)
  const head = new Buf();
  head.u32(EMR.HEADER);
  head.u32(88);
  head.i32(0); head.i32(0); head.i32(W); head.i32(H); // bounds (device units)
  const mm100 = (px: number) => Math.round((px * 2540) / 96); // 0.01 mm at 96 dpi
  head.i32(0); head.i32(0); head.i32(mm100(W)); head.i32(mm100(H)); // frame
  head.u32(0x464d4520); // " EMF"
  head.u32(0x10000);
  const sizeAt = head.length;
  head.u32(0); // bytes, patched
  head.u32(records + 1);
  head.i16(handles); // nHandles (u16)
  head.i16(0); // reserved (u16)
  head.u32(0); head.u32(0); // description
  head.u32(0); // palette entries
  head.i32(1920); head.i32(1080); // reference device in pixels
  head.i32(508); head.i32(286); // reference device in millimetres (96 dpi)
  head.append(body);
  head.patchU32(sizeAt, head.length);
  return head.toUint8();
}
