#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Packages the builds into release/ (no dependencies, Node >= 20):
//   structorizer-web-<v>/ + .zip      full web build (index, docs, assets) with hosting files
//   structorizer-single-<v>.zip       one self-contained index.html (like the Craft web packages)
//   structorizer-<v>.html             the same single file, ready to open or upload
//   structorizer-mcp-<v>.zip          CLI and MCP server (node dist/cli.js mcp)
//   SHA256SUMS.txt
// Usage: node scripts/package.mjs [--with-guide]
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'main', 'web');
const mcp = path.join(root, 'main', 'mcp');
const out = path.join(root, 'release');
const withGuide = process.argv.includes('--with-guide');
const version = JSON.parse(readFileSync(path.join(web, 'package.json'), 'utf8')).version;
const short = version.replace(/-web\.\d+$/, '');

const need = (p, hint) => { if (!existsSync(p)) { console.error(`missing ${path.relative(root, p)} (${hint})`); process.exit(1); } };
need(path.join(web, 'dist', 'index.html'), 'run npm run build in main/web');
need(path.join(web, 'dist-single', 'index.html'), 'run npm run build:single in main/web');
need(path.join(mcp, 'dist', 'cli.js'), 'run npm run build in main/mcp');

// ---------------------------------------------------------------- minimal zip writer (deflate)
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(entries, file) {
  const parts = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name.split(path.sep).join('/'), 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, packed);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8); cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(dosTime, 12); cd.writeUInt16LE(dosDate, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(packed.length, 20);
    cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  writeFileSync(file, Buffer.concat([...parts, cdBuf, end]));
}

function filesOf(dir, prefix) {
  const list = [];
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) list.push(...filesOf(full, path.join(prefix, e)));
    else list.push({ name: path.join(prefix, e), data: readFileSync(full) });
  }
  return list;
}

// ---------------------------------------------------------------- assemble
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const pack = path.join(web, 'packaging');
const license = path.join(root, 'LICENSE');

// 1. full web build
const webDir = path.join(out, `structorizer-web-${short}`);
cpSync(path.join(web, 'dist'), webDir, { recursive: true });
if (!withGuide) rmSync(path.join(webDir, 'docs', 'structorizer-user-guide-3.32-35.pdf'), { force: true });
for (const f of ['.htaccess', '_headers', 'HOSTING.md']) cpSync(path.join(pack, f), path.join(webDir, f));
cpSync(license, path.join(webDir, 'LICENSE'));
zip(filesOf(webDir, `structorizer-web-${short}`), path.join(out, `structorizer-web-${short}.zip`));

// 2. single file
const single = readFileSync(path.join(web, 'dist-single', 'index.html'));
writeFileSync(path.join(out, `structorizer-${short}.html`), single);
zip([
  { name: `structorizer-single-${short}/index.html`, data: single },
  { name: `structorizer-single-${short}/HOSTING.md`, data: readFileSync(path.join(pack, 'HOSTING.md')) },
  { name: `structorizer-single-${short}/LICENSE`, data: readFileSync(license) },
], path.join(out, `structorizer-single-${short}.zip`));

// 3. MCP server
zip([
  { name: `structorizer-mcp-${short}/dist/cli.js`, data: readFileSync(path.join(mcp, 'dist', 'cli.js')) },
  { name: `structorizer-mcp-${short}/package.json`, data: readFileSync(path.join(mcp, 'package.json')) },
  { name: `structorizer-mcp-${short}/package-lock.json`, data: readFileSync(path.join(mcp, 'package-lock.json')) },
  { name: `structorizer-mcp-${short}/LICENSE`, data: readFileSync(license) },
], path.join(out, `structorizer-mcp-${short}.zip`));

// 4. checksums
const sums = readdirSync(out).filter((f) => /\.(zip|html)$/.test(f)).sort()
  .map((f) => `${createHash('sha256').update(readFileSync(path.join(out, f))).digest('hex')}  ${f}`);
writeFileSync(path.join(out, 'SHA256SUMS.txt'), sums.join('\n') + '\n');

for (const f of readdirSync(out)) {
  const s = statSync(path.join(out, f));
  if (s.isFile()) console.log(`${(s.size / 1024).toFixed(0).padStart(7)} KB  release/${f}`);
}
console.log(`\nStructorizer Web ${version} packaged${withGuide ? ' (with user guide PDF)' : ''}.`);
