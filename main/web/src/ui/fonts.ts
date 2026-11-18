// SPDX-License-Identifier: GPL-3.0-or-later
// Local font choices. Only fonts installed on the device are used (no download, GDPR).
import { setDiagramFont } from '../core/layout/measure';
import { usePrefs } from '../store/prefsStore';

export type FontId = 'system' | 'arial' | 'verdana' | 'serif' | 'mono' | 'rounded' | 'custom';

export const FONT_STACKS: Record<Exclude<FontId, 'custom'>, string> = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  arial: 'Arial, Helvetica, "Liberation Sans", sans-serif',
  verdana: 'Verdana, Tahoma, "DejaVu Sans", sans-serif',
  serif: 'Georgia, "Times New Roman", "Liberation Serif", serif',
  mono: 'Consolas, "Cascadia Mono", Menlo, "DejaVu Sans Mono", monospace',
  rounded: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", sans-serif',
};
export const FONT_IDS: FontId[] = ['system', 'arial', 'verdana', 'serif', 'mono', 'rounded', 'custom'];

/** CSS font-family for a choice; a custom name is quoted and gets a sans-serif fallback. */
export function fontStack(id: FontId, custom: string): string {
  if (id !== 'custom') return FONT_STACKS[id];
  const name = custom.replace(/["\\;{}<>]/g, '').trim();
  return name ? `"${name}", ${FONT_STACKS.system}` : FONT_STACKS.system;
}

/** Apply the diagram font from the preferences to the layout engine. */
export function applyDiagramFont(): void {
  const p = usePrefs.getState();
  setDiagramFont(fontStack(p.diagramFont, p.customDiagramFont), p.diagramFontSize);
}

/** Apply the UI font to the page (CSS variable used by the stylesheet). */
export function applyUiFont(): void {
  const p = usePrefs.getState();
  document.documentElement.style.setProperty('--ui-font', fontStack(p.uiFont, p.customUiFont));
}
