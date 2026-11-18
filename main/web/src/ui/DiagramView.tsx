// SPDX-License-Identifier: GPL-3.0-or-later
// Interactive diagram: tap selects, double tap edits, drag (mouse) or long press (touch) moves, pinch zooms.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createLayoutEngine, hitBranchHead, hitTest, nearestGap, type Gap, type Hit, type Scene } from '../core/layout';
import { DEFAULT_COLORS, findById, type ElementKind } from '../core/model';
import { isInside, sameRef } from '../core/model/tree';
import { sceneToSvg } from '../core/render/svg';
import { selectedIds, useStore, type Selection } from '../store/diagramStore';
import { useTranslator, type TKey } from '../i18n';
import { resolvedTheme, usePrefs } from '../store/prefsStore';
import { actions } from './actions';
import { measure, viewLayoutOptions } from './exporters';
import { Icon, KindIcon } from './icons';
import { DishGeometry, getCoalescedPoints, HardwareFeatureDetector, TouchArbitrator } from './ipad';

const LONG_PRESS_MS = 450;
const PEN_HOLD_MS = 220;
const DRAG_THRESHOLD = 6;
const DISH_KINDS: ElementKind[] = ['instruction', 'alternative', 'case', 'for', 'while', 'repeat', 'forever', 'call', 'jump', 'parallel', 'try'];

interface PressState {
  pointerId: number;
  type: string;
  x: number; y: number;
  hit: Hit | null;
  dragging: boolean;
  timer: number | null;
  cancelled: boolean;
  /** moved after the drag started (otherwise a long press opens the context menu) */
  movedInDrag?: boolean;
}

function selectionOf(hit: Hit | null): Selection {
  if (!hit) return null;
  if (hit.t === 'el') return { t: 'el', id: hit.id };
  if (hit.t === 'seq') return { t: 'seq', ref: hit.ref };
  return { t: 'root' };
}

function sameSelection(a: Selection, b: Selection): boolean {
  if (!a || !b || a.t !== b.t) return false;
  if (a.t === 'el' && b.t === 'el') return a.id === b.id;
  if (a.t === 'seq' && b.t === 'seq') return sameRef(a.ref, b.ref);
  return a.t === 'root';
}

export function DiagramView() {
  const diagram = useStore((s) => s.diagram);
  const selection = useStore((s) => s.selection);
  const zoom = useStore((s) => s.zoom);
  const prefs = usePrefs();
  const t = useTranslator(prefs.lang);
  const optKey = [prefs.cOperators, prefs.highlightVars, prefs.showComments, prefs.switchTextComments, prefs.commentsPlusText, prefs.diagramFont, prefs.customDiagramFont, prefs.diagramFontSize].join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const engine = useMemo(() => createLayoutEngine(measure(), viewLayoutOptions()), [optKey]);
  const scene: Scene = useMemo(() => engine.layout(diagram), [engine, diagram]);
  const [sysDark, setSysDark] = useState(() => resolvedTheme('system') === 'dark');
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSysDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const dark = (prefs.theme === 'dark' || (prefs.theme === 'system' && sysDark)) && prefs.darkDiagram;
  const svg = useMemo(() => sceneToSvg(scene, { scale: zoom, theme: dark ? 'dark' : 'light' }), [scene, zoom, dark]);

  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const press = useRef<PressState | null>(null);
  const lastTap = useRef<{ time: number; sel: Selection }>({ time: 0, sel: null });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const arbitrator = useRef(new TouchArbitrator());
  const [dragId, setDragId] = useState<string | null>(null);
  const [gap, setGap] = useState<Gap | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const quickDish = useStore((s) => s.quickDish);

  const toScene = (clientX: number, clientY: number) => {
    const r = hostRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom };
  };

  // Block native scrolling while a touch drag is active (iOS ignores touch-action changes mid-gesture).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => { if (press.current?.dragging || pinch.current) e.preventDefault(); };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  const validGap = (g: Gap | null, id: string): Gap | null => {
    if (!g) return null;
    if (g.ref.owner !== 'root' && isInside(useStore.getState().diagram, id, g.ref.owner)) return null;
    return g;
  };

  const startDrag = (p: PressState) => {
    if (!p.hit || p.hit.t !== 'el') return;
    p.dragging = true;
    setDragId(p.hit.id);
    useStore.getState().select({ t: 'el', id: p.hit.id });
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch { /* ignore */ } }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const arb = arbitrator.current.onPointerDown(e.nativeEvent);
    if (arb.reject) {
      e.preventDefault();
      return;
    }
    setHoverId(null);
    const hw = HardwareFeatureDetector.inspectPointerEvent(e.nativeEvent);
    if (hw.isSqueeze) {
      useStore.getState().openQuickDish({ x: e.clientX, y: e.clientY });
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // pinch zoom start: cancel any press
      if (press.current?.timer) clearTimeout(press.current.timer);
      press.current = null;
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      return;
    }
    if (pointers.current.size > 2) {
      if (press.current?.timer) clearTimeout(press.current.timer);
      press.current = null;
      pinch.current = null;
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const pt = toScene(e.clientX, e.clientY);
    const hit = hitTest(scene, pt.x, pt.y);
    const p: PressState = { pointerId: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, hit, dragging: false, timer: null, cancelled: false };
    if (e.pointerType !== 'mouse' && hit?.t === 'el') {
      const holdMs = e.pointerType === 'pen' ? PEN_HOLD_MS : LONG_PRESS_MS;
      p.timer = window.setTimeout(() => { if (press.current === p && !p.cancelled) startDrag(p); }, holdMs);
    }
    press.current = p;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    arbitrator.current.onPointerMove(e.nativeEvent);
    // Apple Pencil Hover (M2+ iPad Pro / Air): highlight target element before touching glass
    if (e.pointerType === 'pen' && e.buttons === 0 && !press.current) {
      const pt = toScene(e.clientX, e.clientY);
      const h = hitTest(scene, pt.x, pt.y);
      setHoverId(h?.t === 'el' ? h.id : null);
      return;
    }
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.dist > 0) useStore.getState().setZoom(pinch.current.zoom * (d / pinch.current.dist));
      return;
    }
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    const pts = getCoalescedPoints(e.nativeEvent);
    const lastPt = pts[pts.length - 1];
    const moved = Math.hypot(lastPt.x - p.x, lastPt.y - p.y);
    if (!p.dragging) {
      if ((p.type === 'mouse' || p.type === 'pen') && moved > DRAG_THRESHOLD && p.hit?.t === 'el') {
        if (p.timer) clearTimeout(p.timer);
        startDrag(p);
        p.movedInDrag = true;
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
      } else if (p.type === 'touch' && moved > 10) {
        p.cancelled = true; // it is a scroll
        if (p.timer) clearTimeout(p.timer);
      }
      return;
    }
    if (moved > 8) p.movedInDrag = true;
    if (!p.movedInDrag) return;
    const pt = toScene(lastPt.x, lastPt.y);
    setGap(validGap(nearestGap(scene, pt.x, pt.y), (p.hit as Extract<Hit, { t: 'el' }>).id));
  };

  const finish = (e: React.PointerEvent, cancelled: boolean) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (cancelled) {
      arbitrator.current.onPointerCancel(e.nativeEvent);
    } else {
      const multiAction = arbitrator.current.onPointerUp(e.nativeEvent);
      if (multiAction === 'undo') {
        if (press.current?.timer) clearTimeout(press.current.timer);
        press.current = null;
        actions.undo();
        return;
      }
      if (multiAction === 'redo') {
        if (press.current?.timer) clearTimeout(press.current.timer);
        press.current = null;
        actions.redo();
        return;
      }
    }
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    if (p.timer) clearTimeout(p.timer);
    press.current = null;
    const store = useStore.getState();
    if (p.dragging) {
      if (!cancelled && gap && p.hit?.t === 'el' && p.movedInDrag) store.move(p.hit.id, { seq: gap.ref, index: gap.index });
      else if (!cancelled && !p.movedInDrag && p.type !== 'mouse') store.openContextMenu({ x: e.clientX, y: e.clientY });
      setDragId(null);
      setGap(null);
      return;
    }
    if (cancelled || p.cancelled) return;
    const pt = toScene(e.clientX, e.clientY);
    const branchHead = hitBranchHead(p.hit, pt.x, pt.y);
    const sel: Selection = p.hit?.t === 'el' && branchHead >= 0
      ? { t: 'el', id: p.hit.id, branchHead }
      : selectionOf(p.hit);
    const now = Date.now();
    const isDouble = now - lastTap.current.time < 400 && sameSelection(lastTap.current.sel, sel);
    lastTap.current = { time: now, sel };
    if (e.shiftKey && sel?.t === 'el' && sel.branchHead === undefined) {
      store.selectRangeTo(sel.id);
    } else {
      store.select(sel);
    }
    if (isDouble) {
      if (sel?.t === 'el') store.openEditor({ t: 'el', id: sel.id, isNew: false });
      else if (e.pointerType === 'pen') store.openQuickDish({ x: e.clientX, y: e.clientY });
      else if (sel?.t === 'root') store.openEditor({ t: 'root' });
    }
  };

  // selection overlay geometry
  const selIds = useMemo(() => new Set(selectedIds(selection)), [selection]);
  const selHits = useMemo(() => {
    if (!selection || selection.t !== 'el') return [];
    return scene.hits.filter((h): h is Extract<Hit, { t: 'el' }> => h.t === 'el' && selIds.has(h.id));
  }, [scene, selection, selIds]);
  const selHit = useMemo(() => {
    if (!selection) return null;
    return scene.hits.find((h) =>
      (selection.t === 'el' && h.t === 'el' && h.id === selection.id) ||
      (selection.t === 'seq' && h.t === 'seq' && sameRef(h.ref, selection.ref)) ||
      (selection.t === 'root' && h.t === 'root')) ?? null;
  }, [scene, selection]);

  const activeBranchPoly = useMemo(() => {
    if (selection?.t !== 'el' || selection.branchHead === undefined || !selHit || selHit.t !== 'el') return null;
    return selHit.branchHeads?.[selection.branchHead] ?? null;
  }, [selection, selHit]);

  const activeBranchColor = useMemo(() => {
    if (selection?.t !== 'el' || selection.branchHead === undefined) return 'ffffff';
    const el = findById(diagram, selection.id)?.el;
    if (!el || (el.kind !== 'alternative' && el.kind !== 'case')) return 'ffffff';
    return el.branchHeadColors?.[selection.branchHead] || 'ffffff';
  }, [diagram, selection]);

  // fit to window on request
  const fitTick = useStore((s) => s.fitTick);
  useEffect(() => {
    if (fitTick === 0 || !scrollRef.current) return;
    const sc = scrollRef.current;
    const z = Math.min((sc.clientWidth - 64) / scene.width, (sc.clientHeight - 64) / scene.height);
    useStore.getState().setZoom(Math.max(0.3, Math.min(2, z)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTick]);

  // keep the selection visible
  useEffect(() => {
    if (!selHit || !scrollRef.current || !hostRef.current) return;
    const sc = scrollRef.current;
    const host = hostRef.current;
    const top = host.offsetTop + selHit.y * zoom;
    const bottom = top + Math.min(selHit.h * zoom, sc.clientHeight - 40);
    if (top < sc.scrollTop) sc.scrollTop = top - 20;
    else if (bottom > sc.scrollTop + sc.clientHeight) sc.scrollTop = bottom - sc.clientHeight + 20;
  }, [selHit, zoom]);

  const hoverHit = useMemo(() => {
    if (!hoverId || selIds.has(hoverId)) return null;
    return scene.hits.find((h): h is Extract<Hit, { t: 'el' }> => h.t === 'el' && h.id === hoverId) ?? null;
  }, [scene, hoverId, selIds]);

  const overlay = (
    <svg className="overlay" width={scene.width * zoom} height={scene.height * zoom} viewBox={`0 0 ${scene.width} ${scene.height}`} aria-hidden="true">
      {hoverHit && (
        <rect x={hoverHit.x + 1} y={hoverHit.y + 1} width={Math.max(0, hoverHit.w - 1)} height={Math.max(0, hoverHit.h - 1)} className="hover-outline" />
      )}
      {selHits.map((h) => (
        <g key={h.id}>
          {!activeBranchPoly && (
            <rect x={h.head.x + 1} y={h.head.y + 1} width={Math.max(0, h.head.w - 1)} height={Math.max(0, h.head.h - 1)} className="sel-fill" />
          )}
          <rect x={h.x + 1} y={h.y + 1} width={Math.max(0, h.w - 1)} height={Math.max(0, h.h - 1)} className="sel-outline" />
        </g>
      ))}
      {activeBranchPoly && (
        <polygon points={activeBranchPoly.map(([x, y]) => `${x},${y}`).join(' ')} className="sel-fill sel-outline" />
      )}
      {selHit && selHit.t === 'seq' && (
        <rect x={selHit.x + 1} y={selHit.y + 1} width={selHit.w - 1} height={selHit.h - 1} className="sel-fill sel-outline" />
      )}
      {selHit && selHit.t === 'root' && (
        <rect x={1.5} y={1.5} width={selHit.w - 2} height={selHit.h - 2} className="sel-outline" />
      )}
      {dragId && gap && (
        <g className="drop">
          <line x1={gap.x + 2} y1={gap.y} x2={gap.x + gap.w - 2} y2={gap.y} />
          <circle cx={gap.x + 4} cy={gap.y} r={4} />
        </g>
      )}
    </svg>
  );

  const branchPopoverPos = useMemo(() => {
    if (!activeBranchPoly) return null;
    const xs = activeBranchPoly.map((p) => p[0]);
    const ys = activeBranchPoly.map((p) => p[1]);
    return {
      left: ((Math.min(...xs) + Math.max(...xs)) / 2) * zoom,
      top: Math.max(...ys) * zoom + 6,
    };
  }, [activeBranchPoly, zoom]);

  return (
    <div className="diagram-scroll" ref={scrollRef}
      onPointerDown={(e) => { if (e.target === scrollRef.current) useStore.getState().select(null); }}>
      <div
        className={'diagram-host' + (dragId ? ' dragging' : '')}
        ref={hostRef}
        style={{ width: scene.width * zoom, height: scene.height * zoom }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onPointerLeave={() => setHoverId(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (press.current && press.current.type !== 'mouse') return;
          const pt = toScene(e.clientX, e.clientY);
          const sel = selectionOf(hitTest(scene, pt.x, pt.y));
          useStore.getState().select(sel);
          useStore.getState().openContextMenu({ x: e.clientX, y: e.clientY });
        }}
        role="application"
        aria-label={t('appName')}
      >
        <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        {overlay}
        {branchPopoverPos && (
          <div className="branch-color-bar" style={{ left: branchPopoverPos.left, top: branchPopoverPos.top }}
            onPointerDown={(e) => e.stopPropagation()}>
            {DEFAULT_COLORS.map((c) => (
              <button key={c} type="button" className={'swatch small' + (activeBranchColor === c ? ' on' : '')}
                style={{ background: '#' + c }} aria-label={'#' + c} aria-pressed={activeBranchColor === c}
                onClick={() => useStore.getState().setBranchColor(c)} />
            ))}
          </div>
        )}
      </div>
      {quickDish && <QuickDish point={quickDish} />}
    </div>
  );
}

/**
 * OwlLuna-inspired radial tool dish (Editor/InkDish.swift) at the Apple Pencil tip:
 * 11 element wells around the rim + Undo/Redo/Edit/Delete in the center 2x2 grid.
 */
function QuickDish({ point }: { point: { x: number; y: number } }) {
  const s = useStore();
  const t = useTranslator(usePrefs((p) => p.lang));
  const close = () => s.openQuickDish(null);
  const centre = DishGeometry.centre(point, { width: window.innerWidth, height: window.innerHeight });
  const spots = DishGeometry.wells(DISH_KINDS.length);
  const hasEl = s.selection?.t === 'el';

  return (
    <div className="dish-backdrop" onPointerDown={close}>
      <div
        className="ink-dish"
        role="dialog"
        aria-label={t('elements')}
        style={{
          width: DishGeometry.diameter,
          height: DishGeometry.diameter,
          left: centre.x - DishGeometry.diameter / 2,
          top: centre.y - DishGeometry.diameter / 2,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="dish-ring" aria-hidden="true" />
        {DISH_KINDS.map((k, idx) => (
          <button
            key={k}
            type="button"
            className="dish-well"
            title={t(('kind.' + k) as TKey)}
            aria-label={t(('kind.' + k) as TKey)}
            style={{
              left: DishGeometry.diameter / 2 + spots[idx].x - DishGeometry.well / 2,
              top: DishGeometry.diameter / 2 + spots[idx].y - DishGeometry.well / 2,
            }}
            onClick={(e) => {
              close();
              actions.insert(k, e.shiftKey);
            }}
          >
            <KindIcon kind={k} />
          </button>
        ))}
        <div className="dish-center">
          <button type="button" className="tool" title={t('undo')} aria-label={t('undo')} disabled={s.past.length === 0}
            onClick={() => { actions.undo(); }}><Icon name="undo" /></button>
          <button type="button" className="tool" title={t('redo')} aria-label={t('redo')} disabled={s.future.length === 0}
            onClick={() => { actions.redo(); }}><Icon name="redo" /></button>
          <button type="button" className="tool" title={t('edit')} aria-label={t('edit')}
            onClick={() => { close(); actions.editSelected(); }}><Icon name="edit" /></button>
          <button type="button" className="tool" title={t('delete')} aria-label={t('delete')} disabled={!hasEl}
            onClick={() => { close(); actions.remove(); }}><Icon name="delete" /></button>
        </div>
      </div>
    </div>
  );
}
