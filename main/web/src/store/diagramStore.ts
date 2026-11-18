// SPDX-License-Identifier: GPL-3.0-or-later
// Application state (D-13: undo/redo as immutable snapshots).
import { create } from 'zustand';
import {
  cloneWithNewIds, createDiagram, createElement, findById, insertAt, removeById, shiftElement,
  updateElement, moveTo, type Diagram, type Element, type ElementKind, type ElementPatch, type Position, type SeqRef,
} from '../core/model';
import { getSeq, slotsOf } from '../core/model/tree';
import { mapSeq, replaceElement } from '../core/model/ops';
import { newId } from '../core/model/ids';

/** An open diagram that is not the active one (Arranger index). */
export interface DocSlot {
  id: string;
  diagram: Diagram;
  savedDiagram: Diagram | null;
  fileName: string | null;
  past: Diagram[];
  future: Diagram[];
}

export type DialogName = 'prefs' | 'find' | 'about' | 'keys' | 'pngMulti' | null;

export type Selection =
  | { t: 'el'; id: string }
  | { t: 'seq'; ref: SeqRef }
  | { t: 'root' }
  | null;

const MAX_UNDO = 100;

export interface EditorTarget { t: 'el'; id: string; isNew: boolean }

interface State {
  diagram: Diagram;
  savedDiagram: Diagram | null;
  fileName: string | null;
  selection: Selection;
  past: Diagram[];
  future: Diagram[];
  clipboard: Element | null;
  editor: EditorTarget | { t: 'root' } | null;
  zoom: number;
  /** id of the active document; the others live in `docs`. */
  activeId: string;
  docs: DocSlot[];
  dialog: DialogName;
  contextMenu: { x: number; y: number } | null;
  /** Incremented to ask the view to fit the diagram into the window. */
  fitTick: number;
  /** Touch helper: next insert goes before the selection (desktop: Shift + button). */
  insertBefore: boolean;
  message: { text: string; kind: 'info' | 'error' } | null;

  // actions
  commit: (d: Diagram, selection?: Selection) => void;
  load: (d: Diagram, fileName: string | null) => void;
  markSaved: (fileName?: string) => void;
  undo: () => void;
  redo: () => void;
  select: (s: Selection) => void;
  insert: (kind: ElementKind, before?: boolean) => void;
  removeSelected: () => void;
  updateSelected: (patch: ElementPatch) => void;
  update: (id: string, patch: ElementPatch) => void;
  move: (id: string, pos: Position) => void;
  shift: (delta: -1 | 1) => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  duplicate: () => void;
  toggleDisabled: () => void;
  toggleCollapsed: (value?: boolean) => void;
  openEditor: (target: State['editor']) => void;
  closeEditor: (cancelNew?: boolean) => void;
  setZoom: (z: number) => void;
  // documents (Arranger index)
  newDoc: (d?: Diagram, fileName?: string | null) => void;
  openDoc: (d: Diagram, fileName: string | null) => void;
  switchDoc: (id: string) => void;
  closeDoc: (id: string) => void;
  allDocs: () => (DocSlot & { active: boolean; dirty: boolean })[];
  restoreSession: (docs: { diagram: Diagram; fileName: string | null }[], active: number) => void;
  // more desktop functions
  clearDiagram: () => void;
  transmute: () => boolean;
  outsource: () => boolean;
  setDialog: (d: DialogName) => void;
  openContextMenu: (pos: { x: number; y: number } | null) => void;
  requestFit: () => void;
  setInsertBefore: (b: boolean) => void;
  notify: (text: string, kind?: 'info' | 'error') => void;
  navigate: (dir: 'up' | 'down' | 'left' | 'right') => void;
}

/** Where a new element goes for the current selection. */
export function insertPosition(d: Diagram, sel: Selection, before: boolean): Position {
  if (sel?.t === 'el') {
    const f = findById(d, sel.id);
    if (f) return { seq: f.parentSeq, index: before ? f.index : f.index + 1 };
  }
  if (sel?.t === 'seq') return { seq: sel.ref, index: 0 };
  return { seq: { owner: 'root' }, index: before ? 0 : d.children.length };
}

export const useStore = create<State>((set, get) => ({
  diagram: createDiagram(),
  savedDiagram: null,
  fileName: null,
  selection: null,
  past: [],
  future: [],
  clipboard: null,
  editor: null,
  zoom: 1,
  activeId: newId(),
  docs: [],
  dialog: null,
  contextMenu: null,
  fitTick: 0,
  insertBefore: false,
  message: null,

  commit: (d, selection) => {
    const { diagram, past } = get();
    if (d === diagram) return;
    set({
      diagram: d,
      past: [...past, diagram].slice(-MAX_UNDO),
      future: [],
      ...(selection !== undefined ? { selection } : {}),
    });
  },

  load: (d, fileName) => set({ diagram: d, savedDiagram: d, fileName, past: [], future: [], selection: null, editor: null }),

  markSaved: (fileName) => set((s) => ({ savedDiagram: s.diagram, fileName: fileName ?? s.fileName })),

  undo: () => {
    const { past, diagram, future } = get();
    if (past.length === 0) return;
    set({ diagram: past[past.length - 1], past: past.slice(0, -1), future: [diagram, ...future], selection: null });
  },

  redo: () => {
    const { past, diagram, future } = get();
    if (future.length === 0) return;
    set({ diagram: future[0], future: future.slice(1), past: [...past, diagram], selection: null });
  },

  select: (selection) => set({ selection }),

  insert: (kind, before = false) => {
    const { diagram, selection, commit } = get();
    const el = createElement(kind, undefined, diagram.keywords);
    const pos = insertPosition(diagram, selection, before);
    commit(insertAt(diagram, pos, el), { t: 'el', id: el.id });
    set({ editor: { t: 'el', id: el.id, isNew: true } });
  },

  removeSelected: () => {
    const { diagram, selection, commit } = get();
    if (selection?.t !== 'el') return;
    const f = findById(diagram, selection.id);
    if (!f) return;
    const next = removeById(diagram, selection.id);
    const seq = getSeq(next, f.parentSeq);
    const neighbour = seq[Math.min(f.index, seq.length - 1)];
    commit(next, neighbour ? { t: 'el', id: neighbour.id } : { t: 'seq', ref: f.parentSeq });
  },

  updateSelected: (patch) => {
    const { selection, update } = get();
    if (selection?.t === 'el') update(selection.id, patch);
  },

  update: (id, patch) => {
    const { diagram, commit } = get();
    commit(updateElement(diagram, id, patch));
  },

  move: (id, pos) => {
    const { diagram, commit } = get();
    commit(moveTo(diagram, id, pos), { t: 'el', id });
  },

  shift: (delta) => {
    const { diagram, selection, commit } = get();
    if (selection?.t === 'el') commit(shiftElement(diagram, selection.id, delta));
  },

  copy: () => {
    const { diagram, selection } = get();
    if (selection?.t !== 'el') return;
    const f = findById(diagram, selection.id);
    if (f) set({ clipboard: cloneWithNewIds(f.el) });
  },

  cut: () => {
    get().copy();
    get().removeSelected();
  },

  paste: () => {
    const { diagram, selection, clipboard, commit } = get();
    if (!clipboard) return;
    const el = cloneWithNewIds(clipboard);
    commit(insertAt(diagram, insertPosition(diagram, selection, false), el), { t: 'el', id: el.id });
  },

  duplicate: () => {
    const { diagram, selection, commit } = get();
    if (selection?.t !== 'el') return;
    const f = findById(diagram, selection.id);
    if (!f) return;
    const el = cloneWithNewIds(f.el);
    commit(insertAt(diagram, { seq: f.parentSeq, index: f.index + 1 }, el), { t: 'el', id: el.id });
  },

  toggleDisabled: () => {
    const { diagram, selection, update } = get();
    if (selection?.t !== 'el') return;
    const f = findById(diagram, selection.id);
    if (f) update(f.el.id, { disabled: !f.el.disabled });
  },

  toggleCollapsed: (value) => {
    const { diagram, selection } = get();
    if (selection?.t !== 'el') return;
    const f = findById(diagram, selection.id);
    if (!f || slotsOf(f.el).length === 0) return;
    // collapsing is a view change: not recorded in the undo history
    set({ diagram: updateElement(diagram, f.el.id, { collapsed: value ?? !f.el.collapsed }) });
  },

  openEditor: (editor) => set({ editor }),

  closeEditor: (cancelNew = false) => {
    const { editor, diagram, past } = get();
    if (cancelNew && editor?.t === 'el' && editor.isNew) {
      // cancelling the editor of a just inserted element removes it again (no undo entry)
      const prev = past[past.length - 1];
      set({ diagram: prev ?? removeById(diagram, editor.id), past: past.slice(0, -1), editor: null, selection: null });
      return;
    }
    set({ editor: null });
  },

  newDoc: (d, fileName = null) => {
    const s = get();
    const slot: DocSlot = { id: s.activeId, diagram: s.diagram, savedDiagram: s.savedDiagram, fileName: s.fileName, past: s.past, future: s.future };
    const fresh = d ?? createDiagram();
    set({
      docs: [...s.docs, slot], activeId: newId(), diagram: fresh, savedDiagram: d ? fresh : null, fileName,
      past: [], future: [], selection: null, editor: null,
    });
  },

  openDoc: (d, fileName) => {
    const s = get();
    // replace an untouched empty diagram, otherwise open next to it (nothing gets lost)
    const untouched = s.diagram.children.length === 0 && s.past.length === 0 && !s.fileName;
    if (untouched) set({ diagram: d, savedDiagram: d, fileName, past: [], future: [], selection: null, editor: null });
    else get().newDoc(d, fileName);
  },

  switchDoc: (id) => {
    const s = get();
    if (id === s.activeId) return;
    const target = s.docs.find((x) => x.id === id);
    if (!target) return;
    const current: DocSlot = { id: s.activeId, diagram: s.diagram, savedDiagram: s.savedDiagram, fileName: s.fileName, past: s.past, future: s.future };
    set({
      docs: s.docs.map((x) => (x.id === id ? current : x)),
      activeId: target.id, diagram: target.diagram, savedDiagram: target.savedDiagram, fileName: target.fileName,
      past: target.past, future: target.future, selection: null, editor: null,
    });
  },

  closeDoc: (id) => {
    const s = get();
    if (id !== s.activeId) { set({ docs: s.docs.filter((x) => x.id !== id) }); return; }
    const next = s.docs[s.docs.length - 1];
    if (!next) { set({ diagram: createDiagram(), savedDiagram: null, fileName: null, past: [], future: [], selection: null }); return; }
    set({
      docs: s.docs.slice(0, -1), activeId: next.id, diagram: next.diagram, savedDiagram: next.savedDiagram,
      fileName: next.fileName, past: next.past, future: next.future, selection: null, editor: null,
    });
  },

  allDocs: () => {
    const s = get();
    const dirtyOf = (x: { diagram: Diagram; savedDiagram: Diagram | null; past: Diagram[] }) =>
      x.diagram !== x.savedDiagram && (x.savedDiagram !== null || x.past.length > 0);
    const active = { id: s.activeId, diagram: s.diagram, savedDiagram: s.savedDiagram, fileName: s.fileName, past: s.past, future: s.future };
    return [
      { ...active, active: true, dirty: dirtyOf(active) },
      ...s.docs.map((x) => ({ ...x, active: false, dirty: dirtyOf(x) })),
    ];
  },

  restoreSession: (docs, active) => {
    if (docs.length === 0) return;
    const a = docs[Math.min(Math.max(0, active), docs.length - 1)];
    set({
      diagram: a.diagram, savedDiagram: a.diagram, fileName: a.fileName, past: [], future: [], selection: null,
      activeId: newId(),
      docs: docs.filter((x) => x !== a).map((x) => ({ id: newId(), diagram: x.diagram, savedDiagram: x.diagram, fileName: x.fileName, past: [], future: [] })),
    });
  },

  clearDiagram: () => {
    const { diagram, commit } = get();
    if (diagram.children.length === 0) return;
    commit({ ...diagram, children: [] }, null);
  },

  /** Desktop "Transmute" (Ctrl+T): change the element type where it makes sense. */
  transmute: () => {
    const { diagram, selection, commit } = get();
    if (selection?.t !== 'el') return false;
    const f = findById(diagram, selection.id);
    if (!f) return false;
    const el = f.el;
    if (el.kind === 'instruction' && el.text.length > 1) {
      // split a multi-line instruction into single instructions
      const parts = el.text.map((t) => ({ ...el, id: newId(), text: [t], comment: [] as string[] }));
      parts[0].comment = el.comment;
      commit(mapSeq(diagram, f.parentSeq, (seq) => [...seq.slice(0, f.index), ...parts, ...seq.slice(f.index + 1)]), { t: 'el', id: parts[0].id });
      return true;
    }
    const next: Partial<Record<Element['kind'], Element['kind']>> = { instruction: 'call', call: 'jump', jump: 'instruction', while: 'repeat', repeat: 'while' };
    const to = next[el.kind];
    if (!to) {
      // merge with the following instructions? desktop: sequence of instructions -> one instruction
      return false;
    }
    commit(replaceElement(diagram, el.id, (e) => {
      if ((e.kind === 'while' || e.kind === 'repeat') && (to === 'while' || to === 'repeat')) return { ...e, kind: to } as Element;
      const base = { id: e.id, text: e.text, comment: e.comment, color: e.color, disabled: e.disabled };
      return { ...base, kind: to } as Element;
    }));
    return true;
  },

  /** Desktop "Outsource": move the selected element into a new subroutine and call it. */
  outsource: () => {
    const { diagram, selection } = get();
    if (selection?.t !== 'el') return false;
    const f = findById(diagram, selection.id);
    if (!f) return false;
    const used = new Set<string>();
    get().allDocs().forEach((x) => used.add((x.diagram.text[0] ?? '').split('(')[0].trim()));
    let n = 1;
    while (used.has(`sub${n}`)) n++;
    const name = `sub${n}`;
    const call = createElement('call', [`${name}()`]);
    const sub = { ...createDiagram('sub'), text: [`${name}()`], children: [cloneWithNewIds(f.el)] };
    const replaced = mapSeq(diagram, f.parentSeq, (seq) => seq.map((e) => (e.id === f.el.id ? call : e)));
    get().commit(replaced, { t: 'el', id: call.id });
    // the new subroutine opens next to the current diagram, which stays active
    const s = get();
    set({ docs: [...s.docs, { id: newId(), diagram: sub, savedDiagram: null, fileName: null, past: [], future: [] }] });
    return true;
  },

  setDialog: (dialog) => set({ dialog, contextMenu: null }),
  openContextMenu: (contextMenu) => set({ contextMenu }),

  setZoom: (z) => set({ zoom: Math.min(3, Math.max(0.3, Math.round(z * 100) / 100)) }),

  requestFit: () => set((s) => ({ fitTick: s.fitTick + 1 })),

  setInsertBefore: (insertBefore) => set({ insertBefore }),

  notify: (text, kind = 'info') => set({ message: { text, kind } }),

  navigate: (dir) => {
    const { diagram, selection } = get();
    if (!selection || selection.t === 'root') {
      if (diagram.children[0]) set({ selection: { t: 'el', id: diagram.children[0].id } });
      return;
    }
    if (selection.t === 'seq') return;
    const f = findById(diagram, selection.id);
    if (!f) return;
    const seq = getSeq(diagram, f.parentSeq);
    if (dir === 'up' || dir === 'down') {
      const j = f.index + (dir === 'up' ? -1 : 1);
      if (j >= 0 && j < seq.length) set({ selection: { t: 'el', id: seq[j].id } });
      else if (dir === 'up' && f.parentSeq.owner !== 'root') set({ selection: { t: 'el', id: f.parentSeq.owner } });
      return;
    }
    if (dir === 'right') {
      const slots = slotsOf(f.el);
      const first = slots.find((s) => s.seq.length > 0) ?? slots[0];
      if (first) set({ selection: first.seq[0] ? { t: 'el', id: first.seq[0].id } : { t: 'seq', ref: first.ref } });
      return;
    }
    if (f.parentSeq.owner !== 'root') set({ selection: { t: 'el', id: f.parentSeq.owner } });
  },
}));

export const isDirty = (s: State) => s.diagram !== s.savedDiagram && (s.savedDiagram !== null || s.past.length > 0);
export const anyDirty = (s: State) => s.allDocs().some((d) => d.dirty);
