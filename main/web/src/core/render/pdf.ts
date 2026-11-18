// SPDX-License-Identifier: GPL-3.0-or-later
// Minimal PDF writer: one page in the size of the diagram, holding the rendered picture.
// Desktop: File > Export > Picture > PDF. The image is embedded losslessly (Flate) when
// the browser offers CompressionStream, otherwise as high quality JPEG.

export interface PdfImage {
  /** pixel size of the image */
  width: number;
  height: number;
  /** page size in points (1/72 inch) */
  pageWidth: number;
  pageHeight: number;
  data: Uint8Array;
  filter: 'DCTDecode' | 'FlateDecode';
}

const enc = new TextEncoder();

export function buildPdf(img: PdfImage, title: string): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === 'string' ? enc.encode(b) : b;
    chunks.push(u);
    pos += u.length;
  };
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = pos;
    push(`${n} 0 obj\n`);
    if (typeof body === 'string') push(body); else body();
    push('\nendobj\n');
  };
  const pdfStr = (s: string) => {
    // UTF-16BE text string with BOM for non-ASCII titles
    if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/([\\()])/g, '\\$1')})`;
    let hex = 'FEFF';
    for (const ch of s) {
      const c = ch.codePointAt(0)!;
      if (c > 0xffff) { const v = c - 0x10000; hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0'); }
      else hex += c.toString(16).padStart(4, '0');
    }
    return `<${hex.toUpperCase()}>`;
  };
  const W = img.pageWidth.toFixed(2);
  const H = img.pageHeight.toFixed(2);
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
  obj(4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  obj(5, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${img.filter} /Length ${img.data.length} >>\nstream\n`);
    push(img.data);
    push('\nendstream');
  });
  obj(6, `<< /Title ${pdfStr(title)} /Producer (Structorizer Web) /Creator (Structorizer Web) >>`);
  const xref = pos;
  push(`xref\n0 7\n0000000000 65535 f \n`);
  for (let i = 1; i <= 6; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(pos);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
