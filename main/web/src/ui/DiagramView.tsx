// SPDX-License-Identifier: GPL-3.0-or-later
// Interactive diagram: tap selects, double tap edits, drag (mouse) or long press (touch) moves, pinch zooms.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createCanvasMeasure, createLayoutEngine, hitTest, nearestGap, type Gap, type Hit, type Scene } from '../core/layout';
import { isInside, sameRef } from '../core/model/tree';
import { sceneToSvg } from '../core/render/svg';
import { useStore, type Selection } from '../store/diagramStore';
import { translator } from '../i18n';

const LONG_PRESS_MS = 450;
const DRAG_THRESHOLD = 6;

interface PressState {
  pointerId: number;
  type: string;
  x: number; y: number;
  hit: Hit | null;
  dragging: boolean;
  timer: number | null;
  cancelled: boolean;
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
  const lang = useStore((s) => s.lang);
  const t = translator(lang);

  const engine = useMemo(
    () => createLayoutEngine(createCanvasMeasure(), { trueLabel: 'T', falseLabel: 'F' }),
    [],
  );
  const scene: Scene = useMemo(() => engine.layout(diagram), [engine, diagram]);
  const svg = useMemo(() => sceneToSvg(scene, { scale: zoom }), [scene, zoom]);

  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const press = useRef<PressState | null>(null);
  const lastTap = useRef<{ time: number; sel: Selection }>({ time: 0, sel: null });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [gap, setGap] = useState<Gap | null>(null);

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
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // pinch zoom start: cancel any press
      if (press.current?.timer) clearTimeout(press.current.timer);
      press.current = null;
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const pt = toScene(e.clientX, e.clientY);
    const hit = hitTest(scene, pt.x, pt.y);
    const p: PressState = { pointerId: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, hit, dragging: false, timer: null, cancelled: false };
    if (e.pointerType !== 'mouse' && hit?.t === 'el') {
      p.timer = window.setTimeout(() => { if (press.current === p && !p.cancelled) startDrag(p); }, LONG_PRESS_MS);
    }
    press.current = p;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.dist > 0) useStore.getState().setZoom(pinch.current.zoom * (d / pinch.current.dist));
      return;
    }
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (!p.dragging) {
      if (p.type === 'mouse' && moved > DRAG_THRESHOLD && p.hit?.t === 'el') {
        startDrag(p);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else if (p.type !== 'mouse' && moved > 10) {
        p.cancelled = true; // it is a scroll
        if (p.timer) clearTimeout(p.timer);
      }
      return;
    }
    const pt = toScene(e.clientX, e.clientY);
    setGap(validGap(nearestGap(scene, pt.x, pt.y), (p.hit as Extract<Hit, { t: 'el' }>).id));
  };

  const finish = (e: React.PointerEvent, cancelled: boolean) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    if (p.timer) clearTimeout(p.timer);
    press.current = null;
    const store = useStore.getState();
    if (p.dragging) {
      if (!cancelled && gap && p.hit?.t === 'el') store.move(p.hit.id, { seq: gap.ref, index: gap.index });
      setDragId(null);
      setGap(null);
      return;
    }
    if (cancelled || p.cancelled) return;
    const sel = selectionOf(p.hit);
    const now = Date.now();
    const isDouble = now - lastTap.current.time < 400 && sameSelection(lastTap.current.sel, sel);
    lastTap.current = { time: now, sel };
    store.select(sel);
    if (isDouble && sel) {
      if (sel.t === 'el') store.openEditor({ t: 'el', id: sel.id, isNew: false });
      else if (sel.t === 'root') store.openEditor({ t: 'root' });
    }
  };

  // selection overlay geometry
  const selHit = useMemo(() => {
    if (!selection) return null;
    return scene.hits.find((h) =>
      (selection.t === 'el' && h.t === 'el' && h.id === selection.id) ||
      (selection.t === 'seq' && h.t === 'seq' && sameRef(h.ref, selection.ref)) ||
      (selection.t === 'root' && h.t === 'root')) ?? null;
  }, [scene, selection]);

  // fit to window on request
  const fitTick = useStore((s) => s.fitTick);
  useEffect(() => {
    if (fitTick === 0 || !scrollRef.current) return;
    const sc = scrollRef.current;
    const z = Math.min((sc.clientWidth - 32) / scene.width, (sc.clientHeight - 32) / scene.height);
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

  const overlay = (
    <svg className="overlay" width={scene.width * zoom} height={scene.height * zoom} viewBox={`0 0 ${scene.width} ${scene.height}`} aria-hidden="true">
      {selHit && selHit.t === 'el' && (
        <>
          <rect x={selHit.head.x + 1} y={selHit.head.y + 1} width={Math.max(0, selHit.head.w - 1)} height={Math.max(0, selHit.head.h - 1)} className="sel-fill" />
          <rect x={selHit.x + 1} y={selHit.y + 1} width={Math.max(0, selHit.w - 1)} height={Math.max(0, selHit.h - 1)} className="sel-outline" />
        </>
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

  const selectedComment = selHit?.t === 'el' && selHit.comment.length > 0 ? selHit.comment.join('\n') : '';

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
        onContextMenu={(e) => { if (press.current && press.current.type !== 'mouse') e.preventDefault(); }}
        role="application"
        aria-label={t('appName')}
      >
        <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        {overlay}
      </div>
      {selectedComment && <div className="comment-pop" role="note">{selectedComment}</div>}
    </div>
  );
}
