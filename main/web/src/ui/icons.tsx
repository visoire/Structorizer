// SPDX-License-Identifier: GPL-3.0-or-later
// Small inline icons (own drawings, no icon font, no network).
import type { ElementKind } from '../core/model';

const S = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true } as const;

export function KindIcon({ kind }: { kind: ElementKind }) {
  switch (kind) {
    case 'instruction': return <svg {...S}><rect x="3" y="7" width="18" height="10" /></svg>;
    case 'call': return <svg {...S}><rect x="3" y="7" width="18" height="10" /><path d="M6 7v10M18 7v10" /></svg>;
    case 'jump': return <svg {...S}><rect x="3" y="7" width="18" height="10" /><path d="M7 7l-4 5 4 5" /></svg>;
    case 'alternative': return <svg {...S}><rect x="3" y="4" width="18" height="16" /><path d="M3 4l9 7 9-7M3 11h18M12 11v9" /></svg>;
    case 'case': return <svg {...S}><rect x="3" y="4" width="18" height="16" /><path d="M3 4l13 7 5-7M3 11h18M8 11v9M13 11v9M16 11v9" /></svg>;
    case 'for': return <svg {...S}><rect x="3" y="4" width="18" height="16" /><path d="M7 9h14v11M7 9v11" /><circle cx="5" cy="6.5" r="0.6" fill="currentColor" /></svg>;
    case 'while': return <svg {...S}><rect x="3" y="4" width="18" height="16" /><path d="M7 9h14M7 9v11" /></svg>;
    case 'repeat': return <svg {...S}><rect x="3" y="4" width="18" height="16" /><path d="M7 4v11h14" /></svg>;
    case 'forever': return <svg {...S}><rect x="3" y="4" width="18" height="16" /><path d="M7 8h14M7 8v8h14" /></svg>;
    case 'parallel': return <svg {...S}><rect x="3" y="4" width="18" height="16" /><path d="M3 8h18M3 16h18M12 8v8M3 7l2-3M19 4l2 3M3 17l2 3M19 20l2-3" /></svg>;
    case 'try': return <svg {...S}><rect x="3" y="4" width="18" height="16" /><path d="M7 8h14M7 8v4h14M10 15h11M10 15v5" /></svg>;
  }
}

type IconName = 'new' | 'open' | 'save' | 'undo' | 'redo' | 'edit' | 'delete' | 'cut' | 'copy' | 'paste'
  | 'duplicate' | 'up' | 'down' | 'disable' | 'collapse' | 'zoomIn' | 'zoomOut' | 'zoomFit' | 'image' | 'info' | 'diagram' | 'before' | 'panel' | 'play';

export function Icon({ name }: { name: IconName }) {
  switch (name) {
    case 'new': return <svg {...S}><path d="M6 3h8l4 4v14H6z M14 3v4h4 M12 11v6 M9 14h6" /></svg>;
    case 'open': return <svg {...S}><path d="M3 7h6l2 2h10v10H3z" /></svg>;
    case 'save': return <svg {...S}><path d="M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6" /></svg>;
    case 'undo': return <svg {...S}><path d="M9 7L4 12l5 5 M4 12h11a5 5 0 0 1 0 10h-3" /></svg>;
    case 'redo': return <svg {...S}><path d="M15 7l5 5-5 5 M20 12H9a5 5 0 0 0 0 10h3" /></svg>;
    case 'edit': return <svg {...S}><path d="M4 20h4L19 9l-4-4L4 16z M13 7l4 4" /></svg>;
    case 'delete': return <svg {...S}><path d="M5 7h14 M9 7V4h6v3 M7 7l1 13h8l1-13" /></svg>;
    case 'cut': return <svg {...S}><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8 16L18 4 M16 16L6 4" /></svg>;
    case 'copy': return <svg {...S}><rect x="8" y="8" width="12" height="12" /><path d="M4 16V4h12" /></svg>;
    case 'paste': return <svg {...S}><rect x="5" y="5" width="14" height="16" /><path d="M9 5V3h6v2 M9 11h6 M9 15h6" /></svg>;
    case 'duplicate': return <svg {...S}><rect x="4" y="4" width="11" height="7" /><rect x="9" y="13" width="11" height="7" /></svg>;
    case 'up': return <svg {...S}><path d="M12 19V5 M6 11l6-6 6 6" /></svg>;
    case 'down': return <svg {...S}><path d="M12 5v14 M6 13l6 6 6-6" /></svg>;
    case 'disable': return <svg {...S}><rect x="4" y="6" width="16" height="12" /><path d="M4 18L20 6" /></svg>;
    case 'collapse': return <svg {...S}><rect x="4" y="5" width="16" height="14" /><path d="M8 12h8" /></svg>;
    case 'zoomIn': return <svg {...S}><circle cx="10" cy="10" r="6" /><path d="M15 15l5 5 M7 10h6 M10 7v6" /></svg>;
    case 'zoomOut': return <svg {...S}><circle cx="10" cy="10" r="6" /><path d="M15 15l5 5 M7 10h6" /></svg>;
    case 'zoomFit': return <svg {...S}><path d="M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5" /></svg>;
    case 'image': return <svg {...S}><rect x="3" y="5" width="18" height="14" /><path d="M3 16l5-5 4 4 3-3 6 6" /><circle cx="16" cy="9" r="1.5" /></svg>;
    case 'info': return <svg {...S}><circle cx="12" cy="12" r="9" /><path d="M12 11v6 M12 7.5v.5" /></svg>;
    case 'diagram': return <svg {...S}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 8h18" /></svg>;
    case 'panel': return <svg {...S}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16 M17 8h2 M17 11h2" /></svg>;
    case 'before': return <svg {...S}><path d="M12 20V8 M7 13l5-5 5 5 M5 4h14" /></svg>;
    case 'play': return <svg {...S}><polygon points="7,5 19,12 7,19" fill="currentColor" stroke="none" /></svg>;
  }
}
