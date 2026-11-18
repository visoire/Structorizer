// SPDX-License-Identifier: GPL-3.0-or-later
// Scene -> standalone SVG markup. Used for the screen and for SVG/PNG export, so both look identical.
import { FONT_FAMILY, FONT_SIZE } from '../layout/measure';
import type { Scene } from '../layout/layout';

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const n = (v: number) => (Math.round(v * 2) / 2).toString();

export interface SvgOptions {
  /** Scale factor applied via width/height (viewBox stays in layout units). */
  scale?: number;
  /** Include an XML prolog (for downloads). */
  standalone?: boolean;
  title?: string;
}

export function sceneToSvg(scene: Scene, opts: SvgOptions = {}): string {
  const scale = opts.scale ?? 1;
  const W = scene.width;
  const H = scene.height;
  const out: string[] = [];
  if (opts.standalone) out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W * scale)}" height="${n(H * scale)}" viewBox="0 0 ${n(W)} ${n(H)}"` +
    ` font-family="${esc(FONT_FAMILY)}" font-size="${FONT_SIZE}">`,
  );
  if (opts.title) out.push(`<title>${esc(opts.title)}</title>`);
  out.push(
    '<defs><pattern id="sw-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<line x1="0" y1="0" x2="0" y2="8" stroke="#7a7a7a" stroke-width="1.5"/></pattern></defs>',
  );
  out.push('<g shape-rendering="crispEdges" stroke="#000" stroke-width="1" fill="none">');
  for (const it of scene.items) {
    switch (it.t) {
      case 'rect':
        out.push(
          `<rect x="${n(it.x + 0.5)}" y="${n(it.y + 0.5)}" width="${n(it.w)}" height="${n(it.h)}"` +
          (it.rx ? ` rx="${it.rx}"` : '') +
          ` fill="${it.fill ?? 'none'}"${it.stroke === false ? ' stroke="none"' : ''}/>`,
        );
        break;
      case 'line':
        out.push(`<line x1="${n(it.x1 + 0.5)}" y1="${n(it.y1 + 0.5)}" x2="${n(it.x2 + 0.5)}" y2="${n(it.y2 + 0.5)}"${it.dashed ? ' stroke-dasharray="4 3"' : ''}/>`);
        break;
      case 'poly': {
        const pts = it.points.map(([x, y]) => `${n(x + 0.5)},${n(y + 0.5)}`).join(' ');
        out.push(it.closed ? `<polygon points="${pts}" fill="${it.fill ?? 'none'}"/>` : `<polyline points="${pts}"/>`);
        break;
      }
      case 'hatch':
        out.push(`<rect x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}" fill="url(#sw-hatch)" fill-opacity="0.45" stroke="none"/>`);
        break;
      case 'text':
        out.push(
          `<text x="${n(it.x)}" y="${n(it.y)}" stroke="none" fill="${it.muted ? '#666' : '#000'}"` +
          (it.anchor && it.anchor !== 'start' ? ` text-anchor="${it.anchor}"` : '') +
          (it.bold ? ' font-weight="bold"' : '') +
          ` xml:space="preserve" style="white-space:pre">${esc(it.s)}</text>`,
        );
        break;
    }
  }
  out.push('</g></svg>');
  return out.join('');
}
