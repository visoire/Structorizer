// SPDX-License-Identifier: GPL-3.0-or-later
// Element editor and diagram (root) editor. Esc closes every dialog (desktop issue #401).
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_COLORS, findById, type DiagramType, type Element, type ElementKind } from '../core/model';
import { translator, type TKey } from '../i18n';
import { useStore } from '../store/diagramStore';

const HINTS: Partial<Record<ElementKind, TKey>> = {
  instruction: 'hintInstruction', case: 'hintCase', parallel: 'hintParallel', try: 'hintTry',
  for: 'hintFor', jump: 'hintJump',
};

const toLines = (s: string) => s.replace(/\r\n?/g, '\n').split('\n');
const fromLines = (l: string[]) => l.join('\n');

export function Modal({ title, onClose, onOk, children, okLabel, cancelLabel }: {
  title: string; onClose: () => void; onOk?: () => void; children: React.ReactNode; okLabel?: string; cancelLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('textarea, input, select, button');
    first?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
          else if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey || e.metaKey) && onOk) { e.preventDefault(); e.stopPropagation(); onOk(); }
          e.stopPropagation();
        }}>
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{cancelLabel}</button>
          {onOk && <button type="button" className="btn primary" onClick={onOk}>{okLabel}</button>}
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <fieldset className="colors">
      <legend>{label}</legend>
      {DEFAULT_COLORS.map((c) => (
        <button key={c} type="button" className={'swatch' + (c === value ? ' on' : '')} style={{ background: '#' + c }}
          aria-label={'#' + c} aria-pressed={c === value} onClick={() => onChange(c)} />
      ))}
    </fieldset>
  );
}

export function ElementEditor() {
  const editor = useStore((s) => s.editor);
  const diagram = useStore((s) => s.diagram);
  const el = editor?.t === 'el' ? findById(diagram, editor.id)?.el ?? null : null;
  if (!editor || editor.t !== 'el' || !el) return null;
  // keyed remount: the form state is initialised synchronously from the element (no empty first frame)
  return <ElementForm key={el.id} el={el} isNew={editor.isNew} />;
}

function ElementForm({ el, isNew }: { el: Element; isNew: boolean }) {
  const lang = useStore((s) => s.lang);
  const t = translator(lang);
  const [text, setText] = useState(() => (el.kind === 'parallel' ? String(el.branches.length) : fromLines(el.text)));
  const [comment, setComment] = useState(() => fromLines(el.comment));
  const [color, setColor] = useState(el.color);
  const [disabled, setDisabled] = useState(el.disabled);

  const close = () => useStore.getState().closeEditor(isNew);
  const ok = () => {
    const comments = comment.trim() === '' ? [] : toLines(comment);
    const lines = el.kind === 'forever' ? [] : toLines(text);
    const s = useStore.getState();
    // the insertion itself was already an undo step; merge the first edit into it
    if (isNew) {
      const past = s.past;
      s.update(el.id, { text: lines, comment: comments, color, disabled });
      useStore.setState({ past: past, editor: null });
    } else {
      s.update(el.id, { text: lines, comment: comments, color, disabled });
      s.closeEditor(false);
    }
  };
  const hint = HINTS[el.kind];

  return (
    <Modal title={t(('kind.' + el.kind) as TKey)} onClose={close} onOk={ok} okLabel={t('ok')} cancelLabel={t('cancel')}>
      {el.kind !== 'forever' && (
        <label className="field">
          <span>{t('text')}</span>
          {el.kind === 'parallel'
            ? <input type="number" min={1} max={20} value={text} onChange={(e) => setText(e.target.value)} />
            : <textarea rows={Math.min(10, Math.max(3, text.split('\n').length + 1))} value={text} spellCheck={false}
                autoCapitalize="off" autoCorrect="off" onChange={(e) => setText(e.target.value)} />}
          {hint && <small className="hint">{t(hint)}</small>}
        </label>
      )}
      <label className="field">
        <span>{t('comment')}</span>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <ColorPicker value={color} onChange={setColor} label={t('color')} />
      <label className="check"><input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} /> {t('disabled')}</label>
      <small className="hint">{t('hintKeys')}</small>
    </Modal>
  );
}

export function DiagramEditor() {
  const open = useStore((s) => s.editor?.t === 'root');
  return open ? <DiagramForm /> : null;
}

function DiagramForm() {
  const diagram = useStore((s) => s.diagram);
  const lang = useStore((s) => s.lang);
  const t = translator(lang);
  const [text, setText] = useState(() => fromLines(diagram.text));
  const [comment, setComment] = useState(() => fromLines(diagram.comment));
  const [type, setType] = useState<DiagramType>(diagram.diagramType);
  const [boxed, setBoxed] = useState(diagram.boxed);
  const [author, setAuthor] = useState(diagram.meta.author ?? '');
  const [includes, setIncludes] = useState(() => diagram.includeList.join('\n'));
  const [color, setColor] = useState(diagram.color);

  const close = () => useStore.getState().closeEditor(false);
  const ok = () => {
    const s = useStore.getState();
    s.commit({
      ...s.diagram,
      text: toLines(text).filter((l, i) => i === 0 || l.trim() !== ''),
      comment: comment.trim() === '' ? [] : toLines(comment),
      diagramType: type,
      boxed,
      color,
      includeList: includes.split(/[\n,]/).map((x) => x.trim()).filter((x) => x !== ''),
      meta: { ...s.diagram.meta, author: author.trim() || undefined },
    });
    s.closeEditor(false);
  };
  return (
    <Modal title={t('diagramProps')} onClose={close} onOk={ok} okLabel={t('ok')} cancelLabel={t('cancel')}>
      <label className="field"><span>{t('diagramName')}</span>
        <textarea rows={2} value={text} spellCheck={false} autoCapitalize="off" onChange={(e) => setText(e.target.value)} /></label>
      <label className="field"><span>{t('comment')}</span>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
      <fieldset className="radio-row">
        <legend>{t('diagramType')}</legend>
        {(['program', 'sub', 'includable'] as DiagramType[]).map((dt) => (
          <label key={dt}><input type="radio" name="dtype" checked={type === dt} onChange={() => setType(dt)} /> {t(('type.' + dt) as TKey)}</label>
        ))}
      </fieldset>
      <label className="check"><input type="checkbox" checked={boxed} onChange={(e) => setBoxed(e.target.checked)} /> {t('boxed')}</label>
      <label className="field"><span>{t('author')}</span>
        <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} /></label>
      <label className="field"><span>{t('includeList')}</span>
        <textarea rows={2} value={includes} onChange={(e) => setIncludes(e.target.value)} /></label>
      <ColorPicker value={color} onChange={setColor} label={t('color')} />
    </Modal>
  );
}
