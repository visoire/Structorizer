import { beforeEach, describe, expect, it } from 'vitest';
import { createDiagram } from '../src/core/model';
import { anyDirty, isDirty, useStore } from '../src/store/diagramStore';

const st = () => useStore.getState();

describe('store', () => {
  beforeEach(() => st().load(createDiagram(), null));

  it('inserts after the selection and undoes', () => {
    st().insert('instruction');
    st().closeEditor(false);
    const first = st().diagram.children[0];
    st().insert('while');
    st().closeEditor(false);
    expect(st().diagram.children.map((e) => e.kind)).toEqual(['instruction', 'while']);
    st().select({ t: 'el', id: first.id });
    st().insert('call', true);
    st().closeEditor(false);
    expect(st().diagram.children.map((e) => e.kind)).toEqual(['call', 'instruction', 'while']);
    st().undo();
    expect(st().diagram.children.length).toBe(2);
    st().redo();
    expect(st().diagram.children.length).toBe(3);
  });

  it('cancelling the editor of a new element removes it without an undo entry', () => {
    st().insert('instruction');
    expect(st().diagram.children.length).toBe(1);
    st().closeEditor(true);
    expect(st().diagram.children.length).toBe(0);
    expect(st().past.length).toBe(0);
  });

  it('inserts into a selected empty branch', () => {
    st().insert('alternative');
    st().closeEditor(false);
    const alt = st().diagram.children[0];
    st().select({ t: 'seq', ref: { owner: alt.id, slot: 'else' } });
    st().insert('jump');
    st().closeEditor(false);
    const a = st().diagram.children[0];
    expect(a.kind === 'alternative' && a.elseBranch[0].kind).toBe('jump');
  });

  it('copies, pastes and deletes', () => {
    st().insert('repeat');
    st().closeEditor(false);
    st().copy();
    st().paste();
    expect(st().diagram.children.length).toBe(2);
    expect(st().diagram.children[0].id).not.toBe(st().diagram.children[1].id);
    st().removeSelected();
    expect(st().diagram.children.length).toBe(1);
  });

  it('tracks unsaved changes across active and background diagrams', () => {
    useStore.setState({ docs: [] });
    st().load(createDiagram(), null);
    expect(isDirty(st())).toBe(false);
    expect(anyDirty(st())).toBe(false);

    st().insert('instruction');
    st().closeEditor(false);
    expect(isDirty(st())).toBe(true);
    expect(anyDirty(st())).toBe(true);

    // switch to a clean new diagram while first remains unsaved in background
    st().newDoc(createDiagram(), 'second.nsd');
    expect(isDirty(st())).toBe(false);
    expect(anyDirty(st())).toBe(true);

    st().closeDoc(st().activeId);
    st().markSaved('first.nsd');
    expect(isDirty(st())).toBe(false);
    expect(anyDirty(st())).toBe(false);
  });

  it('extends multi-selection with Shift+Up/Down and supports range operations and transmute merge (P1-28, P1-30)', () => {
    st().insert('instruction');
    st().closeEditor(false);
    st().updateSelected({ text: ['a <- 1'] });
    st().insert('instruction');
    st().closeEditor(false);
    st().updateSelected({ text: ['b <- 2'] });
    st().insert('instruction');
    st().closeEditor(false);
    st().updateSelected({ text: ['c <- 3'] });

    const [e0, e1] = st().diagram.children;
    st().select({ t: 'el', id: e0.id });
    st().extendSelection('down');
    expect(st().selection).toEqual({ t: 'el', id: e1.id, anchorId: e0.id, ids: [e0.id, e1.id] });

    // Transmute merges the two selected instructions into a single multi-line instruction
    expect(st().transmute()).toBe(true);
    expect(st().diagram.children.length).toBe(2);
    expect(st().diagram.children[0].text).toEqual(['a <- 1', 'b <- 2']);

    // Transmute on the multi-line instruction splits it back and selects the range
    expect(st().transmute()).toBe(true);
    expect(st().diagram.children.length).toBe(3);
    const sel = st().selection;
    expect(sel && sel.t === 'el' && sel.ids?.length).toBe(2);

    // Shift moves the two-element range down past the third element
    st().shift(1);
    expect(st().diagram.children.map((e) => e.text[0])).toEqual(['c <- 3', 'a <- 1', 'b <- 2']);

    // Delete removes the entire selected range
    st().removeSelected();
    expect(st().diagram.children.map((e) => e.text[0])).toEqual(['c <- 3']);
  });

  it('colours branch header triangles of IF and CASE elements (P1-29)', () => {
    st().insert('alternative');
    st().closeEditor(false);
    const alt = st().diagram.children[0];
    st().select({ t: 'el', id: alt.id, branchHead: 0 });
    st().setBranchColor('80ff80');
    const updated = st().diagram.children[0];
    expect(updated.kind === 'alternative' && updated.branchHeadColors).toEqual(['80ff80', '']);
  });
});
