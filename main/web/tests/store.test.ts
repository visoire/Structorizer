import { beforeEach, describe, expect, it } from 'vitest';
import { createDiagram } from '../src/core/model';
import { useStore } from '../src/store/diagramStore';

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
});
