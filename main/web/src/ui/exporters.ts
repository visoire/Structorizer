// SPDX-License-Identifier: GPL-3.0-or-later
// Browser-only file helpers: download, open, SVG/PNG export. No network access.
import { readNsd, writeNsd, suggestFileName, type ReadResult } from '../core/io';
import { createLayoutEngine, createCanvasMeasure } from '../core/layout';
import { sceneToSvg } from '../core/render/svg';
import type { Diagram } from '../core/model';

declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type SaveHandle = { createWritable(): Promise<{ write(d: Blob | string): Promise<void>; close(): Promise<void> }>; name: string };
type PickerWindow = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<SaveHandle>;
  showOpenFilePicker?: (o: unknown) => Promise<{ getFile(): Promise<File> }[]>;
};

let lastHandle: SaveHandle | null = null;

const nsdTypes = [{ description: 'Structorizer diagram', accept: { 'application/xml': ['.nsd'] } }];

/** Save as .nsd. Uses the File System Access API when available (Chromium), else a download. */
export async function saveDiagram(d: Diagram, saveAs: boolean): Promise<string | null> {
  const xml = writeNsd(withChangeInfo(d), APP_VERSION);
  const w = window as PickerWindow;
  if (w.showSaveFilePicker) {
    try {
      if (!lastHandle || saveAs) lastHandle = await w.showSaveFilePicker({ suggestedName: suggestFileName(d), types: nsdTypes });
      const writable = await lastHandle.createWritable();
      await writable.write(new Blob([xml], { type: 'application/xml' }));
      await writable.close();
      return lastHandle.name;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null;
      // fall back to download (e.g. sandboxed iframe)
    }
  }
  const name = suggestFileName(d);
  downloadBlob(new Blob([xml], { type: 'application/xml' }), name);
  return name;
}

function withChangeInfo(d: Diagram): Diagram {
  return { ...d, meta: { ...d.meta, changed: new Date().toISOString().slice(0, 10) } };
}

export function forgetSaveHandle(): void { lastHandle = null; }

export async function readFile(file: File): Promise<ReadResult> {
  const text = await file.text();
  return readNsd(text);
}

/** Open a file picker for .nsd files and return the chosen file. */
export function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.nsd,application/xml,text/xml';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function exportScene(d: Diagram, trueLabel: string, falseLabel: string) {
  return createLayoutEngine(createCanvasMeasure(), { trueLabel, falseLabel }).layout(d);
}

export function exportSvg(d: Diagram, labels: [string, string]): void {
  const svg = sceneToSvg(exportScene(d, ...labels), { standalone: true, title: d.text[0] });
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), suggestFileName(d).replace(/\.nsd$/, '.svg'));
}

export async function exportPng(d: Diagram, labels: [string, string], scale = 2): Promise<void> {
  const scene = exportScene(d, ...labels);
  const svg = sceneToSvg(scene, { scale });
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('SVG render failed')); img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(scene.width * scale);
    canvas.height = Math.ceil(scene.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('PNG encoding failed');
    downloadBlob(blob, suggestFileName(d).replace(/\.nsd$/, '.png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
