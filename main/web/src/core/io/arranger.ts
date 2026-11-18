// SPDX-License-Identifier: GPL-3.0-or-later
// Desktop-compatible .arr (arrangement list) and .arrz (portable zipped arrangement) reader & writer.
// Matches lu/fisch/structorizer/archivar/Archivar.java.
import type { Diagram } from '../model/types';
import { parseSignature } from '../lang/analyze';
import { join, splitTop, tokenize } from '../lang/lexer';
import { readNsd } from './readNsd';
import { writeNsd } from './writeNsd';

export interface ArrEntry {
  x: number;
  y: number;
  fileName: string;
  name?: string;
  minArgs?: number;
  maxArgs?: number;
}

export interface ArrzBundle {
  arrName: string;
  entries: Array<{
    diagram: Diagram;
    x: number;
    y: number;
    pinned?: boolean;
    fileName: string;
  }>;
}

/**
 * Parse a Structorizer `.arr` file (`x,y,"filename.nsd","diagramName",minArgs,maxArgs`).
 */
export function parseArr(text: string): ArrEntry[] {
  const out: ArrEntry[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const parts = splitTop(tokenize(line), ',').map((p) => join(p).trim());
    if (parts.length < 3) continue;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const fileName = parts[2].replace(/^["']|["']$/g, '').replace(/\\/g, '/').split('/').pop() || parts[2];
    const name = parts[3] ? parts[3].replace(/^["']|["']$/g, '') : undefined;
    const minArgs = parts[4] !== undefined ? Number(parts[4]) : undefined;
    const maxArgs = parts[5] !== undefined ? Number(parts[5]) : undefined;
    if (Number.isFinite(x) && Number.isFinite(y) && fileName) {
      out.push({ x, y, fileName, name, minArgs, maxArgs });
    }
  }
  return out;
}

/**
 * Format an array of positioned diagrams into a desktop-compatible `.arr` text file.
 */
export function formatArr(entries: ArrEntry[]): string {
  return entries
    .map((e) => {
      const base = `${Math.round(e.x)},${Math.round(e.y)},${JSON.stringify(e.fileName)}`;
      if (e.name !== undefined) {
        return `${base},${JSON.stringify(e.name)},${e.minArgs ?? -1},${e.maxArgs ?? -1}`;
      }
      return base;
    })
    .join('\n') + '\n';
}

// ------------------------------------------------------------------ Pure-TS PKZIP + RFC 1951 Inflate

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// Minimal RFC 1951 raw DEFLATE decompressor for reading ZipOutputStream archives from Desktop Structorizer
const FIXED_LIT_LEN = (() => {
  const l = new Uint8Array(288);
  l.fill(8, 0, 144);
  l.fill(9, 144, 256);
  l.fill(7, 256, 280);
  l.fill(8, 280, 288);
  return buildHuffman(l);
})();

const FIXED_DIST = (() => {
  const d = new Uint8Array(32);
  d.fill(5);
  return buildHuffman(d);
})();

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface HuffTree {
  counts: Uint16Array;
  symbols: Uint16Array;
}

function buildHuffman(lengths: Uint8Array): HuffTree {
  const counts = new Uint16Array(16);
  for (let i = 0; i < lengths.length; i++) if (lengths[i]) counts[lengths[i]]++;
  const offsets = new Uint16Array(16);
  let total = 0;
  for (let i = 1; i <= 15; i++) {
    offsets[i] = total;
    total += counts[i];
  }
  const symbols = new Uint16Array(total);
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i];
    if (len) symbols[offsets[len]++] = i;
  }
  return { counts, symbols };
}

export function inflateRaw(src: Uint8Array): Uint8Array {
  let bitPos = 0;
  const readBits = (n: number): number => {
    let val = 0;
    for (let i = 0; i < n; i++) {
      const byteIdx = bitPos >>> 3;
      const bitIdx = bitPos & 7;
      val |= ((src[byteIdx] >>> bitIdx) & 1) << i;
      bitPos++;
    }
    return val;
  };
  const decodeSymbol = (tree: HuffTree): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= readBits(1);
      const count = tree.counts[len];
      if (code - count < first) return tree.symbols[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new Error('Invalid DEFLATE Huffman code');
  };

  const out: number[] = [];
  let bfinal = 0;
  while (!bfinal) {
    bfinal = readBits(1);
    const btype = readBits(2);
    if (btype === 0) {
      bitPos = (bitPos + 7) & ~7;
      const byteIdx = bitPos >>> 3;
      const len = src[byteIdx] | (src[byteIdx + 1] << 8);
      bitPos += 32;
      const start = bitPos >>> 3;
      for (let i = 0; i < len; i++) out.push(src[start + i]);
      bitPos += len * 8;
    } else if (btype === 1 || btype === 2) {
      let litLenTree = FIXED_LIT_LEN;
      let distTree = FIXED_DIST;
      if (btype === 2) {
        const hlit = readBits(5) + 257;
        const hdist = readBits(5) + 1;
        const hclen = readBits(4) + 4;
        const clenLengths = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) clenLengths[CLEN_ORDER[i]] = readBits(3);
        const clenTree = buildHuffman(clenLengths);
        const lengths = new Uint8Array(hlit + hdist);
        let idx = 0;
        while (idx < hlit + hdist) {
          const sym = decodeSymbol(clenTree);
          if (sym < 16) lengths[idx++] = sym;
          else if (sym === 16) {
            const rep = readBits(2) + 3;
            const prev = lengths[idx - 1];
            for (let r = 0; r < rep; r++) lengths[idx++] = prev;
          } else if (sym === 17) {
            const rep = readBits(3) + 3;
            for (let r = 0; r < rep; r++) lengths[idx++] = 0;
          } else {
            const rep = readBits(7) + 11;
            for (let r = 0; r < rep; r++) lengths[idx++] = 0;
          }
        }
        litLenTree = buildHuffman(lengths.subarray(0, hlit));
        distTree = buildHuffman(lengths.subarray(hlit));
      }
      while (true) {
        const sym = decodeSymbol(litLenTree);
        if (sym === 256) break;
        if (sym < 256) out.push(sym);
        else {
          const lenIdx = sym - 257;
          const length = LEN_BASE[lenIdx] + readBits(LEN_EXTRA[lenIdx]);
          const distSym = decodeSymbol(distTree);
          const dist = DIST_BASE[distSym] + readBits(DIST_EXTRA[distSym]);
          for (let i = 0; i < length; i++) out.push(out[out.length - dist]);
        }
      }
    } else {
      throw new Error(`Unsupported DEFLATE block type ${btype}`);
    }
  }
  return new Uint8Array(out);
}

/**
 * Pack a map of `{ filename: Uint8Array }` into a standard PKZIP archive (Store method 0).
 */
export function packZip(files: Record<string, Uint8Array>): Uint8Array {
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const names = Object.keys(files);

  for (const name of names) {
    const nameBytes = enc.encode(name);
    const data = files[name];
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true);         // Version needed (2.0)
    lv.setUint16(6, 0x0800, true);     // UTF-8 filename flag
    lv.setUint16(8, 0, true);          // Method 0: Store
    lv.setUint16(10, 0, true);         // Mod time
    lv.setUint16(12, 0x5421, true);    // Mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, names.length, true);
  ev.setUint16(10, names.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of localParts) { out.set(p, pos); pos += p.length; }
  for (const p of centralParts) { out.set(p, pos); pos += p.length; }
  out.set(eocd, pos);
  return out;
}

/**
 * Unpack a PKZIP archive (supports Store method 0 and Deflate method 8, including Central Directory lookup for data-descriptor entries).
 */
export function unpackZip(zipBytes: Uint8Array): Record<string, Uint8Array> {
  const dec = new TextDecoder();
  const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const out: Record<string, Uint8Array> = {};

  // Locate End of Central Directory (EOCD) from the end of the buffer
  let eocdPos = -1;
  for (let i = zipBytes.length - 22; i >= Math.max(0, zipBytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }

  if (eocdPos !== -1) {
    const count = dv.getUint16(eocdPos + 10, true);
    let cdPos = dv.getUint32(eocdPos + 16, true);
    for (let i = 0; i < count && cdPos + 46 <= zipBytes.length; i++) {
      if (dv.getUint32(cdPos, true) !== 0x02014b50) break;
      const method = dv.getUint16(cdPos + 10, true);
      const compSize = dv.getUint32(cdPos + 20, true);
      const nameLen = dv.getUint16(cdPos + 28, true);
      const extraLen = dv.getUint16(cdPos + 30, true);
      const commentLen = dv.getUint16(cdPos + 32, true);
      const localOffset = dv.getUint32(cdPos + 42, true);
      const rawName = dec.decode(zipBytes.subarray(cdPos + 46, cdPos + 46 + nameLen));
      const baseName = rawName.replace(/\\/g, '/').split('/').pop() || rawName;

      if (!rawName.endsWith('/') && localOffset + 30 <= zipBytes.length) {
        const lNameLen = dv.getUint16(localOffset + 26, true);
        const lExtraLen = dv.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + lNameLen + lExtraLen;
        const compData = zipBytes.subarray(dataStart, dataStart + compSize);
        out[baseName] = method === 0 ? compData.slice() : method === 8 ? inflateRaw(compData) : compData.slice();
      }
      cdPos += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  // Fallback sequential scan if EOCD not found
  let pos = 0;
  while (pos + 30 <= zipBytes.length) {
    if (dv.getUint32(pos, true) !== 0x04034b50) break;
    const method = dv.getUint16(pos + 8, true);
    const compSize = dv.getUint32(pos + 18, true);
    const nameLen = dv.getUint16(pos + 26, true);
    const extraLen = dv.getUint16(pos + 28, true);
    const rawName = dec.decode(zipBytes.subarray(pos + 30, pos + 30 + nameLen));
    const baseName = rawName.replace(/\\/g, '/').split('/').pop() || rawName;
    const dataStart = pos + 30 + nameLen + extraLen;
    const compData = zipBytes.subarray(dataStart, dataStart + compSize);
    if (!rawName.endsWith('/')) {
      out[baseName] = method === 0 ? compData.slice() : method === 8 ? inflateRaw(compData) : compData.slice();
    }
    pos = dataStart + compSize;
  }
  return out;
}

/**
 * Write a portable `.arrz` archive containing an `.arr` file and one `.nsd` file per diagram.
 */
export function writeArrz(
  items: Array<{ diagram: Diagram; x?: number; y?: number; fileName?: string }>,
  archiveBaseName = 'arrangement',
): Uint8Array {
  const enc = new TextEncoder();
  const files: Record<string, Uint8Array> = {};
  const arrEntries: ArrEntry[] = [];
  const usedNames = new Set<string>();

  items.forEach((item, idx) => {
    const sig = parseSignature(item.diagram);
    let base = (item.fileName ?? `${sig.name || 'diagram'}.nsd`).replace(/\\/g, '/').split('/').pop()!;
    if (!base.toLowerCase().endsWith('.nsd')) base += '.nsd';
    if (usedNames.has(base)) {
      const stem = base.slice(0, -4);
      let n = 2;
      while (usedNames.has(`${stem}_${n}.nsd`)) n++;
      base = `${stem}_${n}.nsd`;
    }
    usedNames.add(base);
    files[base] = enc.encode(writeNsd(item.diagram));
    const minArgs = item.diagram.diagramType === 'sub' ? sig.params.filter((p) => p.def === undefined).length : -1;
    const maxArgs = item.diagram.diagramType === 'sub' ? sig.params.length : -1;
    arrEntries.push({
      x: item.x ?? (40 + (idx % 3) * 320),
      y: item.y ?? (40 + Math.floor(idx / 3) * 260),
      fileName: base,
      name: sig.name,
      minArgs,
      maxArgs,
    });
  });

  const cleanArr = archiveBaseName.replace(/\.(arrz|arr)$/i, '') + '.arr';
  files[cleanArr] = enc.encode(formatArr(arrEntries));
  return packZip(files);
}

/**
 * Read a portable `.arrz` archive into positioned diagrams.
 */
export function readArrz(zipBytes: Uint8Array): ArrzBundle {
  const dec = new TextDecoder();
  const files = unpackZip(zipBytes);
  const arrKey = Object.keys(files).find((k) => k.toLowerCase().endsWith('.arr'));
  const arrEntries = arrKey ? parseArr(dec.decode(files[arrKey])) : [];
  const usedNsd = new Set<string>();
  const entries: ArrzBundle['entries'] = [];

  for (const ae of arrEntries) {
    const nsdKey = Object.keys(files).find((k) => k.toLowerCase() === ae.fileName.toLowerCase());
    if (!nsdKey) continue;
    usedNsd.add(nsdKey);
    const { diagram } = readNsd(dec.decode(files[nsdKey]));
    entries.push({ diagram, x: ae.x, y: ae.y, fileName: nsdKey });
  }

  // Include any remaining .nsd files in the zip that weren't listed in .arr
  let extraIdx = entries.length;
  for (const key of Object.keys(files)) {
    if (!key.toLowerCase().endsWith('.nsd') || usedNsd.has(key)) continue;
    const { diagram } = readNsd(dec.decode(files[key]));
    entries.push({
      diagram,
      x: 40 + (extraIdx % 3) * 320,
      y: 40 + Math.floor(extraIdx / 3) * 260,
      fileName: key,
    });
    extraIdx++;
  }

  return {
    arrName: arrKey ?? 'arrangement.arr',
    entries,
  };
}
