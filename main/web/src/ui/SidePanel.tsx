// SPDX-License-Identifier: GPL-3.0-or-later
// Right-hand tabbed pane like Structorizer Desktop 3.32: Arranger index and Code preview.
import { useEffect, useMemo, useRef, useState } from 'react';
import { generateCode, LANGUAGES, type LangId } from '../core/gen/generators';
import { parseSignature } from '../core/lang/analyze';
import { translator } from '../i18n';
import { useStore } from '../store/diagramStore';
import { usePrefs } from '../store/prefsStore';
import { actions } from './actions';
import { STRUCTORIZER_VERSION } from './exporters';

function CodePreview() {
  const diagram = useStore((s) => s.diagram);
  const docs = useStore((s) => s.docs);
  const selection = useStore((s) => s.selection);
  const p = usePrefs();
  const t = translator(p.lang);
  const [copied, setCopied] = useState(false);
  const pool = useMemo(() => [diagram, ...docs.map((d) => d.diagram)], [diagram, docs]);
  const res = useMemo(
    () => generateCode(diagram, p.codeLang, { pool, involveSubroutines: p.involveSubroutines, version: STRUCTORIZER_VERSION }),
    [diagram, pool, p.codeLang, p.involveSubroutines],
  );
  const selId = selection?.t === 'el' ? selection.id : null;
  const listRef = useRef<HTMLOListElement>(null);

  // scroll the code of the selected element into view
  useEffect(() => {
    if (!selId || !listRef.current) return;
    const first = listRef.current.querySelector<HTMLElement>('li.hl');
    first?.scrollIntoView({ block: 'nearest' });
  }, [selId, res]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(res.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div className="code-preview">
      <div className="panel-tools">
        <select aria-label={t('defaultLanguage')} value={p.codeLang} onChange={(e) => p.set({ codeLang: e.target.value as LangId })}>
          {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button type="button" className="btn small" onClick={() => void copy()}>{copied ? t('copied') : t('copyCode')}</button>
        <button type="button" className="btn small" onClick={() => actions.exportCode(p.codeLang)}>{t('downloadCode')}</button>
      </div>
      <label className="check small-check">
        <input type="checkbox" checked={p.involveSubroutines} onChange={() => p.toggle('involveSubroutines')} /> {t('involveSubs')}
      </label>
      <ol className="code" ref={listRef} aria-label={t('codePreview')}>
        {res.lines.map((l, i) => {
          const owner = l.ids[l.ids.length - 1];
          const hl = !!selId && l.ids.includes(selId);
          return (
            <li key={i} className={hl ? 'hl' : undefined}
              onClick={() => { if (owner) useStore.getState().select({ t: 'el', id: owner }); }}>
              <code>{l.s || ' '}</code>
            </li>
          );
        })}
      </ol>
      <p className="hint small panel-foot">{t('generatedHint')}</p>
    </div>
  );
}

function ArrangerIndex() {
  const s = useStore();
  const lang = usePrefs((p) => p.lang);
  const t = translator(lang);
  const docs = s.allDocs();
  const groups: { label: string; type: 'program' | 'sub' | 'includable' }[] = [
    { label: t('mainPrograms'), type: 'program' },
    { label: t('subroutines'), type: 'sub' },
    { label: t('includables'), type: 'includable' },
  ];
  return (
    <div className="arranger">
      <div className="panel-tools">
        <button type="button" className="btn small" onClick={actions.newDiagram}>+ {t('newDiagram')}</button>
        <button type="button" className="btn small" onClick={() => void actions.open()}>{t('open')}</button>
      </div>
      {groups.map((g) => {
        const list = docs.filter((d) => d.diagram.diagramType === g.type)
          .sort((a, b) => parseSignature(a.diagram).name.localeCompare(parseSignature(b.diagram).name));
        if (list.length === 0) return null;
        return (
          <section key={g.type} className="arr-group">
            <h3>{g.label}</h3>
            <ul>
              {list.map((d) => {
                const sig = parseSignature(d.diagram);
                const label = g.type === 'sub' ? `${sig.name}(${sig.params.length})` : sig.name;
                return (
                  <li key={d.id} className={d.active ? 'on' : undefined}>
                    <button type="button" className="arr-item" title={d.fileName ?? d.diagram.text.join(' ')}
                      onClick={() => {
                        s.switchDoc(d.id);
                        if (window.innerWidth < 1100) usePrefs.getState().set({ panelOpen: false });
                      }}>
                      <span className={'arr-icon ' + g.type} aria-hidden="true" />
                      <span className="arr-name">{label}</span>
                      {d.dirty && <span className="dot" aria-label={t('unsaved')}>•</span>}
                      {d.fileName && <span className="arr-file">{d.fileName}</span>}
                    </button>
                    <button type="button" className="arr-close" aria-label={t('closeDiagram')} title={t('closeDiagram')}
                      onClick={() => actions.closeDiagram(d.id)}>×</button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function SidePanel() {
  const p = usePrefs();
  const t = translator(p.lang);
  const drag = useRef<{ x: number; w: number } | null>(null);

  if (!p.panelOpen) return null;
  return (
    <aside className="side-panel" style={{ ['--panel-w' as string]: `${p.panelWidth}px` }} aria-label={t('openPanel')}>
      <div className="panel-resize" role="separator" aria-orientation="vertical"
        onPointerDown={(e) => { drag.current = { x: e.clientX, w: p.panelWidth }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const w = Math.min(Math.max(260, drag.current.w - (e.clientX - drag.current.x)), Math.min(900, window.innerWidth - 320));
          p.set({ panelWidth: Math.round(w) });
        }}
        onPointerUp={() => { drag.current = null; }} />
      <div className="panel-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={p.panelTab === 'index'} onClick={() => p.set({ panelTab: 'index' })}>{t('arrangerIndex')}</button>
        <button type="button" role="tab" aria-selected={p.panelTab === 'code'} onClick={() => p.set({ panelTab: 'code' })}>{t('codePreview')}</button>
        <button type="button" className="panel-x" aria-label={t('closePanel')} title={t('closePanel')} onClick={() => p.set({ panelOpen: false })}>×</button>
      </div>
      <div className="panel-body">
        {p.panelTab === 'code' ? <CodePreview /> : <ArrangerIndex />}
      </div>
    </aside>
  );
}
